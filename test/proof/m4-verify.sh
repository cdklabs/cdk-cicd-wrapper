#!/usr/bin/env bash
# =============================================================================
# m4-verify -- the Wave 4 exit gate. Proves the whole M4 story end to end against
# real AWS, from nothing but a cicd.config.ts:
#
#   1. Assemble the pipeline-app fixture into a deployable bundle (generate its
#      cicd.config.ts + a CodeArtifact-resolved lockfile) and upload it as the
#      pipeline's S3 source object.
#   2. `cdk-cicd deploy-ci --disposable` provisions ONE pipeline stack.
#   3. The pipeline runs: Source -> Build (CI) -> UpdatePipeline (self-mutate) ->
#      dev deploy -> prod approval -> prod deploy. The gate drives the approval via
#      `aws codepipeline put-approval-result`.
#   4. Assert the dev (us-west-2) and prod (us-west-1) app stacks really deployed,
#      and record the CodeBuild project count -- the flat-footprint claim vs Blueprint's 100+.
#   5. Tear everything down: the app stacks, the pipeline stack (its --disposable
#      bucket/key go with it), and the S3 source bucket. Nothing left behind.
#
#   bash test/proof/m4-verify.sh
#
# Uses the gitignored .env + ambient credentials, same as harness.sh. Every AWS call
# is redacted, so no account id is printed. Requires the wrapper + CLI to be published
# to the CodeArtifact repo `cdk-cicd-wrapper/cdk-cicd-wrapper` (see Taskfile.codeartifact.yml).
#
# m9 exit gate (`m9-migrate-private-registry-auth`): M4_NPM_REGISTRY=true additionally configures
# `npmRegistry` (a generic private-npm-registry basic-auth, distinct from CodeArtifact) against a
# throwaway Secrets Manager secret, then asserts every deployed CodeBuild project's buildspec really
# carries the login command + secrets-manager mapping, and best-effort-confirms a real build ran it:
#
#   M4_NPM_REGISTRY=true bash test/proof/m4-verify.sh
# =============================================================================
set -euo pipefail

M4_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./harness.sh
. "$M4_DIR/harness.sh"

readonly CA_DOMAIN='cdk-cicd-wrapper'
readonly CA_REPO='cdk-cicd-wrapper'
readonly FIXTURE='pipeline-app'
readonly DEV_REGION='us-west-2'   # dev stage (also the pipeline's own region)
readonly PROD_REGION='us-west-1'  # prod stage -- distinct region so the two stage stacks are distinct

# --- m9 `npmRegistry` (generic private-npm-registry basic-auth) knob --------------------------------
# Opt-in via M4_NPM_REGISTRY=true (see build_bundle). The URL is deliberately unresolvable and the scope
# matches none of the fixture's real dependencies, so the extra `.npmrc` entry `npmRegistryLogin` writes
# never affects what `npm ci` actually installs -- this proves the CONFIG WIRING, not a live third-party
# registry, per the task's own framing (no real npm-compatible registry is required to authenticate
# against; the CodeBuild project being correctly wired is the gate).
readonly NPM_REGISTRY_URL='https://npm-registry.m9-verify.invalid/'
readonly NPM_REGISTRY_SCOPE='m9privatereg'
npm_registry_secret_name() { printf 'cdkcicdtest-%s-npmreg\n' "$CDK_CICD_TEST_RUN_ID"; }

# Poll bounds: a cold pipeline run (5 CodeBuild stages, npm ci each) is minutes, not seconds.
readonly POLL_INTERVAL=20
readonly POLL_MAX=90   # 90 * 20s = 30 min ceiling

# --- names, all cdkcicdtest-prefixed so the teardown guard can reach them --------------------------
pipeline_stack() { printf 'cdkcicdtest-%s-pipeline\n' "$CDK_CICD_TEST_RUN_ID"; }
pipeline_name()  { printf 'cdkcicdtest-%s-pipeline\n' "$CDK_CICD_TEST_RUN_ID"; }  # PipelineApp names it <application>-pipeline
app_stack()      { printf 'cdkcicdtest-%s-app\n' "$CDK_CICD_TEST_RUN_ID"; }
src_bucket()     { printf 'cdkcicdtest-%s-m4src\n' "$CDK_CICD_TEST_RUN_ID"; }

