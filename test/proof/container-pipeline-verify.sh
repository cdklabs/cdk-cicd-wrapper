#!/usr/bin/env bash
# =============================================================================
# container-pipeline-verify -- proves the two-repo container split end to end on real AWS, with the
# stage configuration owned by Repo 2:
#
#   1. Repo 1 (CodeCommit): the repo2-config-app fixture with a cicd.config.ts that declares only one
#      validation stage `ci`. `deploy-ci` provisions the image-build pipeline, which synthesizes `ci`
#      with config/ci.json (cdk-nag + schema) and only then builds and pushes the image as `:latest`.
#   2. Repo 2 (CodeCommit): deploy.config.ts with targets SBCD, SBCD2 and BAD that exist ONLY here, plus
#      config/<stage>.json carrying `version` and the stage configuration. `deploy-ci` provisions the CD
#      pipeline, which deploys every target from the same image tag.
#   3. Assert: SBCD and SBCD2 deploy different values from one image tag (and SBCD ignores the
#      `greeting` baked into the image); BAD, whose config lacks the required key, fails with an error
#      naming the target and the key, and never creates a stack.
#   4. Commit a changed config/SBCD.json to Repo 2: SBCD redeploys with the new value, same image tag,
#      no image rebuild.
#   5. Push a new image from Repo 1 only: the `autoDeploy` target AUTO redeploys from it with its Repo 2
#      configuration, while SBCD stays on the old image and the deploy repository is untouched.
#   6. Tear everything down: both pipeline stacks, the app stacks, the ECR repo, both CodeCommit repos
#      and the CD pipeline's target-state parameters.
#
#   bash test/proof/container-pipeline-verify.sh
#
# Uses the gitignored .env + ambient credentials, same as harness.sh; every AWS call is redacted.
# Requires the wrapper + CLI published to the CodeArtifact repo `cdk-cicd-wrapper/cdk-cicd-wrapper`.
# =============================================================================
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./harness.sh
. "$HERE/harness.sh"

readonly CA_DOMAIN='cdk-cicd-wrapper'
readonly CA_REPO='cdk-cicd-wrapper'
readonly FIXTURE='repo2-config-app'
readonly REGION='us-west-2'
readonly QUALIFIER='hnb659fds'   # the only qualifier bootstrapped in the test account
readonly POLL_INTERVAL=20
readonly POLL_MAX=90             # 30 min ceiling per wait

