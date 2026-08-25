#!/usr/bin/env bash
# =============================================================================
# m3-verify -- the Wave 3 exit gate. Two real-AWS legs:
#
#   1. cdk-cicd deploy --stage dev  -> ONE build, deployed to BOTH regions
#      (level1-app's dev stage is multi-region). Asserts each region's stack is up
#      and injected, that a single invocation produced both region assemblies, then
#      destroys both through the teardown guard.
#   2. cdk-cicd deploy --stage drift -> the drift rule REFUSES it (hardcoded-env-app
#      bakes a foreign account), so nothing deploys.
#
#   bash test/proof/m3-verify.sh
#
# Uses the gitignored .env + ambient credentials, same as harness.sh. Every AWS call is
# redacted, so no account id is printed.
# =============================================================================
set -euo pipefail

M3_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./harness.sh
. "$M3_DIR/harness.sh"

CLI="$(repo_root)/packages/@cdklabs/cdk-cicd-wrapper-cli/lib/index.js"
MR_FIXTURE='level1-app'
MR_STAGE='dev'
DRIFT_FIXTURE='hardcoded-env-app'
DRIFT_STAGE='drift'

# The injected wrapper Stage tag lives on the deployed template (see m2-verify for why we read the
# template, not the stack tags). Its presence proves the region's stack was wrapped.
assert_region_deployed() {
  local region="$1" stack param status value
  stack="$(stack_name "$MR_FIXTURE")"
  status="$(aws_masked cloudformation describe-stacks --stack-name "$stack" --region "$region" \
              --query 'Stacks[0].StackStatus' --output text)" || die "assert: $stack not found in $region"
  case "$status" in
    CREATE_COMPLETE | UPDATE_COMPLETE) ;;
    *) die "assert: $stack is $status in $region" ;;
  esac
  aws_masked cloudformation get-template --stack-name "$stack" --region "$region" \
    --query TemplateBody --output json | grep -q '"Stage"' \
    || die "assert: $stack in $region lacks the injected Stage tag -- not wrapped"
  param="$(param_name "$MR_FIXTURE")"
  value="$(aws ssm get-parameter --name "$param" --region "$region" --query Parameter.Value --output text 2>/dev/null)" \
    || die "assert: SSM $param missing in $region"
  [ -n "$value" ] || die "assert: SSM $param empty in $region"
  info "region $region: $stack $status, injected (Stage tag present), SSM $param set"
}

main_m3() {
  load_env
  ensure_run_id
  local primary="$CDK_CICD_TEST_REGION_PRIMARY" secondary="$CDK_CICD_TEST_REGION_SECONDARY"
  log "m3-verify (run id $CDK_CICD_TEST_RUN_ID)  regions: $primary + $secondary"

  local actual
  actual="$(caller_account)" || die 'could not resolve caller identity'
  [ "$actual" = "$CDK_CICD_TEST_ACCOUNT" ] || die 'caller identity is not CDK_CICD_TEST_ACCOUNT -- refusing to deploy'

  local rc=0
  local dir stack
  dir="$(fixture_dir "$MR_FIXTURE")"
  stack="$(stack_name "$MR_FIXTURE")"

  # --- Leg 1: one build, two regions --------------------------------------------------------------
  log "leg 1: cdk-cicd deploy --stage $MR_STAGE ($primary + $secondary from a single build)"
  if ! ( cd "$dir" && rm -rf cdk.out && node "$CLI" deploy --stage "$MR_STAGE" 2>&1 | redact ); then
    rc=1
  fi
  if [ "$rc" = 0 ]; then
    [ -f "$dir/cdk.out/$MR_STAGE/$primary/manifest.json" ] && [ -f "$dir/cdk.out/$MR_STAGE/$secondary/manifest.json" ] \
      || die "leg 1: a single deploy did not produce both region assemblies"
    info "one build produced cdk.out/$MR_STAGE/{$primary,$secondary}"
    assert_region_deployed "$primary"
    assert_region_deployed "$secondary"
    info "leg 1 OK: $MR_STAGE deployed to both regions from one build"
  fi

  # Teardown BOTH regions no matter what happened above.
  local region
  for region in "$primary" "$secondary"; do
    if ! ( destroy_stack "$stack" "$region" ); then
      log "teardown of $stack in $region did not complete -- run \`harness.sh sweep\`"
      rc=1
    fi
  done
  rm -rf "$dir/cdk.out"

  # --- Leg 2: drift refuses a foreign-account deploy ---------------------------------------------
  # A non-zero exit alone is NOT enough -- a stale build, a synth error or a missing dep would also
  # exit non-zero and falsely look like a refusal. Assert the refusal happened FOR THE DRIFT REASON.
  log "leg 2: cdk-cicd deploy --stage $DRIFT_STAGE must be REFUSED by the drift rule"
  local ddir out drift_rc=0
  ddir="$(fixture_dir "$DRIFT_FIXTURE")"
  # --yes so we get PAST the manual-approval gate to the drift check -- the refusal under test is the
  # drift rule, not the approval gate.
  out="$(cd "$ddir" && rm -rf cdk.out && node "$CLI" deploy --stage "$DRIFT_STAGE" --yes 2>&1 | redact)" || drift_rc=$?
  if [ "$drift_rc" = 0 ]; then
    log "leg 2 FAILED: the drift stage deployed instead of being refused -- run \`harness.sh sweep\`"
    rc=1
  elif printf '%s' "$out" | grep -q 'drift refuses'; then
    info "leg 2 OK: drift refused the foreign-account deploy for the right reason (nothing deployed)"
  else
    log "leg 2 FAILED: deploy exited non-zero but NOT via the drift rule -- last lines:"
    printf '%s\n' "$out" | tail -5
    rc=1
  fi
  rm -rf "$ddir/cdk.out"

  if [ "$rc" = 0 ]; then
    log "m3-verify PASSED: multi-region deploy from one build + drift refusal, nothing left behind"
  else
    log "m3-verify FAILED"
  fi
  return "$rc"
}

main_m3 "$@"