# --- m9 npmRegistry secret: a throwaway Secrets Manager secret holding a dummy bearer token ---------
# Same region as the pipeline stack (DEV_REGION) -- CodeBuild's `secrets-manager` env mapping resolves
# same-region ARNs without extra `region:` qualification, and every CodeBuild project this pipeline
# creates lives in the pipeline stack's own region regardless of which stage/region it deploys into.
ensure_npm_registry_secret() {
  local name arn
  name="$(npm_registry_secret_name)"
  arn="$(aws secretsmanager create-secret --name "$name" --region "$DEV_REGION" \
           --secret-string 'm9-verify-dummy-token' \
           --tags "Key=$TAG_KEY,Value=$CDK_CICD_TEST_RUN_ID" \
           --query 'ARN' --output text 2>/dev/null)" \
    || die 'could not create the npm-registry secret -- refusing to continue without it'
  # >&2 deliberately, same reason as build_bundle's own log call: this function's stdout IS its return
  # value (the ARN), so an unredirected `info` here would prepend itself to the ARN the caller captures.
  info "created npm-registry secret $name" >&2
  printf '%s\n' "$arn"
}

# Guarded the same way destroy_src_bucket is: name prefix + our tag, so this can only ever delete a
# secret this run created. Best-effort beyond that -- a missing secret is not a teardown failure.
destroy_npm_registry_secret() {
  local name tag
  name="$(npm_registry_secret_name)"
  case "$name" in "$STACK_PREFIX"-*) ;; *) die "guard: refusing to delete secret '$name' -- not a cdkcicdtest secret" ;; esac
  tag="$(aws secretsmanager describe-secret --secret-id "$name" --region "$DEV_REGION" \
           --query "Tags[?Key=='${TAG_KEY}']|[0].Value" --output text 2>/dev/null)" \
    || { log "npm-registry secret '$name' not found -- nothing to delete"; return 0; }
  [ -n "$tag" ] && [ "$tag" != 'None' ] || { log "secret '$name' lacks our tag -- leaving it"; return 1; }
  aws secretsmanager delete-secret --secret-id "$name" --region "$DEV_REGION" \
      --force-delete-without-recovery >/dev/null 2>&1 \
    && info "deleted npm-registry secret $name" \
    || { log "could not delete secret $name -- check the console"; return 1; }
}

# --- CodeArtifact login into a throwaway npmrc (never touches the user's ~/.npmrc) -----------------
ca_login() {
  local npmrc="$1"
  NPM_CONFIG_USERCONFIG="$npmrc" aws codeartifact login --tool npm \
    --domain "$CA_DOMAIN" --domain-owner "$CDK_CICD_TEST_ACCOUNT" --region "$DEV_REGION" \
    --repository "$CA_REPO" --namespace cdklabs >/dev/null 2>&1 \
    || die 'codeartifact login failed -- are the packages published? (task codeartifact:publish)'
}

# --- build the deployable bundle in a temp dir (no account id reaches the repo tree) ---------------
# Echoes the bundle dir on stdout; all logging goes to stderr.
build_bundle() {
  local bundle npmrc app="cdkcicdtest-$CDK_CICD_TEST_RUN_ID" bucket
  bundle="$(mktemp -d)"
  bucket="$(src_bucket)"
  cp -r "$(fixture_dir "$FIXTURE")/." "$bundle/"

  # The run-specific config: baked (not env-driven) because the pipeline re-reads it inside CodeBuild
  # during self-update, where the gate's env vars do not exist. Account is omitted on purpose -- it
  # defaults to the pipeline's own account -- so nothing here carries an account id.
  # Which of the two deploy models (and whether the Lambda deploy driver is on) this run proves. Driven by
  # the environment so one gate script covers every combination -- the models render very different
  # pipelines, and the only way to know a mode works is to run it.
  #   M4_DEPLOY_MODEL=ASSEMBLY_PROMOTION (default) | DEPLOY_TIME_SYNTH
  #   M4_ASYNC_DEPLOY=true                         -- hand the CloudFormation wait to the Lambda driver
  #   M4_NPM_REGISTRY=true                         -- m9: also configure `npmRegistry` (see the top of
  #                                                    this file); the caller must have already created
  #                                                    the secret via ensure_npm_registry_secret and
  #                                                    exported its ARN as npm_secret_arn
  local modelLine='' asyncLine='' npmRegistryLine=''
  case "${M4_DEPLOY_MODEL:-ASSEMBLY_PROMOTION}" in
    ASSEMBLY_PROMOTION) modelLine='  deployModel: DeployModel.ASSEMBLY_PROMOTION,' ;;
    DEPLOY_TIME_SYNTH)  modelLine='  deployModel: DeployModel.DEPLOY_TIME_SYNTH,' ;;
    *) die "M4_DEPLOY_MODEL must be ASSEMBLY_PROMOTION or DEPLOY_TIME_SYNTH (got '${M4_DEPLOY_MODEL}')" ;;
  esac
  [ "${M4_ASYNC_DEPLOY:-false}" = 'true' ] && asyncLine='  asyncDeploy: true,'
  if [ "${M4_NPM_REGISTRY:-false}" = 'true' ]; then
    [ -n "${npm_secret_arn:-}" ] || die 'M4_NPM_REGISTRY=true but no secret ARN was created (see ensure_npm_registry_secret)'
    npmRegistryLine="  npmRegistry: { url: '${NPM_REGISTRY_URL}', basicAuthSecretArn: '${npm_secret_arn}', scope: '${NPM_REGISTRY_SCOPE}' },"
  fi

  cat >"$bundle/cicd.config.ts" <<EOF
