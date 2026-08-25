#!/usr/bin/env bash
# =============================================================================
# container-deploy-verify -- proves the m6-container Repo-2 deploy path on real AWS: a config-agnostic
# deployer image (the level1 fixture + its deps + the wrapper CLI, vendored so it runs offline) is run by
# `cdk-cicd deploy --from-image` against a `deploy.config.ts` target, and the container synthesizes and
# `cdk deploy`s a real stack -- WITHOUT a pipeline. Then everything is torn down.
#
#   bash test/proof/container-deploy-verify.sh
#
# This is the slice-2 companion to container-verify.sh (which proves slice-1: build+push an image to ECR).
# Here the image is built locally (slice-1 already proved the ECR push) and RUN to deploy. Uses the
# gitignored .env + ambient creds; every AWS call redacted; the deployed stack is torn down on exit.
# Requires docker and the locally packed v3 tarballs (development/v3-tgz/*.tgz -- `npm pack` per package).
# =============================================================================
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./harness.sh
. "$HERE/harness.sh"

readonly FIXTURE='level1-app'
readonly REGION='us-west-2'

image_tag() { printf 'cdkcicdtest-%s-deployer:local\n' "$CDK_CICD_TEST_RUN_ID"; }
# level1-app/bin/app.ts names its stack cdkcicdtest-<runId>-level1; the run id is baked into the image.
deployed_stack() { printf '%s-%s-level1\n' "$STACK_PREFIX" "$CDK_CICD_TEST_RUN_ID"; }

