#!/usr/bin/env bash
# =============================================================================
# container-verify -- proves the m6-container Repo-1 image-build pipeline on real AWS: from a bare
# cicd.config.ts with `deployerImage: BuildImage.docker(...)`, `cdk-cicd deploy-ci` provisions a SECONDARY
# CodePipeline that runs CI and builds & pushes a deployer image to ECR. It deploys no app.
#
#   bash test/proof/container-verify.sh
#
# Reuses the pipeline-app fixture + a generated Dockerfile + a container cicd.config.ts. Uses the gitignored
# .env + ambient creds; every AWS call redacted; ECR repo + pipeline stack + source bucket torn down.
# Requires the wrapper + CLI published to CodeArtifact.
# =============================================================================
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./harness.sh
. "$HERE/harness.sh"

readonly CA_DOMAIN='cdk-cicd-wrapper'
readonly CA_REPO='cdk-cicd-wrapper'
readonly FIXTURE='pipeline-app'
readonly REGION='us-west-2'
readonly POLL_INTERVAL=20
readonly POLL_MAX=60   # 20 min ceiling

pipeline_stack() { printf 'cdkcicdtest-%s-pipeline\n' "$CDK_CICD_TEST_RUN_ID"; }
src_bucket()     { printf 'cdkcicdtest-%s-csrc\n' "$CDK_CICD_TEST_RUN_ID"; }
ecr_repo()       { printf 'cdkcicdtest-%s-deployer\n' "$CDK_CICD_TEST_RUN_ID"; }