r1_app()       { printf 'cdkcicdtest-%s-r1\n' "$CDK_CICD_TEST_RUN_ID"; }
r1_stack()     { printf 'cdkcicdtest-%s-r1-pipeline\n' "$CDK_CICD_TEST_RUN_ID"; }
r1_src()       { printf 'cdkcicdtest-%s-r1src\n' "$CDK_CICD_TEST_RUN_ID"; }
r2_src()       { printf 'cdkcicdtest-%s-r2src\n' "$CDK_CICD_TEST_RUN_ID"; }
r2_stack()     { printf 'cdkcicdtest-%s-r2src-cd-pipeline\n' "$CDK_CICD_TEST_RUN_ID"; }   # <repository>-cd-pipeline
# The CD pipeline's own name is CloudFormation-generated, so read it from the stack.
# The stack also holds one AutoDeploy pipeline per autoDeploy target, so select by logical id: the main
# pipeline is `Cd/Pipeline` (CdPipeline...), an auto-deploy one `Cd/AutoDeploy-<stage>/Pipeline`.
r2_pipeline() {
  aws cloudformation describe-stack-resources --stack-name "$(r2_stack)" --region "$REGION" \
    --query "StackResources[?ResourceType=='AWS::CodePipeline::Pipeline' && starts_with(LogicalResourceId, 'CdPipeline')].PhysicalResourceId | [0]" \
    --output text 2>/dev/null || true
}
r2_auto_pipeline() {
  aws cloudformation describe-stack-resources --stack-name "$(r2_stack)" --region "$REGION" \
    --query "StackResources[?ResourceType=='AWS::CodePipeline::Pipeline' && starts_with(LogicalResourceId, 'CdAutoDeploy$1')].PhysicalResourceId | [0]" \
    --output text 2>/dev/null || true
}
APPROVALS=0
# Approve every pending Repo 2 manual-approval gate. The targets keep the default manualApproval:true,
# so this also proves the gate is enforced for stages the image never declared.
approve_pending() {
  local name="$1" action token stage
  while read -r action token; do
    [ -n "$token" ] && [ "$token" != 'None' ] || continue
    # </dev/null on every inner call: the AWS CLI would otherwise consume the loop's remaining input.
    stage="$(aws codepipeline get-pipeline-state --name "$name" --region "$REGION" </dev/null \
      --query "stageStates[?actionStates[?actionName=='$action']].stageName | [0]" --output text 2>/dev/null)" || continue
    if aws codepipeline put-approval-result --pipeline-name "$name" --region "$REGION" </dev/null \
         --stage-name "$stage" --action-name "$action" --token "$token" \
         --result 'summary=container-pipeline-verify auto-approve,status=Approved' >/dev/null 2>&1; then
      APPROVALS=$((APPROVALS + 1)); info "approved $action"
    fi
  done < <(aws codepipeline get-pipeline-state --name "$name" --region "$REGION" \
             --query "stageStates[].actionStates[?starts_with(actionName,'Approve-') && latestExecution.status=='InProgress'][].[actionName,latestExecution.token]" \
             --output text 2>/dev/null)
}
ecr_repo()     { printf 'cdkcicdtest-%s-deployer\n' "$CDK_CICD_TEST_RUN_ID"; }
app_stack()    { printf 'cdkcicdtest-%s-%s-r2\n' "$CDK_CICD_TEST_RUN_ID" "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"; }
greeting_param() { printf '/cdkcicdtest/%s/%s/greeting\n' "$CDK_CICD_TEST_RUN_ID" "$1"; }
image_param()    { printf '/cdkcicdtest/%s/%s/image\n' "$CDK_CICD_TEST_RUN_ID" "$1"; }
image_marker() {
  aws ssm get-parameter --name "$(image_param "$1")" --region "$REGION" --query Parameter.Value --output text 2>/dev/null || true
}

# Install the bundle's dependencies from CodeArtifact into a throwaway npmrc, producing the lockfile
# the pipeline's `npm ci` uses. node_modules never leaves this host (cc_push ignores it).
install_bundle() {
  local dir="$1" npmrc
  npmrc="$(mktemp)"
  NPM_CONFIG_USERCONFIG="$npmrc" aws codeartifact login --tool npm --domain "$CA_DOMAIN" \
    --domain-owner "$CDK_CICD_TEST_ACCOUNT" --region "$REGION" --repository "$CA_REPO" --namespace cdklabs >/dev/null 2>&1 \
    || { rm -f "$npmrc"; die 'codeartifact login failed'; }
  ( cd "$dir" && NPM_CONFIG_USERCONFIG="$npmrc" npm install --no-audit --no-fund --prefer-online >/dev/null 2>&1 ) \
    || { rm -f "$npmrc"; die "npm install failed in $dir"; }
  rm -f "$npmrc"
}