main_deploy() {
  load_env; ensure_run_id
  log "container-deploy-verify (run $CDK_CICD_TEST_RUN_ID) region $REGION"
  command -v docker >/dev/null 2>&1 || die 'docker is not on PATH'
  local actual; actual="$(caller_account)" || die 'no caller identity'
  [ "$actual" = "$CDK_CICD_TEST_ACCOUNT" ] || die 'caller is not the test account'

  local tgz_dir="$(repo_root)/development/v3-tgz"
  local wrapper_tgz cli_tgz
  wrapper_tgz="$(ls "$tgz_dir"/cdklabs-cdk-cicd-wrapper-*.tgz 2>/dev/null | grep -v -- '-cli-' | head -1)"
  cli_tgz="$(ls "$tgz_dir"/cdklabs-cdk-cicd-wrapper-cli-*.tgz 2>/dev/null | head -1)"
  [ -f "$wrapper_tgz" ] && [ -f "$cli_tgz" ] || die "missing v3 tarballs in $tgz_dir (run: npm pack per package)"

  local bundle rc=0
  bundle="$(mktemp -d)"

  # --- bundle: level1 fixture + vendored deps (wrapper CLI from the local tgz) ----------------------
  log 'leg 1: assemble the deployer bundle (level1 fixture + vendored v3 deps)'
  cp -r "$(fixture_dir "$FIXTURE")/." "$bundle/"
  cp "$wrapper_tgz" "$bundle/wrapper.tgz"
  cp "$cli_tgz" "$bundle/cli.tgz"
  # A package.json that vendors the wrapper + CLI from the local tarballs and the CDK toolchain from npm.
  cat > "$bundle/package.json" <<'EOF'
{
  "name": "cdkcicd-deployer-fixture",
  "version": "0.0.0",
  "private": true,
  "dependencies": {
    "@cdklabs/cdk-cicd-wrapper": "file:wrapper.tgz",
    "@cdklabs/cdk-cicd-wrapper-cli": "file:cli.tgz",
    "aws-cdk": "^2.1000.0",
    "aws-cdk-lib": "^2.195.0",
    "constructs": "^10.3.0",
    "ts-node": "^10.9.2",
    "typescript": "~5.6.0",
    "source-map-support": "^0.5.21"
  }
}
EOF
  ( cd "$bundle" && npm install --no-audit --no-fund >/dev/null 2>&1 ) || { rm -rf "$bundle"; die 'npm install of the deployer bundle failed'; }

  # deploy.config.ts (Repo 2): ONE target -- the dev stage into us-west-2. The image is authoritative for
  # WHAT (the level1 app + its stages); this target is authoritative for WHERE.
  cat > "$bundle/deploy.config.ts" <<EOF
import { defineDeployment } from '@cdklabs/cdk-cicd-wrapper';
export default defineDeployment({
  image: '$(image_tag)',
  targets: [{ stage: 'dev', env: { account: '${CDK_CICD_TEST_ACCOUNT}', region: '${REGION}' } }],
});
EOF

  # The offline deployer image: vendored node_modules, run id baked in so the deployed stack name carries
  # it, and node_modules/.bin on PATH so the inner `cdk-cicd deploy` resolves.
  # The wrapper CLI eagerly requires its SecurityCommand at import, which probes for Python just to build
  # its config (getPythonCommand only checks `python3 -v` exits 0 -- it is never actually run on the deploy
  # path). See finding qa-cli-requires-python-at-import. The build network cannot resolve apt mirrors here,
  # so satisfy the load-time check with a network-free python3 shim rather than installing a real one.
  cat > "$bundle/python3" <<'PYSHIM'
#!/bin/sh
echo "Python 3.11.0 (cdk-cicd deployer shim)" >&2
exit 0
PYSHIM
  chmod +x "$bundle/python3"
  cat > "$bundle/Dockerfile" <<'EOF'
FROM public.ecr.aws/docker/library/node:22-slim
ARG RUN_ID=local
ENV CDK_CICD_TEST_RUN_ID=$RUN_ID
WORKDIR /deployer
COPY . .
COPY --chmod=0755 python3 /usr/local/bin/python3
ENV PATH=/deployer/node_modules/.bin:$PATH
CMD ["cdk-cicd", "--help"]
EOF
  printf 'cdk.out\n*.tgz\n' > "$bundle/.dockerignore"

  # --- build the deployer image ---------------------------------------------------------------------
  log 'leg 2: docker build the deployer image (vendored, offline)'
  if ! ( cd "$bundle" && docker build --build-arg "RUN_ID=$CDK_CICD_TEST_RUN_ID" -t "$(image_tag)" . >/tmp/cdvbuild.log 2>&1 ); then
    tail -25 /tmp/cdvbuild.log | redact | sed 's/^/    | /'
    rm -rf "$bundle"; die 'docker build failed'
  fi
  info "built image $(image_tag)"

  # Arm teardown now that the image + (soon) a stack exist. destroy_all is guarded + idempotent.
  trap 'destroy_all' EXIT

  # --- run the image to deploy (no pipeline) --------------------------------------------------------
  # dockerRunArgs passes AWS_* by NAME (inherited), so the creds must be in this process's env. The test
  # account creds live in the [default] profile file, not env vars -- materialize them for the run only.
  log 'leg 3: cdk-cicd deploy --from-image (container synths + deploys the dev stage, no pipeline)'
  local akid secret token
  akid="$(aws configure get aws_access_key_id 2>/dev/null || true)"
  secret="$(aws configure get aws_secret_access_key 2>/dev/null || true)"
  token="$(aws configure get aws_session_token 2>/dev/null || true)"
  [ -n "$akid" ] && [ -n "$secret" ] || die 'could not read [default] profile credentials for the container'
  export AWS_ACCESS_KEY_ID="$akid" AWS_SECRET_ACCESS_KEY="$secret"
  # Only export a session token when there is one -- an empty AWS_SESSION_TOKEN can break SDK auth for
  # long-term keys (the test account uses assumed-role creds, which always carry a token).
  [ -n "$token" ] && export AWS_SESSION_TOKEN="$token"
  export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION"

  # Probe: confirm the by-name passthrough actually lands the creds inside the image before deploying.
  info "probe: creds inside the container -> $(docker run --rm -e AWS_ACCESS_KEY_ID -e AWS_SESSION_TOKEN "$(image_tag)" \
        sh -c 'echo akid=${#AWS_ACCESS_KEY_ID} token=${#AWS_SESSION_TOKEN}' 2>&1 | tail -1)"

  # --docker-network host: this environment's default docker bridge has no egress to AWS endpoints, so the
  # in-container `cdk deploy` cannot reach CloudFormation on the bridge. Host networking gives the container
  # the host's (working) route to AWS. A real CI runner with internet needs no such flag.
  if ! ( cd "$bundle" && npx cdk-cicd deploy --from-image --yes --docker-network host 2>&1 | redact ); then
    rc=1
  fi

  if [ "$rc" = 0 ]; then
    log 'leg 4: tag the deployed stack (so teardown is allowed) and assert it is real'
    # The inner `cdk deploy` does not tag; add the run-id tag CFN-side so the teardown guard accepts it.
    # Verify the tag actually LANDED -- if it does not, the harness guard (and `sweep`) can neither
    # destroy nor even find the stack, so a silent tag failure would orphan a real stack. We check the
    # tag below and fall back to a prefix+account-guarded delete in destroy_all if it is missing.
    aws cloudformation update-stack --stack-name "$(deployed_stack)" --region "$REGION" --use-previous-template \
      --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM --tags "Key=$TAG_KEY,Value=$CDK_CICD_TEST_RUN_ID" >/dev/null 2>&1 || true
    aws cloudformation wait stack-update-complete --stack-name "$(deployed_stack)" --region "$REGION" >/dev/null 2>&1 || true
    local landed
    landed="$(aws cloudformation describe-stacks --stack-name "$(deployed_stack)" --region "$REGION" \
      --query "Stacks[0].Tags[?Key=='$TAG_KEY']|[0].Value" --output text 2>/dev/null)" || true
    [ "$landed" = "$CDK_CICD_TEST_RUN_ID" ] && info "run-id tag landed on the stack" \
      || log "WARN: run-id tag did NOT land -- destroy_all will use the guarded fallback delete"
    local status
    status="$(aws cloudformation describe-stacks --stack-name "$(deployed_stack)" --region "$REGION" \
      --query 'Stacks[0].StackStatus' --output text 2>/dev/null)" || true
    case "$status" in
      CREATE_COMPLETE|UPDATE_COMPLETE) info "deployed stack $(deployed_stack) is $status" ;;
      *) log "stack $(deployed_stack) status: ${status:-missing}"; rc=1 ;;
    esac
    local param="/${STACK_PREFIX}/${CDK_CICD_TEST_RUN_ID}/level1"
    local value
    value="$(aws ssm get-parameter --name "$param" --region "$REGION" --query Parameter.Value --output text 2>/dev/null)" || true
    if [ -n "$value" ] && [ "$value" != 'None' ]; then
      info "SSM $param present -- PROVED an image deployed a real stack with no pipeline"
    else log "SSM $param not found"; rc=1; fi
  fi

  log 'teardown (deployed stack, local image, bundle) runs on exit'
  [ "$rc" = 0 ] && log 'container-deploy-verify PASSED: deploy --from-image ran the image and deployed a real stack, then torn down' \
                || log 'container-deploy-verify FAILED'
  return "$rc"
}