main_container() {
  load_env; ensure_run_id
  local app="cdkcicdtest-$CDK_CICD_TEST_RUN_ID"
  log "container-verify (run $CDK_CICD_TEST_RUN_ID) region $REGION"
  local actual; actual="$(caller_account)" || die 'no caller identity'
  [ "$actual" = "$CDK_CICD_TEST_ACCOUNT" ] || die 'caller is not the test account'

  local pstack bucket repo bundle rc=0
  pstack="$(pipeline_stack)"; bucket="$(src_bucket)"; repo="$(ecr_repo)"

  # --- bundle: pipeline-app fixture + a Dockerfile + a container config -----------------------------
  log 'leg 1: build the source bundle (fixture + Dockerfile + container cicd.config.ts)'
  bundle="$(mktemp -d)"
  cp -r "$(fixture_dir "$FIXTURE")/." "$bundle/"
  printf '{ "runId": "%s" }\n' "$CDK_CICD_TEST_RUN_ID" > "$bundle/run.json"
  # A minimal, fast deployer image for the gate: the point is to prove build+push-to-ECR, not a fully
  # functional Repo-2 image (that is a later slice). node_modules is excluded so the build stays small.
  cat > "$bundle/Dockerfile" <<'EOF'
FROM public.ecr.aws/docker/library/alpine:3
WORKDIR /deployer
COPY . .
CMD ["sh", "-c", "echo cdk-cicd deployer image"]
EOF
  printf 'node_modules\ncdk.out\n' > "$bundle/.dockerignore"
  cat > "$bundle/cicd.config.ts" <<EOF
import { defineCICD, Repository, BuildImage } from '@cdklabs/cdk-cicd-wrapper';
export default defineCICD({
  application: '${app}',
  repository: Repository.s3('${bucket}/app.zip'),
  codeArtifact: { domain: '${CA_DOMAIN}', repository: '${CA_REPO}', npmScope: 'cdklabs' },
  deployerImage: BuildImage.docker({ repositoryName: '${repo}' }),
  stages: [{ name: 'dev', env: { region: '${REGION}' } }],
});
EOF
  # Pre-create the ECR repo the config references, tagged so teardown can find + delete it. (The engine
  # references it by name when repositoryName is set, so the gate owns its lifecycle.)
  aws ecr create-repository --repository-name "$repo" --region "$REGION" \
    --tags "Key=$TAG_KEY,Value=$CDK_CICD_TEST_RUN_ID" >/dev/null 2>&1 \
    || die "could not create ECR repo $repo"

  local npmrc; npmrc="$(mktemp)"
  NPM_CONFIG_USERCONFIG="$npmrc" aws codeartifact login --tool npm --domain "$CA_DOMAIN" \
    --domain-owner "$CDK_CICD_TEST_ACCOUNT" --region "$REGION" --repository "$CA_REPO" --namespace cdklabs >/dev/null 2>&1 \
    || die 'codeartifact login failed'
  ( cd "$bundle" && NPM_CONFIG_USERCONFIG="$npmrc" npm install --no-audit --no-fund --prefer-online >/dev/null 2>&1 ) \
    || die 'npm install of the bundle failed'
  rm -f "$npmrc"
  local built="$(repo_root)/packages/@cdklabs/cdk-cicd-wrapper/lib/v3/config/build-image.js"
  local installed="$bundle/node_modules/@cdklabs/cdk-cicd-wrapper/lib/v3/config/build-image.js"
  if [ -f "$built" ] && ! cmp -s "$built" "$installed"; then
    die 'installed wrapper differs from the local build -- stale CodeArtifact/npm cache; republish'
  fi

  ensure_src_bucket "$bucket"
  rm -f /tmp/container-app.zip
  ( cd "$bundle" && zip -qr /tmp/container-app.zip . -x 'node_modules/*' 'cdk.out/*' ) || { destroy_all; die 'zip failed'; }
  aws s3 cp /tmp/container-app.zip "s3://$bucket/app.zip" --region "$REGION" 2>&1 | redact || { destroy_all; die 'upload failed'; }
  info "uploaded source to s3://$bucket/app.zip"

  # --- provision the image-build pipeline ---------------------------------------------------------
  log 'leg 2: cdk-cicd deploy-ci --disposable (provision the image-build pipeline)'
  if ! ( cd "$bundle" \
          && CDK_DEFAULT_ACCOUNT="$CDK_CICD_TEST_ACCOUNT" CDK_DEFAULT_REGION="$REGION" \
             AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION" \
             npx cdk-cicd deploy-ci --disposable 2>&1 | redact ); then rc=1; fi

  if [ "$rc" = 0 ]; then
    log 'leg 3: footprint + drive the run'
    local projects
    projects="$(aws_masked cloudformation list-stack-resources --stack-name "$pstack" --region "$REGION" \
      --query "length(StackResourceSummaries[?ResourceType=='AWS::CodeBuild::Project'])" --output text)" || true
    log "FOOTPRINT: $projects CodeBuild project(s) (an image-build pipeline is source + one build)"
    if drive_until_image "$(pipeline_stack)" "$repo"; then
      log 'leg 4: assert the deployer image is in ECR'
      local digest
      digest="$(aws ecr describe-images --repository-name "$repo" --region "$REGION" \
        --query 'imageDetails[0].imageDigest' --output text 2>/dev/null)" || true
      if [ -n "$digest" ] && [ "$digest" != 'None' ]; then
        info "ECR image present: ${digest%%:*}...  PROVED build+push to ECR"
      else log 'no image found in ECR'; rc=1; fi
    else rc=1; fi
  fi

  log 'teardown: pipeline stack, ECR repo, source bucket'
  destroy_all
  rm -rf "$bundle" /tmp/container-app.zip
  [ "$rc" = 0 ] && log 'container-verify PASSED: image-build pipeline from cicd.config.ts pushed a deployer image to ECR, then torn down' \
                || log 'container-verify FAILED'
  return "$rc"
}

# Wait until the pipeline's build action succeeds (an image should then be in ECR) or a stage fails.
drive_until_image() {
  local name="$1" i failed
  for (( i=0; i<POLL_MAX; i++ )); do
    failed="$(aws_masked codepipeline get-pipeline-state --name "$name" --region "$REGION" \
      --query "stageStates[?latestExecution.status=='Failed'].stageName" --output text 2>/dev/null)" || true
    [ -n "$failed" ] && [ "$failed" != 'None' ] && { log "stage(s) FAILED: $failed"; dump_failed_logs "$name"; return 1; }
    local st
    st="$(aws_masked codepipeline get-pipeline-state --name "$name" --region "$REGION" \
      --query "stageStates[?stageName=='BuildImage'].latestExecution.status | [0]" --output text 2>/dev/null)" || true
    [ "$st" = 'Succeeded' ] && { info 'BuildImage stage Succeeded'; return 0; }
    sleep "$POLL_INTERVAL"
  done
  log 'image-build pipeline did not finish in time'; dump_failed_logs "$name"; return 1
}

# On failure, print the failed CodeBuild build's log tail (same approach as m4-verify).
dump_failed_logs() {
  local name="$1" build grp stream
  for build in $(aws_masked codepipeline list-action-executions --pipeline-name "$name" --region "$REGION" \
      --query "actionExecutionDetails[?status=='Failed'].output.executionResult.externalExecutionId" --output text 2>/dev/null); do
    [ -n "$build" ] && [ "$build" != 'None' ] || continue
    read -r grp stream < <(aws_masked codebuild batch-get-builds --ids "$build" --region "$REGION" \
      --query 'builds[0].logs.[groupName,streamName]' --output text 2>/dev/null) || continue
    [ -n "$grp" ] && [ "$grp" != 'None' ] || continue
    aws_masked logs get-log-events --log-group-name "$grp" --log-stream-name "$stream" --region "$REGION" \
      --limit 40 --query 'events[].message' --output text 2>/dev/null | redact | sed 's/^/    | /' || true
  done
}

ensure_src_bucket() {
  local b="$1"
  aws s3api head-bucket --bucket "$b" --region "$REGION" >/dev/null 2>&1 || \
    aws s3api create-bucket --bucket "$b" --region "$REGION" --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null 2>&1 || die "bucket create failed"
  aws s3api put-bucket-versioning --bucket "$b" --region "$REGION" --versioning-configuration Status=Enabled >/dev/null 2>&1 || die 'versioning failed'
  aws s3api put-bucket-tagging --bucket "$b" --region "$REGION" --tagging "TagSet=[{Key=$TAG_KEY,Value=$CDK_CICD_TEST_RUN_ID}]" >/dev/null 2>&1 || die 'bucket tag failed'
}

# Tag the pipeline stack (deploy-ci does not), then destroy stack + ECR repo + source bucket, all guarded.
destroy_all() {
  local pstack bucket repo; pstack="$(pipeline_stack)"; bucket="$(src_bucket)"; repo="$(ecr_repo)"
  aws cloudformation update-stack --stack-name "$pstack" --region "$REGION" --use-previous-template \
    --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM --tags "Key=$TAG_KEY,Value=$CDK_CICD_TEST_RUN_ID" >/dev/null 2>&1 || true
  aws cloudformation wait stack-update-complete --stack-name "$pstack" --region "$REGION" >/dev/null 2>&1 || true
  ( destroy_stack "$pstack" "$REGION" ) || log "pipeline teardown incomplete -- run harness.sh sweep"
  # ECR repo: guarded on prefix + our tag, force-delete (removes images).
  case "$repo" in "$STACK_PREFIX"-*) ;; *) die "guard: refusing ECR repo $repo" ;; esac
  local t; t="$(aws ecr list-tags-for-resource --resource-arn "arn:aws:ecr:${REGION}:${CDK_CICD_TEST_ACCOUNT}:repository/${repo}" --region "$REGION" --query "tags[?Key=='$TAG_KEY']|[0].Value" --output text 2>/dev/null)" || true
  if [ "$t" = "$CDK_CICD_TEST_RUN_ID" ]; then
    aws ecr delete-repository --repository-name "$repo" --region "$REGION" --force >/dev/null 2>&1 && info "deleted ECR repo $repo" || log "could not delete ECR repo $repo"
  else log "ECR repo $repo not tagged for this run -- leaving"; fi
  # source bucket
  for vid in $(aws s3api list-object-versions --bucket "$bucket" --region "$REGION" --query '[Versions[].VersionId, DeleteMarkers[].VersionId][]' --output text 2>/dev/null); do
    aws s3api delete-object --bucket "$bucket" --region "$REGION" --key app.zip --version-id "$vid" >/dev/null 2>&1
  done
  aws s3 rb "s3://$bucket" --region "$REGION" >/dev/null 2>&1 && info "deleted source bucket $bucket" || true
}

main_container "$@"