import { defineCICD, DeployModel, Repository } from '@cdklabs/cdk-cicd-wrapper';

export default defineCICD({
  application: '${app}',
  repository: Repository.s3('${bucket}/app.zip'),
  codeArtifact: { domain: '${CA_DOMAIN}', repository: '${CA_REPO}', npmScope: 'cdklabs' },
${modelLine}
${asyncLine}
${npmRegistryLine}
  stages: [
    { name: 'dev', env: { region: '${DEV_REGION}' } },
    { name: 'prod', env: { region: '${PROD_REGION}' }, manualApproval: true },
  ],
});
EOF
  # >&2 deliberately: this function's stdout IS its return value (the bundle dir), and `log`/`info` print
  # to stdout, so anything logged here without redirection ends up prepended to the path the caller uses.
  log "deploy model: ${M4_DEPLOY_MODEL:-ASSEMBLY_PROMOTION}, asyncDeploy: ${M4_ASYNC_DEPLOY:-false}, npmRegistry: ${M4_NPM_REGISTRY:-false}" >&2

  # The run id has to travel INSIDE the bundle: the app is synthesized in the pipeline's CodeBuild,
  # which never sees CDK_CICD_TEST_RUN_ID. Without this the fixture fell back to `local` and deployed
  # `cdkcicdtest-local-app` while the gate asserted on the run-id name -- a deploy that looked green
  # and an assertion that looked broken. See test/fixtures/pipeline-app/lib/run-id.ts.
  printf '{ "runId": "%s" }\n' "$CDK_CICD_TEST_RUN_ID" >"$bundle/run.json"

  npmrc="$(mktemp)"
  ca_login "$npmrc"
  # --prefer-online: the wrapper is republished under the SAME version (0.0.0) between runs, and npm
  # caches tarballs by name@version, so without this a run silently installs the PREVIOUS build. That
  # cost two full gate runs -- both failed on a defect that had already been fixed and republished.
  ( cd "$bundle" && NPM_CONFIG_USERCONFIG="$npmrc" npm install --no-audit --no-fund --prefer-online >/dev/null 2>&1 ) \
    || die 'npm install of the bundle failed (CodeArtifact resolution?)'
  rm -f "$npmrc"

  # ...and prove it, rather than trusting the flag: the installed engine must be byte-identical to the one
  # just built here. A mismatch means the bundle is testing something other than this working tree, which
  # makes every downstream assertion meaningless.
  local built="$(repo_root)/packages/@cdklabs/cdk-cicd-wrapper/lib/v3/engine/codepipeline/CodePipelineEngine.js"
  local installed="$bundle/node_modules/@cdklabs/cdk-cicd-wrapper/lib/v3/engine/codepipeline/CodePipelineEngine.js"
  if [ -f "$built" ] && ! cmp -s "$built" "$installed"; then
    die "the installed @cdklabs/cdk-cicd-wrapper differs from the local build -- stale npm cache or a missed publish; run 'npm cache clean --force' and republish"
  fi
  printf '%s\n' "$bundle"
}