deploy_ci() {
  local dir="$1"
  ( cd "$dir" \
      && CDK_DEFAULT_ACCOUNT="$CDK_CICD_TEST_ACCOUNT" CDK_DEFAULT_REGION="$REGION" \
         AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION" \
         npx cdk-cicd deploy-ci --disposable 2>&1 | redact )
  return "${PIPESTATUS[0]}"
}

# Print the log tail of every failed CodeBuild action in a pipeline (optionally only one action).
dump_failed_logs() {
  local name="$1" action="${2:-}" filter build grp stream
  filter="status=='Failed'"
  [ -n "$action" ] && filter="status=='Failed' && actionName=='$action'"
  for build in $(aws_masked codepipeline list-action-executions --pipeline-name "$name" --region "$REGION" \
      --query "actionExecutionDetails[?$filter].output.executionResult.externalExecutionId" --output text 2>/dev/null); do
    [ -n "$build" ] && [ "$build" != 'None' ] || continue
    read -r grp stream < <(aws_masked codebuild batch-get-builds --ids "$build" --region "$REGION" \
      --query 'builds[0].logs.[groupName,streamName]' --output text 2>/dev/null) || continue
    [ -n "$grp" ] && [ "$grp" != 'None' ] || continue
    aws_masked logs get-log-events --log-group-name "$grp" --log-stream-name "$stream" --region "$REGION" \
      --limit 60 --query 'events[].message' --output text 2>/dev/null | redact | sed 's/^/    | /' || true
  done
}

# The WHOLE CodeBuild log of an action's latest execution. The validation error sits well above the
# trailing CodeBuild phase lines, so a tail is not enough to assert on it.
#
# Every Repo 2 target runs in the ONE CD deploy project, so search that project's log group for the
# app-config error instead of reconstructing a single build id from pipeline state.
config_error_log() {
  local project
  project="$(aws cloudformation describe-stack-resources --stack-name "$(r2_stack)" --region "$REGION" \
    --query "StackResources[?ResourceType=='AWS::CodeBuild::Project'].PhysicalResourceId | [0]" \
    --output text 2>/dev/null)" || return 0
  [ -n "$project" ] && [ "$project" != 'None' ] || return 0
  aws_masked logs filter-log-events --log-group-name "/aws/codebuild/$project" --region "$REGION" \
    --filter-pattern '"ConfigError"' --query 'events[].message' --output text 2>/dev/null | tr '\t' '\n' | redact || true
}

# Wait for the Repo 1 BuildImage stage to succeed.
wait_for_image() {
  local name="$1" i st failed
  for (( i=0; i<POLL_MAX; i++ )); do
    failed="$(aws_masked codepipeline get-pipeline-state --name "$name" --region "$REGION" \
      --query "stageStates[?latestExecution.status=='Failed'].stageName" --output text 2>/dev/null)" || true
    [ -n "$failed" ] && [ "$failed" != 'None' ] && { log "Repo 1 stage(s) FAILED: $failed"; dump_failed_logs "$name"; return 1; }
    st="$(aws_masked codepipeline get-pipeline-state --name "$name" --region "$REGION" \
      --query "stageStates[?stageName=='BuildImage'].latestExecution.status | [0]" --output text 2>/dev/null)" || true
    [ "$st" = 'Succeeded' ] && { info 'Repo 1 BuildImage Succeeded'; return 0; }
    sleep "$POLL_INTERVAL"
  done
  log 'Repo 1 image build did not finish in time'; dump_failed_logs "$name"; return 1
}

param_value() {
  aws ssm get-parameter --name "$(greeting_param "$1")" --region "$REGION" \
    --query Parameter.Value --output text 2>/dev/null || true
}

# Wait until the greeting parameter of each "<stage>=<value>" pair holds that value.
wait_for_values() {
  local name="$1"; shift
  local i pair stage want got all
  for (( i=0; i<POLL_MAX; i++ )); do
    approve_pending "$name"
    all=1
    for pair in "$@"; do
      stage="${pair%%=*}"; want="${pair#*=}"; got="$(param_value "$stage")"
      [ "$got" = "$want" ] || all=0
    done
    [ "$all" = 1 ] && return 0
    sleep "$POLL_INTERVAL"
  done
  log "timed out waiting for: $*"
  for pair in "$@"; do info "${pair%%=*}: got '$(param_value "${pair%%=*}")'"; done
  dump_failed_logs "$name"
  return 1
}

# The latest execution status of one pipeline action.
action_status() {
  aws_masked codepipeline get-pipeline-state --name "$1" --region "$REGION" \
    --query "stageStates[].actionStates[?actionName=='$2'][].latestExecution.status | [0]" --output text 2>/dev/null || true
}

image_digest() {
  aws ecr describe-images --repository-name "$(ecr_repo)" --region "$REGION" --image-ids imageTag=latest \
    --query 'imageDetails[0].imageDigest' --output text 2>/dev/null || true
}

tag_stack() {
  local stack="$1"
  aws cloudformation describe-stacks --stack-name "$stack" --region "$REGION" >/dev/null 2>&1 || return 0
  aws cloudformation update-stack --stack-name "$stack" --region "$REGION" --use-previous-template \
    --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM --tags "Key=$TAG_KEY,Value=$CDK_CICD_TEST_RUN_ID" >/dev/null 2>&1 || true
  aws cloudformation wait stack-update-complete --stack-name "$stack" --region "$REGION" >/dev/null 2>&1 || true
}

destroy_all() {
  local rc=0 stage stack prefix names repo t
  log 'teardown: CD pipeline, image pipeline, app stacks, ECR repo, CodeCommit repos, target state'
  for stack in "$(r2_stack)" "$(r1_stack)"; do
    tag_stack "$stack"
    if aws cloudformation describe-stacks --stack-name "$stack" --region "$REGION" >/dev/null 2>&1; then
      ( destroy_stack "$stack" "$REGION" ) || { log "teardown of $stack incomplete -- run harness.sh sweep"; rc=1; }
    fi
  done
  for stage in SBCD SBCD2 BAD AUTO; do
    stack="$(app_stack "$stage")"
    if aws cloudformation describe-stacks --stack-name "$stack" --region "$REGION" >/dev/null 2>&1; then
      ( destroy_stack "$stack" "$REGION" ) || { log "teardown of $stack incomplete"; rc=1; }
    fi
  done
  repo="$(ecr_repo)"
  case "$repo" in "$STACK_PREFIX"-*) ;; *) die "guard: refusing ECR repo $repo" ;; esac
  t="$(aws ecr list-tags-for-resource --region "$REGION" \
        --resource-arn "arn:aws:ecr:${REGION}:${CDK_CICD_TEST_ACCOUNT}:repository/${repo}" \
        --query "tags[?Key=='$TAG_KEY']|[0].Value" --output text 2>/dev/null)" || true
  if [ "$t" = "$CDK_CICD_TEST_RUN_ID" ]; then
    aws ecr delete-repository --repository-name "$repo" --region "$REGION" --force >/dev/null 2>&1 \
      && info "deleted ECR repo $repo" || { log "could not delete ECR repo $repo"; rc=1; }
  fi
  destroy_cc_repo "$(r1_src)" "$REGION" || rc=1
  destroy_cc_repo "$(r2_src)" "$REGION" || rc=1
  # CodePipeline target-state parameters are written by the deploy actions, not owned by CloudFormation.
  prefix="/cdk-cicd/deployment-state/$(r2_stack)/"
  case "$prefix" in "/cdk-cicd/deployment-state/$STACK_PREFIX-"*) ;; *) die "guard: refusing parameters under $prefix" ;; esac
  names="$(aws ssm get-parameters-by-path --path "$prefix" --recursive --region "$REGION" \
             --query 'Parameters[].Name' --output text 2>/dev/null)" || true
  if [ -n "$names" ] && [ "$names" != 'None' ]; then
    # shellcheck disable=SC2086
    aws ssm delete-parameters --names $names --region "$REGION" >/dev/null 2>&1 || rc=1
  fi
  return "$rc"
}