# Guarded + idempotent teardown: the deployed stack (through the harness guard), the local image, the bundle.
destroy_all() {
  local stack; stack="$(deployed_stack)"
  if ! ( destroy_stack "$stack" "$REGION" ); then
    # The harness guard requires the run-id tag. If tagging never landed (leg 4 warned), the stack would
    # otherwise orphan with no automated recovery (sweep is tag-scoped too). Fall back to a direct delete
    # gated on the SAME essential safety checks minus the tag: our disposable prefix, and the stack's own
    # ARN account == the test account we are authenticated as.
    local sid arn_acct amb
    sid="$(aws cloudformation describe-stacks --stack-name "$stack" --region "$REGION" --query 'Stacks[0].StackId' --output text 2>/dev/null)" || true
    if [ -n "$sid" ] && [ "$sid" != 'None' ]; then
      arn_acct="$(printf '%s' "$sid" | cut -d: -f5)"; amb="$(caller_account 2>/dev/null || true)"
      case "$stack" in
        "$STACK_PREFIX"-*)
          if [ "$arn_acct" = "$CDK_CICD_TEST_ACCOUNT" ] && [ "$amb" = "$CDK_CICD_TEST_ACCOUNT" ]; then
            log "fallback: deleting untagged '$stack' (prefix+account guarded)"
            aws cloudformation delete-stack --stack-name "$stack" --region "$REGION" >/dev/null 2>&1
            aws cloudformation wait stack-delete-complete --stack-name "$stack" --region "$REGION" >/dev/null 2>&1 \
              && info "fallback delete complete" || die "MANUAL CLEANUP NEEDED: stack '$stack' in $REGION"
          else
            die "MANUAL CLEANUP NEEDED: stack '$stack' account/ambient mismatch -- refusing to delete"
          fi
          ;;
        *) die "MANUAL CLEANUP NEEDED: '$stack' outside '$STACK_PREFIX-' prefix -- refusing to delete" ;;
      esac
    fi
  fi
  docker image rm -f "$(image_tag)" >/dev/null 2>&1 && info "removed local image $(image_tag)" || true
}

main_deploy "$@"