# --- S3 source bucket: versioned, so a re-upload is a "commit" the pipeline picks up ---------------
ensure_src_bucket() {
  local bucket="$1"
  if ! aws s3api head-bucket --bucket "$bucket" --region "$DEV_REGION" >/dev/null 2>&1; then
    aws s3api create-bucket --bucket "$bucket" --region "$DEV_REGION" \
      --create-bucket-configuration "LocationConstraint=$DEV_REGION" >/dev/null 2>&1 \
      || die "could not create source bucket"
  fi
  aws s3api put-bucket-versioning --bucket "$bucket" --region "$DEV_REGION" \
    --versioning-configuration Status=Enabled >/dev/null 2>&1 || die 'could not enable bucket versioning'
  # NOT `|| true`: the tag is the only thing that lets destroy_src_bucket touch this bucket later, so an
  # untagged source bucket is one teardown can never reclaim. Failing before the pipeline exists is much
  # cheaper than leaving a versioned bucket behind and still reporting PASSED.
  aws s3api put-bucket-tagging --bucket "$bucket" --region "$DEV_REGION" \
    --tagging "TagSet=[{Key=$TAG_KEY,Value=$CDK_CICD_TEST_RUN_ID}]" >/dev/null 2>&1 \
    || die "could not tag source bucket $bucket -- refusing to continue with a bucket teardown cannot reclaim"
}

# Empty (all versions) and delete the source bucket. Guarded on the name prefix + our tag.
destroy_src_bucket() {
  local bucket="$1" tag
  case "$bucket" in "$STACK_PREFIX"-*) ;; *) die "guard: refusing to empty '$bucket' -- not a cdkcicdtest bucket" ;; esac
  tag="$(aws s3api get-bucket-tagging --bucket "$bucket" --region "$DEV_REGION" \
           --query "TagSet[?Key=='${TAG_KEY}']|[0].Value" --output text 2>/dev/null || true)"
  # Returns non-zero on anything that leaves the bucket behind, so main_m4 can set rc: a surviving
  # versioned bucket holding the source zip must never coexist with a PASSED verdict.
  [ -n "$tag" ] && [ "$tag" != 'None' ] || { log "source bucket '$bucket' lacks our tag -- leaving it"; return 1; }
  info "emptying + deleting source bucket $bucket"
  # Delete every version AND delete-marker one at a time. The bucket has to stay versioned (a
  # CodePipeline S3 source action requires it), so `s3 rb --force` cannot empty it, and the batch
  # `delete-objects` form is worse: when the JMESPath produces an empty Objects list the call fails
  # validation, which a `|| true` hides -- that is how a run reported "emptying" and still left the
  # bucket behind. One object per call is slower and much harder to get silently wrong.
  local key vid
  while read -r key vid; do
    [ -n "$key" ] && [ "$key" != 'None' ] || continue
    aws s3api delete-object --bucket "$bucket" --region "$DEV_REGION" --key "$key" --version-id "$vid" >/dev/null 2>&1 || true
  done < <(aws s3api list-object-versions --bucket "$bucket" --region "$DEV_REGION" \
             --query '[Versions[].[Key,VersionId], DeleteMarkers[].[Key,VersionId]][]' --output text 2>/dev/null)
  if aws s3 rb "s3://$bucket" --region "$DEV_REGION" >/dev/null 2>&1; then
    info "deleted source bucket $bucket"
  else
    log "could not delete $bucket -- check the console"
    return 1
  fi
}

# Delete the deploy-plan SSM parameters. They are written by `cdk-cicd deploy --prepare-only` with
# put-parameter, so CloudFormation does not own them and destroying the pipeline stack leaves them behind
# -- only reachable when asyncDeploy is on. Guarded on the cdkcicdtest- prefixed path so this can only
# ever touch this run's parameters.
destroy_plan_parameters() {
  local prefix="/cdk-cicd/$(pipeline_name)/" names
  case "$prefix" in "/cdk-cicd/$STACK_PREFIX-"*) ;; *) die "guard: refusing to delete parameters under '$prefix'" ;; esac
  names="$(aws ssm get-parameters-by-path --path "$prefix" --recursive --region "$DEV_REGION" \
             --query 'Parameters[].Name' --output text 2>/dev/null)" || return 0
  [ -n "$names" ] && [ "$names" != 'None' ] || return 0
  for name in $names; do
    aws ssm delete-parameter --name "$name" --region "$DEV_REGION" >/dev/null 2>&1 \
      && info "deleted plan parameter $name" || log "could not delete plan parameter $name"
  done
}

