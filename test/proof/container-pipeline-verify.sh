#!/usr/bin/env bash
# =============================================================================
# container-pipeline-verify -- proves the two-repo container split end to end on real AWS, with the
# stage configuration owned by Repo 2:
#
#   1. Repo 1 (CodeCommit): the repo2-config-app fixture with a cicd.config.ts that declares only one
#      validation stage `ci`. `deploy-ci` provisions the image-build pipeline, which synthesizes `ci`
#      with config/ci.json (cdk-nag + schema) and only then builds and pushes the image to an immutable
#      repository, tagged with the Repo 1 commit SHA and, via packageVersionTag, its package.json
#      version 0.1.0.
#   2. Repo 2 (CodeCommit): deploy.config.ts with targets SBCD, SBCD2 and BAD that exist ONLY here, plus
#      config/<stage>.json carrying `version` and the stage configuration. `deploy-ci` provisions the CD
#      pipeline, which deploys every target from the same pinned image version, 0.1.0.
#   3. Assert: SBCD and SBCD2 deploy different values from one image tag (and SBCD ignores the
#      `greeting` baked into the image); BAD, whose config lacks the required key, fails with an error
#      naming the target and the key, and never creates a stack.
#   4. Commit a changed config/SBCD.json to Repo 2: SBCD redeploys with the new value, same image tag,
#      no image rebuild.
#   5. Push a new image from Repo 1 only (package.json bumped to 0.2.0): the `autoDeploy` target AUTO redeploys from it with its Repo 2
#      configuration, while SBCD stays on its pinned version and the deploy repository is untouched.
#   6. Promote SBCD alone to the new image by changing only `version` in config/SBCD.json: SBCD runs the
#      new version, SBCD2 stays on the old one and its stage is skipped.
#   7. Range + config-file environment: target RANGE pins `^0.1.0` and takes its account and Region
#      (us-west-1, not the pipeline's) only from config/RANGE.json. It stays on 0.1.0 while 0.2.0
#      exists; once 0.1.1 is published, the next Repo 2 commit moves it to 0.1.1 -- never to 0.2.0.
#   8. Tear everything down: both pipeline stacks, the app stacks, the ECR repo, both CodeCommit repos
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
# RANGE's Region comes only from its config/RANGE.json, so it must differ from the pipeline's.
readonly RANGE_REGION='us-west-1'
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
region_of()      { if [ "$1" = RANGE ]; then printf '%s\n' "$RANGE_REGION"; else printf '%s\n' "$REGION"; fi; }
image_marker() {
  aws ssm get-parameter --name "$(image_param "$1")" --region "$(region_of "$1")" --query Parameter.Value --output text 2>/dev/null || true
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

# The CD stack's deploy CodeBuild project (the other one is Plan).
deploy_project() {
  aws cloudformation describe-stack-resources --stack-name "$(r2_stack)" --region "$REGION" \
    --query "StackResources[?ResourceType=='AWS::CodeBuild::Project' && contains(LogicalResourceId, 'Deploy')].PhysicalResourceId | [0]" \
    --output text 2>/dev/null || true
}

# "<pipelineExecutionId> <status>" of the stage holding the given action.
stage_execution() {
  aws codepipeline get-pipeline-state --name "$1" --region "$REGION" \
    --query "stageStates[?actionStates[?actionName=='$2']].latestExecution.[pipelineExecutionId,status] | [0]" \
    --output text 2>/dev/null || true
}

# The WHOLE CodeBuild log of an action's latest execution. The validation error sits well above the
# trailing CodeBuild phase lines, so a tail is not enough to assert on it.
#
# Every Repo 2 target runs in the ONE CD deploy project, so search that project's log group for the
# app-config error instead of reconstructing a single build id from pipeline state.
config_error_log() {
  local project
  project="$(deploy_project)"
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
  aws ssm get-parameter --name "$(greeting_param "$1")" --region "$(region_of "$1")" \
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
  aws ecr describe-images --repository-name "$(ecr_repo)" --region "$REGION" --image-ids "imageTag=$1" \
    --query 'imageDetails[0].imageDigest' --output text 2>/dev/null || true
}

# The newest image's other tag than the given version: its Repo 1 commit SHA.
newest_image_tag_except() {
  aws ecr describe-images --repository-name "$(ecr_repo)" --region "$REGION" \
    --query "sort_by(imageDetails[?imageTags], &imagePushedAt)[-1].imageTags[?@ != '$1'] | [0]" --output text 2>/dev/null || true
}

# Set Repo 1's package.json version: the image build publishes it as a tag.
set_package_version() {
  node -e 'const f=process.argv[1]+"/package.json";const p=require(f);p.version=process.argv[2];require("fs").writeFileSync(f,JSON.stringify(p,null,2)+"\n")' "$1" "$2"
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
  for stage in SBCD SBCD2 BAD AUTO RANGE; do
    stack="$(app_stack "$stage")"
    if aws cloudformation describe-stacks --stack-name "$stack" --region "$(region_of "$stage")" >/dev/null 2>&1; then
      ( destroy_stack "$stack" "$(region_of "$stage")" ) || { log "teardown of $stack incomplete"; rc=1; }
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

  local rc=0 ecr_uri digest_before digest_after v1 v2
  # Globals, not locals: the EXIT trap runs after main returns, when its locals no longer exist.
  r1="$(mktemp -d)"; r2="$(mktemp -d)"
  ecr_uri="${CDK_CICD_TEST_ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/$(ecr_repo)"

  # The ECR repo is the first standalone resource; arm teardown immediately after it exists.
  aws ecr create-repository --repository-name "$(ecr_repo)" --region "$REGION" --image-tag-mutability IMMUTABLE \
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
  deployerImage: BuildImage.docker({ repositoryName: '$(ecr_repo)', tagStrategy: ImageTagStrategy.GIT_SHA, packageVersionTag: true }),
});
EOF
  printf 'v1\n' > "$r1/image-marker.txt"
  set_package_version "$r1" 0.1.0
  install_bundle "$r1"
  ensure_cc_repo "$(r1_src)" "$REGION"
  ( cc_push "$r1" "$(r1_src)" "$REGION" "Repo 1 $CDK_CICD_TEST_RUN_ID" ) || return 1
  deploy_ci "$r1" || { log 'Repo 1 deploy-ci failed'; return 1; }
  wait_for_image "$(r1_stack)" || return 1
  v1=0.1.0
  digest_before="$(image_digest "$v1")"
  local sha1; sha1="$(newest_image_tag_except "$v1")"
  if [ -n "$digest_before" ] && [ "$digest_before" != 'None' ] && [ "$(image_digest "$sha1")" = "$digest_before" ]; then
    info "deployer image ${ecr_uri}:${v1} = :${sha1} (package version and commit SHA name one image)"
  else
    log "expected ${v1} and a commit-SHA tag on one image (version '$digest_before', sha '$sha1')"; return 1
  fi

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
    // No env: account and Region come only from config/RANGE.json; version is a range.
    { stage: 'RANGE' },
  ],
});
EOF
  mkdir -p "$r2/config"
  printf '{ "version": "%s", "greeting": "delta" }\n' "$v1" > "$r2/config/AUTO.json"
  printf '{ "version": "%s", "greeting": "alpha" }\n' "$v1" > "$r2/config/SBCD.json"
  printf '{ "version": "%s", "greeting": "bravo" }\n' "$v1" > "$r2/config/SBCD2.json"
  # Missing the image schema's required `greeting`: must fail before any CloudFormation call.
  printf '{ "version": "%s", "greting": "typo" }\n' "$v1" > "$r2/config/BAD.json"
  printf '{ "version": "^0.1.0", "greeting": "echo", "aws": { "accountId": "%s", "region": "%s" } }\n' \
    "$CDK_CICD_TEST_ACCOUNT" "$RANGE_REGION" > "$r2/config/RANGE.json"
  install_bundle "$r2"
  ensure_cc_repo "$(r2_src)" "$REGION"
  ( cc_push "$r2" "$(r2_src)" "$REGION" "Repo 2 $CDK_CICD_TEST_RUN_ID" ) || return 1
  deploy_ci "$r2" || { log 'Repo 2 deploy-ci failed'; return 1; }

  local pipeline; pipeline="$(r2_pipeline)"
  [ -n "$pipeline" ] && [ "$pipeline" != 'None' ] || { log 'could not resolve the CD pipeline name'; return 1; }
  info "CD pipeline: $pipeline"

  log 'leg 3: one image tag, per-target configuration (approving each target gate)'
  wait_for_values "$pipeline" AUTO=delta SBCD=alpha SBCD2=bravo RANGE=echo || rc=1
  if aws cloudformation describe-stacks --stack-name "$(app_stack RANGE)" --region "$RANGE_REGION" >/dev/null 2>&1 \
     && [ "$(image_marker RANGE)" = 'v1' ]; then
    info "RANGE (^0.1.0) deployed 0.1.0 to ${RANGE_REGION}, the Region only its config/RANGE.json names"
  else
    log "RANGE should run 0.1.0 in ${RANGE_REGION} (marker '$(image_marker RANGE)')"; rc=1
  fi
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
  printf '{ "version": "%s", "greeting": "charlie" }\n' "$v1" > "$r2/config/SBCD.json"
  ( cc_push "$r2" "$(r2_src)" "$REGION" "Repo 2: SBCD greeting -> charlie" ) || rc=1
  if wait_for_values "$pipeline" SBCD=charlie SBCD2=bravo; then
    digest_after="$(image_digest "$v1")"
    if [ "$digest_after" = "$digest_before" ]; then
      info 'SBCD redeployed with greeting=charlie from the unchanged image digest'
    else
      log 'the image digest changed -- the config change must not need an image rebuild'; rc=1
    fi
  else
    rc=1
  fi
  # Plan found SBCD2 unchanged, so CodePipeline skipped its whole stage: no approval was requested.
  local sbcd_run sbcd2_run
  for (( i=0; i<POLL_MAX; i++ )); do
    sbcd_run="$(stage_execution "$pipeline" Deploy-SBCD)"
    sbcd2_run="$(stage_execution "$pipeline" Deploy-SBCD2)"
    [ "${sbcd2_run%%[[:space:]]*}" = "${sbcd_run%%[[:space:]]*}" ] && break
    sleep "$POLL_INTERVAL"
  done
  if [ "${sbcd2_run%%[[:space:]]*}" = "${sbcd_run%%[[:space:]]*}" ] && [ "${sbcd2_run##*[[:space:]]}" = 'Skipped' ]; then
    info 'the unchanged SBCD2 stage was Skipped in the same run -- no approval was requested for it'
  else
    log "SBCD2 should have been skipped in SBCD's run (SBCD: '$sbcd_run', SBCD2: '$sbcd2_run')"; rc=1
  fi

  # The deploy log shows short CLI commands: no generated program and no exported access keys. Count
  # event ids: the CLI prints one result page per log stream, so a per-page count is not one number.
  local deploy_log
  deploy_log="$(aws_masked logs filter-log-events --log-group-name "/aws/codebuild/$(deploy_project)" \
    --region "$REGION" --filter-pattern '?"EXPECTED_TARGET_ENVIRONMENTS" ?"export-credentials" ?"AWS_SECRET_ACCESS_KEY="' \
    --query 'events[].eventId' --output text 2>/dev/null | wc -w | tr -d ' ')"
  if [ "$deploy_log" = '0' ]; then
    info 'the deploy logs contain no inline fingerprint script and no exported credentials'
  else
    log "the deploy logs still show the inline script or exported credentials ($deploy_log matching lines)"; rc=1
  fi

  log 'leg 5: push a new image from Repo 1 only -> the autoDeploy target follows it; nothing else moves'
  local r2_head sbcd_updated i marker
  r2_head="$(aws codecommit get-branch --repository-name "$(r2_src)" --branch-name main --region "$REGION" \
               --query branch.commitId --output text 2>/dev/null)"
  sbcd_updated="$(aws cloudformation describe-stacks --stack-name "$(app_stack SBCD)" --region "$REGION" \
                    --query 'Stacks[0].LastUpdatedTime' --output text 2>/dev/null)"
  [ "$(image_marker AUTO)" = 'v1' ] || { log "AUTO should start on image v1, has '$(image_marker AUTO)'"; rc=1; }
  printf 'v2\n' > "$r1/image-marker.txt"
  set_package_version "$r1" 0.2.0
  ( cc_push "$r1" "$(r1_src)" "$REGION" "Repo 1: image marker -> v2, version 0.2.0" ) || rc=1
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
    info 'SBCD (not autoDeploy) stayed on its pinned version v1; the deploy repository did not change'
  fi
  v2=0.2.0
  if [ -n "$(image_digest "$v2")" ] && [ "$(image_digest "$v2")" != 'None' ] \
     && [ "$(image_digest "$v2")" != "$digest_before" ] && [ "$(image_digest "$v1")" = "$digest_before" ]; then
    info "the new build published ${v2} as a new image; ${v1} still names the old one, unchanged"
  else
    log "expected ${v2} on a new image and ${v1} unchanged"; rc=1
  fi
  if [ "$(aws ecr describe-repositories --repository-names "$(ecr_repo)" --region "$REGION" \
          --query 'repositories[0].imageTagMutability' --output text 2>/dev/null)" = 'IMMUTABLE' ]; then
    info 'the ECR repository is IMMUTABLE'
  else
    log 'the ECR repository is not immutable'; rc=1
  fi

  log 'leg 6: promote SBCD alone to the new version by changing only its version in Repo 2'
  printf '{ "version": "%s", "greeting": "charlie" }\n' "$v2" > "$r2/config/SBCD.json"
  ( cc_push "$r2" "$(r2_src)" "$REGION" "Repo 2: promote SBCD to ${v2}" ) || rc=1
  for (( i=0; i<POLL_MAX; i++ )); do
    approve_pending "$pipeline"
    marker="$(image_marker SBCD)"
    [ "$marker" = 'v2' ] && break
    sleep "$POLL_INTERVAL"
  done
  if [ "$marker" = 'v2' ] && [ "$(param_value SBCD)" = 'charlie' ]; then
    info "SBCD now runs version v2 (${v2}) with its unchanged greeting 'charlie'"
  else
    log "SBCD was not promoted to v2 (marker '$marker', greeting '$(param_value SBCD)')"; rc=1
  fi
  [ "$(image_marker SBCD2)" = 'v1' ] || { log "SBCD2 moved off its pinned v1 ('$(image_marker SBCD2)')"; rc=1; }
  local sbcd_run sbcd2_run
  for (( i=0; i<POLL_MAX; i++ )); do
    sbcd_run="$(stage_execution "$pipeline" Deploy-SBCD)"
    sbcd2_run="$(stage_execution "$pipeline" Deploy-SBCD2)"
    [ "${sbcd2_run%%[[:space:]]*}" = "${sbcd_run%%[[:space:]]*}" ] && break
    sleep "$POLL_INTERVAL"
  done
  if [ "${sbcd2_run%%[[:space:]]*}" = "${sbcd_run%%[[:space:]]*}" ] && [ "${sbcd2_run##*[[:space:]]}" = 'Skipped' ]; then
    info 'SBCD2 stayed on v1 and its stage was Skipped -- promotion is per target'
  else
    log "SBCD2 should have been skipped in the promotion run (SBCD: '$sbcd_run', SBCD2: '$sbcd2_run')"; rc=1
  fi

  [ "$(image_marker RANGE)" = 'v1' ] || { log "RANGE (^0.1.0) left 0.1.0 although only 0.2.0 is newer"; rc=1; }

  log 'leg 7: publish 0.1.1 -> the ^0.1.0 target moves to it on the next Repo 2 commit, never to 0.2.0'
  printf 'v3\n' > "$r1/image-marker.txt"
  set_package_version "$r1" 0.1.1
  ( cc_push "$r1" "$(r1_src)" "$REGION" "Repo 1: image marker -> v3, version 0.1.1" ) || rc=1
  # AUTO follows every push; wait for it so the next Repo 2 run does not race the autoDeploy pipeline.
  for (( i=0; i<POLL_MAX; i++ )); do
    [ "$(image_marker AUTO)" = 'v3' ] && break
    sleep "$POLL_INTERVAL"
  done
  [ "$(image_marker AUTO)" = 'v3' ] || { log 'AUTO did not follow the 0.1.1 image'; rc=1; }
  printf 'Range leg of run %s\n' "$CDK_CICD_TEST_RUN_ID" > "$r2/NOTES.md"
  ( cc_push "$r2" "$(r2_src)" "$REGION" "Repo 2: unrelated change" ) || rc=1
  for (( i=0; i<POLL_MAX; i++ )); do
    approve_pending "$pipeline"
    [ "$(image_marker RANGE)" = 'v3' ] && break
    sleep "$POLL_INTERVAL"
  done
  if [ "$(image_marker RANGE)" = 'v3' ] && [ "$(param_value RANGE)" = 'echo' ]; then
    info 'RANGE (^0.1.0) moved to 0.1.1 with no change to its config file, and skipped 0.2.0'
  else
    log "RANGE did not move to 0.1.1 (marker '$(image_marker RANGE)')"; rc=1
  fi
  if [ "$(image_marker SBCD)" = 'v2' ] && [ "$(image_marker SBCD2)" = 'v1' ]; then
    info 'SBCD stayed on 0.2.0 and SBCD2 on 0.1.0: exact versions do not float'
  else
    log "pinned targets moved (SBCD '$(image_marker SBCD)', SBCD2 '$(image_marker SBCD2)')"; rc=1
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