main() {
  load_env; ensure_run_id
  log "container-pipeline-verify (run $CDK_CICD_TEST_RUN_ID) region $REGION"
  local actual; actual="$(caller_account)" || die 'no caller identity'
  [ "$actual" = "$CDK_CICD_TEST_ACCOUNT" ] || die 'caller is not the test account'
  command -v git >/dev/null 2>&1 || die 'git is not on PATH'

  local rc=0 ecr_uri digest_before digest_after
  # Globals, not locals: the EXIT trap runs after main returns, when its locals no longer exist.
  r1="$(mktemp -d)"; r2="$(mktemp -d)"
  ecr_uri="${CDK_CICD_TEST_ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/$(ecr_repo)"

  # The ECR repo is the first standalone resource; arm teardown immediately after it exists.
  aws ecr create-repository --repository-name "$(ecr_repo)" --region "$REGION" \
    --tags "Key=$TAG_KEY,Value=$CDK_CICD_TEST_RUN_ID" >/dev/null 2>&1 || die "could not create ECR repo $(ecr_repo)"
  trap 'keep_or_destroy; rm -rf "${r1:-}" "${r2:-}"' EXIT

  # --- Repo 1: deployer image, no stages ------------------------------------------------------------
  log 'leg 1: Repo 1 -- image-build pipeline with one validation stage (ci), no deployment targets'
  cp -r "$(fixture_dir "$FIXTURE")/." "$r1/"
  printf '{ "runId": "%s" }\n' "$CDK_CICD_TEST_RUN_ID" > "$r1/run.json"
  cat > "$r1/cicd.config.ts" <<EOF
import { defineCICD, Repository, BuildImage, ImageTagStrategy } from '@cdklabs/cdk-cicd-wrapper';
// One VALIDATION stage, synthesized by the image build with config/ci.json. The deployment targets
// (SBCD, SBCD2, BAD) and their configuration live only in the deploy repository (Repo 2).
export default defineCICD({
  application: '$(r1_app)',
  qualifier: '${QUALIFIER}',
  stages: [{ name: 'ci', env: { region: '${REGION}' } }],
  repository: Repository.codecommit('$(r1_src)', 'main', { existing: true }),
  codeArtifact: { domain: '${CA_DOMAIN}', repository: '${CA_REPO}', npmScope: 'cdklabs' },
  deployerImage: BuildImage.docker({ repositoryName: '$(ecr_repo)', tagStrategy: ImageTagStrategy.LATEST }),
});
EOF
  printf 'v1\n' > "$r1/image-marker.txt"
  install_bundle "$r1"
  ensure_cc_repo "$(r1_src)" "$REGION"
  ( cc_push "$r1" "$(r1_src)" "$REGION" "Repo 1 $CDK_CICD_TEST_RUN_ID" ) || return 1
  deploy_ci "$r1" || { log 'Repo 1 deploy-ci failed'; return 1; }
  wait_for_image "$(r1_stack)" || return 1
  digest_before="$(image_digest)"
  [ -n "$digest_before" ] && [ "$digest_before" != 'None' ] || { log 'no :latest image in ECR'; return 1; }
  info "deployer image ${ecr_uri}:latest = ${digest_before%%:*}:..."

  # --- Repo 2: targets and stage configuration --------------------------------------------------------
  log 'leg 2: Repo 2 -- CD pipeline whose targets and stage configuration exist only in this repo'
  cat > "$r2/package.json" <<'EOF'
{
  "name": "cdkcicdtest-repo2",
  "version": "0.0.0",
  "private": true,
  "scripts": { "cdk": "cdk", "cdk-cicd": "cdk-cicd" },
  "dependencies": {
    "@cdklabs/cdk-cicd-wrapper": "0.0.0",
    "@cdklabs/cdk-cicd-wrapper-cli": "0.0.0",
    "aws-cdk": "^2.1029.0",
    "aws-cdk-lib": "^2.195.0",
    "constructs": "^10.3.0",
    "ts-node": "^10.9.2",
    "typescript": "~5.9.3"
  }
}
EOF
  printf '{\n  "app": "npx cdk-cicd exec deploy.config.ts"\n}\n' > "$r2/cdk.json"
  cat > "$r2/deploy.config.ts" <<EOF
import { defineDeployment, Repository } from '@cdklabs/cdk-cicd-wrapper';
const env = { account: '${CDK_CICD_TEST_ACCOUNT}', region: '${REGION}' };
export default defineDeployment({
  application: '$(r1_app)',
  qualifier: '${QUALIFIER}',
  image: '${ecr_uri}',
  repository: Repository.codecommit('$(r2_src)', 'main', { existing: true }),
  codeArtifact: { domain: '${CA_DOMAIN}', repository: '${CA_REPO}', npmScope: 'cdklabs' },
  targets: [
    // Follows every new image push automatically (its own pipeline), with Repo 2 configuration.
    { stage: 'AUTO', env, manualApproval: false, autoDeploy: true },
    { stage: 'SBCD', env },
    { stage: 'SBCD2', env },
    { stage: 'BAD', env },
  ],
});
EOF
  mkdir -p "$r2/config"
  printf '{ "version": "latest", "greeting": "delta" }\n' > "$r2/config/AUTO.json"
  printf '{ "version": "latest", "greeting": "alpha" }\n' > "$r2/config/SBCD.json"
  printf '{ "version": "latest", "greeting": "bravo" }\n' > "$r2/config/SBCD2.json"
  # Missing the image schema's required `greeting`: must fail before any CloudFormation call.
  printf '{ "version": "latest", "greting": "typo" }\n' > "$r2/config/BAD.json"
  install_bundle "$r2"
  ensure_cc_repo "$(r2_src)" "$REGION"
  ( cc_push "$r2" "$(r2_src)" "$REGION" "Repo 2 $CDK_CICD_TEST_RUN_ID" ) || return 1
  deploy_ci "$r2" || { log 'Repo 2 deploy-ci failed'; return 1; }

  local pipeline; pipeline="$(r2_pipeline)"
  [ -n "$pipeline" ] && [ "$pipeline" != 'None' ] || { log 'could not resolve the CD pipeline name'; return 1; }
  info "CD pipeline: $pipeline"

  log 'leg 3: one image tag, per-target configuration (approving each target gate)'
  wait_for_values "$pipeline" AUTO=delta SBCD=alpha SBCD2=bravo || rc=1
  if [ "$rc" = 0 ]; then
    info "SBCD=alpha, SBCD2=bravo from the same image (the image's baked SBCD greeting was ignored)"
  fi
  local i st
  for (( i=0; i<POLL_MAX; i++ )); do
    approve_pending "$pipeline"
    st="$(action_status "$pipeline" Deploy-BAD)"
    [ "$st" = 'Failed' ] || [ "$st" = 'Succeeded' ] && break
    sleep "$POLL_INTERVAL"
  done
  if [ "$st" != 'Failed' ]; then
    log "BAD target should have failed validation but its action is '$st'"; rc=1
  else
    local bad_log; bad_log="$(config_error_log | grep "target 'BAD'")"
    if printf '%s' "$bad_log" | grep -q "'greeting'" && printf '%s' "$bad_log" | grep -q "target 'BAD'"; then
      info "BAD failed validation naming the key and the target:"
      printf '%s\n' "$bad_log" | grep "'greeting'" | head -1
    else
      log 'BAD failed, but the error does not name both the key and the target:'; printf '%s\n' "$bad_log" | tail -20; rc=1
    fi
    if aws cloudformation describe-stacks --stack-name "$(app_stack BAD)" --region "$REGION" >/dev/null 2>&1; then
      log 'BAD created a CloudFormation stack despite failing validation'; rc=1
    else
      info 'BAD created no CloudFormation stack'
    fi
  fi

  log 'leg 4: change a non-version key in Repo 2 only -> redeploy, same image tag, no rebuild'
  printf '{ "version": "latest", "greeting": "charlie" }\n' > "$r2/config/SBCD.json"
  ( cc_push "$r2" "$(r2_src)" "$REGION" "Repo 2: SBCD greeting -> charlie" ) || rc=1
  if wait_for_values "$pipeline" SBCD=charlie SBCD2=bravo; then
    digest_after="$(image_digest)"
    if [ "$digest_after" = "$digest_before" ]; then
      info 'SBCD redeployed with greeting=charlie from the unchanged image digest'
    else
      log 'the image digest changed -- the config change must not need an image rebuild'; rc=1
    fi
  else
    rc=1
  fi

  log 'leg 5: push a new image from Repo 1 only -> the autoDeploy target follows it; nothing else moves'
  local r2_head sbcd_updated i marker
  r2_head="$(aws codecommit get-branch --repository-name "$(r2_src)" --branch-name main --region "$REGION" \
               --query branch.commitId --output text 2>/dev/null)"
  sbcd_updated="$(aws cloudformation describe-stacks --stack-name "$(app_stack SBCD)" --region "$REGION" \
                    --query 'Stacks[0].LastUpdatedTime' --output text 2>/dev/null)"
  [ "$(image_marker AUTO)" = 'v1' ] || { log "AUTO should start on image v1, has '$(image_marker AUTO)'"; rc=1; }
  printf 'v2\n' > "$r1/image-marker.txt"
  ( cc_push "$r1" "$(r1_src)" "$REGION" "Repo 1: image marker -> v2" ) || rc=1
  for (( i=0; i<POLL_MAX; i++ )); do
    marker="$(image_marker AUTO)"
    [ "$marker" = 'v2' ] && break
    sleep "$POLL_INTERVAL"
  done
  if [ "$marker" = 'v2' ]; then
    info "AUTO redeployed from the new image (marker v1 -> v2) with its Repo 2 greeting '$(param_value AUTO)'"
  else
    log "AUTO did not pick up the new image (marker '$marker')"; rc=1
  fi
  [ "$(param_value AUTO)" = 'delta' ] || { log 'AUTO lost its Repo 2 configuration'; rc=1; }
  if [ "$(aws codecommit get-branch --repository-name "$(r2_src)" --branch-name main --region "$REGION" \
          --query branch.commitId --output text 2>/dev/null)" != "$r2_head" ]; then
    log 'the deploy repository changed during the image-only leg'; rc=1
  fi
  if [ "$(aws cloudformation describe-stacks --stack-name "$(app_stack SBCD)" --region "$REGION" \
          --query 'Stacks[0].LastUpdatedTime' --output text 2>/dev/null)" != "$sbcd_updated" ] \
     || [ "$(image_marker SBCD)" != 'v1' ]; then
    log 'SBCD (not autoDeploy) was redeployed by an image push'; rc=1
  else
    info 'SBCD (not autoDeploy) stayed on image v1; the deploy repository did not change'
  fi

  if [ "$APPROVALS" -eq 0 ]; then
    log 'no Repo 2 approval gate was ever pending -- the default manualApproval gate was not enforced'; rc=1
  else
    info "Repo 2 enforced its manual-approval gates ($APPROVALS approvals)"
  fi

  [ "$rc" = 0 ] && log 'container-pipeline-verify PASSED: Repo 2 owned the stages and their configuration, then torn down' \
                || log 'container-pipeline-verify FAILED'
  return "$rc"
}

# `teardown` reclaims an interrupted run: CDK_CICD_TEST_RUN_ID=<id> bash container-pipeline-verify.sh teardown
if [ "${1:-}" = 'teardown' ]; then
  load_env
  [ -n "${CDK_CICD_TEST_RUN_ID:-}" ] || die 'teardown needs CDK_CICD_TEST_RUN_ID'
  destroy_all
  exit $?
fi
main "$@"