# --- tag the pipeline stack so the teardown guard will accept it -----------------------------------
# deploy-ci runs `cdk deploy` with no --tags, and the guard destroys only tagged stacks, so tag it now.
tag_pipeline_stack() {
  local stack="$1"
  aws cloudformation update-stack --stack-name "$stack" --region "$DEV_REGION" \
    --use-previous-template --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
    --tags "Key=$TAG_KEY,Value=$CDK_CICD_TEST_RUN_ID" >/dev/null 2>&1 \
    || { log "tag update on $stack reported no change/failed -- teardown may need \`harness.sh sweep\`"; return 0; }
  aws cloudformation wait stack-update-complete --stack-name "$stack" --region "$DEV_REGION" >/dev/null 2>&1 || true
  info "tagged pipeline stack $stack with $TAG_KEY"
}

# --- drive the run: wait for the prod approval, approve it, wait for the pipeline to settle ---------
# Returns 0 iff the pipeline reaches Succeeded after the approval.
# Approve the prod gate whenever it is pending, and finish on EVIDENCE (both stage stacks deployed)
# rather than on a pipeline "Succeeded" state.
#
# Evidence, not state, because the pipeline legitimately churns: `restartExecutionOnUpdate` means a
# self-mutation restarts the run from Source, so stage states reset and the prod gate can become pending
# more than once. A one-shot approve + "is the last stage Succeeded" check races that churn; approving
# every time a token appears, and stopping when the deployed stacks exist, does not.
drive_pipeline() {
  local name="$1" i token approvals=0 failed
  for (( i=0; i<POLL_MAX; i++ )); do
    # NOTE the query shape: `stageStates[]` then filter. A filtered projection
    # (`stageStates[?stageName=='prod'].actionStates[?...]`) nests two projections and silently yields
    # None -- which is exactly why an earlier run sat on the gate until it timed out.
    token="$(aws_masked codepipeline get-pipeline-state --name "$name" --region "$DEV_REGION" \
      --query "stageStates[].actionStates[?actionName=='Approve-prod'][].latestExecution.token | [0]" \
      --output text 2>/dev/null)" || true
    if [ -n "$token" ] && [ "$token" != 'None' ]; then
      # `--pipeline-name`, not `--name`: put-approval-result is the one call in this API that differs.
      if aws codepipeline put-approval-result --pipeline-name "$name" --region "$DEV_REGION" \
           --stage-name prod --action-name Approve-prod --token "$token" \
           --result 'summary=m4-verify auto-approve,status=Approved' >/dev/null 2>&1; then
        approvals=$((approvals + 1))
        info "approved the prod gate via put-approval-result (approval #$approvals)"
      fi
    fi

    if stack_deployed "$DEV_REGION" && stack_deployed "$PROD_REGION"; then
      [ "$approvals" -gt 0 ] || { log 'both stacks deployed but the gate was never approved -- prod was not gated'; return 1; }
      info "both stage stacks are deployed (prod gate approved $approvals time(s))"
      return 0
    fi

    failed="$(aws_masked codepipeline get-pipeline-state --name "$name" --region "$DEV_REGION" \
      --query "stageStates[?latestExecution.status=='Failed'].stageName" --output text 2>/dev/null)" || true
    if [ -n "$failed" ] && [ "$failed" != 'None' ]; then
      log "pipeline stage(s) FAILED: $failed"
      dump_failed_logs "$name"
      return 1
    fi
    sleep "$POLL_INTERVAL"
  done
  log "pipeline did not settle within $((POLL_MAX * POLL_INTERVAL / 60)) min"
  dump_failed_logs "$name"
  return 1
}

# True when this run's app stack exists and is complete in `$1`.
stack_deployed() {
  local status
  status="$(aws cloudformation describe-stacks --stack-name "$(app_stack)" --region "$1" \
              --query 'Stacks[0].StackStatus' --output text 2>/dev/null)" || return 1
  [ "$status" = 'CREATE_COMPLETE' ] || [ "$status" = 'UPDATE_COMPLETE' ]
}

# On a stage failure the CodeBuild projects are about to be torn down, so pull the failed build's log
# tail NOW -- otherwise the reason for the failure is gone. Best-effort; never fails the caller.
dump_failed_logs() {
  local name="$1" rows build grp stream
  rows="$(aws_masked codepipeline list-action-executions --pipeline-name "$name" --region "$DEV_REGION" \
    --query "actionExecutionDetails[?status=='Failed'].output.executionResult.externalExecutionId" \
    --output text 2>/dev/null)" || return 0
  for build in $rows; do
    [ -n "$build" ] && [ "$build" != 'None' ] || continue
    log "failed CodeBuild build: ${build%%:*}"
    read -r grp stream < <(aws_masked codebuild batch-get-builds --ids "$build" --region "$DEV_REGION" \
      --query 'builds[0].logs.[groupName,streamName]' --output text 2>/dev/null) || continue
    [ -n "$grp" ] && [ "$grp" != 'None' ] || { info '(no log group on the build)'; continue; }
    aws_masked logs get-log-events --log-group-name "$grp" --log-stream-name "$stream" --region "$DEV_REGION" \
      --limit 40 --query 'events[].message' --output text 2>/dev/null | redact | sed 's/^/    | /' || true
  done
}

# Assert the stage's stack really deployed in `$1` AND that it was built for stage `$2`.
assert_app_stack() {
  local region="$1" stage="$2" stack status value
  stack="$(app_stack)"
  status="$(aws_masked cloudformation describe-stacks --stack-name "$stack" --region "$region" \
              --query 'Stacks[0].StackStatus' --output text)" || die "assert: $stack not found in $region"
  case "$status" in CREATE_COMPLETE|UPDATE_COMPLETE) ;; *) die "assert: $stack is $status in $region" ;; esac

  # The marker embeds the stage, so this proves the DEV deploy ran with the dev stage and the PROD
  # deploy with prod -- not merely that two identical stacks exist in two regions. It also catches the
  # `stage unknown` case, where the app read the wrong env var and every stage looked the same.
  value="$(aws ssm get-parameter --name "/cdkcicdtest/$CDK_CICD_TEST_RUN_ID/app" --region "$region" \
             --query Parameter.Value --output text 2>/dev/null)" || die "assert: SSM marker missing in $region"
  case "$value" in
    *"stage $stage"*) ;;
    *) die "assert: marker in $region does not name stage '$stage' (got: $value)" ;;
  esac
  info "$region: $stack $status, marker names stage '$stage'"
}

# m9: assert every deployed CodeBuild project's buildspec really carries the npmRegistry wiring --
# the registry URL in a pre_build login command and the bearer-token secret ARN in the buildspec's
# `secrets-manager` env mapping. Queried straight off the deployed stack's resources, not off the
# synthesized template in the repo, so this is evidence about what actually landed in the account.
assert_npm_registry_wiring() {
  local pstack="$1" secret_arn="$2" names name buildspec count=0
  names="$(aws_masked cloudformation describe-stack-resources --stack-name "$pstack" --region "$DEV_REGION" \
             --query "StackResources[?ResourceType=='AWS::CodeBuild::Project'].PhysicalResourceId" --output text)" \
    || die "assert: could not list $pstack's CodeBuild projects"
  [ -n "$names" ] && [ "$names" != 'None' ] || die 'assert: no CodeBuild projects found on the pipeline stack'

  for name in $names; do
    buildspec="$(aws_masked codebuild batch-get-projects --names "$name" --region "$DEV_REGION" \
                   --query 'projects[0].source.buildspec' --output text)" \
      || die "assert: batch-get-projects failed for $name"
    case "$buildspec" in
      *"$NPM_REGISTRY_URL"*) ;;
      *) die "assert: $name's buildspec does not reference the npmRegistry URL -- login command missing" ;;
    esac
    case "$buildspec" in
      *"$secret_arn"*) ;;
      *) die "assert: $name's buildspec does not map NPM_AUTH_TOKEN to the secret ARN -- secrets-manager env missing" ;;
    esac
    count=$((count + 1))
  done
  # 1 CI + 1 self-update + 1 per stage, same shape the footprint assertion above already pins.
  [ "$count" -ge 3 ] || die "assert: expected npmRegistry wiring on >=3 CodeBuild projects, confirmed $count"
  info "$count/$count deployed CodeBuild project(s) reference the npmRegistry URL and its secrets-manager mapping"
}

# m9, best-effort: confirm a REAL CodeBuild run executed the login command, not just that the buildspec
# contains it. The Build (CI) action runs first and needs no approval, so its log is available early --
# poll briefly rather than blocking the whole gate on it. Never fails the caller: the static assertion
# above is the real gate, this is corroborating evidence when the timing lines up.
assert_npm_registry_login_ran() {
  local pname="$1" i=0 build grp stream
  for (( i=0; i<18; i++ )); do
    build="$(aws_masked codepipeline list-action-executions --pipeline-name "$pname" --region "$DEV_REGION" \
      --query "actionExecutionDetails[?actionName=='Build' && status=='Succeeded'].output.executionResult.externalExecutionId | [0]" \
      --output text 2>/dev/null)" || true
    [ -n "$build" ] && [ "$build" != 'None' ] && break
    sleep 10
  done
  if [ -z "${build:-}" ] || [ "$build" = 'None' ]; then
    log 'npmRegistry: Build action did not succeed within the poll window -- skipping the log corroboration (non-fatal)'
    return 0
  fi
  read -r grp stream < <(aws_masked codebuild batch-get-builds --ids "$build" --region "$DEV_REGION" \
    --query 'builds[0].logs.[groupName,streamName]' --output text 2>/dev/null) || return 0
  [ -n "$grp" ] && [ "$grp" != 'None' ] || return 0
  if aws_masked logs get-log-events --log-group-name "$grp" --log-stream-name "$stream" --region "$DEV_REGION" \
       --limit 200 --query 'events[].message' --output text 2>/dev/null | redact | grep -Fq "registry=${NPM_REGISTRY_URL}"; then
    info 'npmRegistry: confirmed the login command really ran in a real CodeBuild build (Build action log)'
  else
    log 'npmRegistry: login command not found in the Build action log (non-fatal -- static wiring already confirmed)'
  fi
}

main_m4() {
  load_env
  ensure_run_id
  log "m4-verify (run id $CDK_CICD_TEST_RUN_ID)  pipeline+dev in $DEV_REGION, prod in $PROD_REGION"

  local actual
  actual="$(caller_account)" || die 'could not resolve caller identity'
  [ "$actual" = "$CDK_CICD_TEST_ACCOUNT" ] || die 'caller identity is not CDK_CICD_TEST_ACCOUNT -- refusing to deploy'

  local pstack pname bucket bundle rc=0 npm_secret_arn=''
  pstack="$(pipeline_stack)"; pname="$(pipeline_name)"; bucket="$(src_bucket)"

  # m9: the secret has to exist before build_bundle renders cicd.config.ts, since the ARN goes straight
  # into the generated npmRegistry block.
  if [ "${M4_NPM_REGISTRY:-false}" = 'true' ]; then
    npm_secret_arn="$(ensure_npm_registry_secret)"
  fi

  # --- provision source ---------------------------------------------------------------------------
  log 'leg 1: build the bundle + upload it as the S3 source'
  bundle="$(build_bundle)"
  ensure_src_bucket "$bucket"
  # `zip` MERGES into an existing archive, and an early exit on a previous run skips the cleanup at the
  # end -- so without this rm a later run can ship files the fixture no longer contains. Exclusions are
  # written without a leading `*/`: entries are stored relative with no `./` prefix, so `*/cdk.out/*`
  # silently matches nothing at the top level. node_modules must go too -- `build_bundle` installs it to
  # generate the lockfile, and shipping it made the source zip ~83 MiB and undercut the point that
  # CodeBuild resolves the packages from CodeArtifact via `npm ci`.
  rm -f /tmp/m4-app.zip
  ( cd "$bundle" && zip -qr /tmp/m4-app.zip . -x 'cdk.out/*' 'node_modules/*' ) || { destroy_src_bucket "$bucket"; die 'zip failed'; }
  aws s3 cp /tmp/m4-app.zip "s3://$bucket/app.zip" --region "$DEV_REGION" 2>&1 | redact \
    || { destroy_src_bucket "$bucket"; die 'source upload failed'; }
  info "uploaded source to s3://$bucket/app.zip"

  # --- deploy the pipeline ------------------------------------------------------------------------
  log 'leg 2: cdk-cicd deploy-ci --disposable (provision the pipeline)'
  if ! ( cd "$bundle" \
          && CDK_DEFAULT_ACCOUNT="$CDK_CICD_TEST_ACCOUNT" CDK_DEFAULT_REGION="$DEV_REGION" \
             AWS_REGION="$DEV_REGION" AWS_DEFAULT_REGION="$DEV_REGION" \
             npx cdk-cicd deploy-ci --disposable 2>&1 | redact ); then
    rc=1
  fi

  if [ "$rc" = 0 ]; then
    # --- record the footprint: the whole point vs Blueprint's 100+ CodeBuild projects -------------------
    local projects
    projects="$(aws_masked cloudformation list-stack-resources --stack-name "$pstack" --region "$DEV_REGION" \
                  --query "length(StackResourceSummaries[?ResourceType=='AWS::CodeBuild::Project'])" --output text)" || true
    log "FOOTPRINT: the pipeline stack has $projects CodeBuild project(s) (Blueprint grew 100+)"
    # ASSERT it, do not merely print it: 1 CI + 1 self-update + 1 per stage. Logging alone means a
    # regression that drops the self-update project, or reintroduces per-asset sprawl, still passes the
    # gate whose whole purpose is the flat footprint.
    local expected_projects=$(( 2 + 2 ))   # BuildProject + UpdatePipeline + Deploy-dev + Deploy-prod
    if [ "$projects" != "$expected_projects" ]; then
      log "FOOTPRINT MISMATCH: expected $expected_projects CodeBuild project(s), found $projects"
      rc=1
    fi

    # --- m9: assert the npmRegistry wiring landed on every deployed CodeBuild project -------------
    if [ "${M4_NPM_REGISTRY:-false}" = 'true' ]; then
      log 'leg 2.5: assert the deployed CodeBuild projects really carry the npmRegistry wiring'
      ( assert_npm_registry_wiring "$pstack" "$npm_secret_arn" ) || rc=1
      [ "$rc" = 0 ] && assert_npm_registry_login_ran "$pname"
    fi

    # --- drive the run through the approval ------------------------------------------------------
    log 'leg 3: drive the pipeline run dev -> prod through the manual approval'
    if drive_pipeline "$pname"; then
      log 'leg 4: assert both stage stacks really deployed, for the right stage'
      # Subshell-wrapped because assert_app_stack signals failure with `die`, i.e. `exit 1`. Called bare,
      # a failed assertion would exit main_m4 outright and skip the teardown below -- leaking the pipeline
      # stack, both app stacks and the versioned source bucket, with the pipeline still running. Every
      # other fallible leg here is wrapped for the same reason.
      ( assert_app_stack "$DEV_REGION" dev ) || rc=1
      ( assert_app_stack "$PROD_REGION" prod ) || rc=1
    else
      rc=1
    fi
  fi

  # --- teardown: always, even on failure ----------------------------------------------------------
  # Tag the pipeline stack HERE, not before the run. The tag is what the guard requires, but applying it
  # with `update-stack` mutates the stack, the pipeline's own self-update then reverts it, and that
  # update re-triggers the pipeline (restartExecutionOnUpdate) -- measured: it churned a run into a
  # second execution and left the stack untagged anyway. Tagging once, after the run, avoids both.
  # Order matters: the PIPELINE goes first, then the app stacks. `drive_pipeline` returns on evidence and
  # can return mid-execution (a self-mutation restarts the run), and tagging itself can restart it, so a
  # live `Deploy-<stage>` action would happily recreate an app stack we had already deleted -- leaving an
  # orphan while the gate reported success. Nothing depends on the reverse order: the app stacks are
  # created by `cdk deploy` under the bootstrap roles, not owned by the pipeline stack.
  log 'teardown: pipeline stack first (so no running action can recreate an app stack), then app stacks, then source bucket'
  tag_pipeline_stack "$pstack"
  ( destroy_stack "$pstack" "$DEV_REGION" ) || { log "pipeline stack teardown incomplete -- run \`harness.sh sweep\`"; rc=1; }
  local region
  for region in "$DEV_REGION" "$PROD_REGION"; do
    ( destroy_stack "$(app_stack)" "$region" ) || { log "app stack teardown in $region incomplete"; rc=1; }
  done
  destroy_src_bucket "$bucket" || rc=1
  destroy_plan_parameters
  [ "${M4_NPM_REGISTRY:-false}" = 'true' ] && { destroy_npm_registry_secret || rc=1; }
  rm -rf "$bundle" /tmp/m4-app.zip

  if [ "$rc" = 0 ]; then
    log 'm4-verify PASSED: one pipeline from cicd.config.ts flowed dev->prod through approval, then torn down'
  else
    log 'm4-verify FAILED'
  fi
  return "$rc"
}

main_m4 "$@"
