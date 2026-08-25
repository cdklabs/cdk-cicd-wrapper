#!/usr/bin/env bash
# =============================================================================
# m2-verify -- the Wave 2 exit gate. A REAL deploy to the test account proving the
# runtime injection works end to end and, crucially, that it is DIFFERENTIAL:
#
#   level0-app  plain `cdk init`, cdk.json runs the app directly  -> wrapper INERT
#   level1-app  cdk.json runs `cdk-cicd exec`                     -> wrapper INJECTED
#
# Both are deployed, asserted and destroyed through the harness (so the teardown guard
# still governs every delete). On top of the harness assert, this checks the one fact
# that distinguishes injected from inert on a real stack: the wrapper applies a
# config-driven `Stage` tag tree-wide, so the injected stack carries it and the inert
# one does not.
#
#   bash test/proof/m2-verify.sh
#
# Uses the same gitignored .env and credentials as harness.sh. No account id is printed
# (every AWS call goes through the harness's redaction).
# =============================================================================
set -euo pipefail

M2_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Source the harness for its tested plumbing (load_env, the teardown guard, deploy/assert/
# destroy, redaction). Sourcing does not run main().
# shellcheck source=./harness.sh
. "$M2_DIR/harness.sh"

INERT_FIXTURE='level0-app'
INJECTED_FIXTURE='level1-app'
WRAPPER_TAG='Stage'   # applied tree-wide by the preload from cicd:config; absent without injection

# Whether the DEPLOYED stack's template carries the wrapper's config-driven `Stage` tag.
#
# We check the deployed template, not the stack's own tags: the harness passes `cdk deploy
# --tags`, and CLI tags OVERRIDE the stack-level tags the wrapper adds -- but CloudFormation
# never overrides a resource's own `Properties.Tags`, so the injected `Stage` tag survives on
# the resource in the deployed template. `Stage` appears nowhere in a plain (level0) template,
# so its mere presence in the template body is the differential.
has_wrapper_tag() {
  local fixture="$1" region="$2" stack body
  stack="$(stack_name "$fixture")"
  # Split the AWS call from the match so a get-template FAILURE dies rather than being read as
  # "no tag" -- otherwise assert_inert would fail OPEN (a broken read would look inert and pass).
  body="$(aws_masked cloudformation get-template --stack-name "$stack" --region "$region" \
            --query TemplateBody --output json)" \
    || die "m2-verify: get-template failed for '$stack' in $region -- cannot judge injection"
  printf '%s' "$body" | grep -q "\"${WRAPPER_TAG}\""
}

assert_injected() {
  local fixture="$1" region="$2"
  if has_wrapper_tag "$fixture" "$region"; then
    info "INJECTED: $fixture's deployed template carries the wrapper '$WRAPPER_TAG' tag"
  else
    die "m2-verify: $fixture was deployed via cdk-cicd exec but its template has no '$WRAPPER_TAG' tag -- injection did not apply"
  fi
}

assert_inert() {
  local fixture="$1" region="$2"
  if has_wrapper_tag "$fixture" "$region"; then
    die "m2-verify: $fixture is a plain app but its template carries the wrapper '$WRAPPER_TAG' tag -- the wrapper is not inert"
  else
    info "INERT: $fixture's template has no '$WRAPPER_TAG' tag -- the wrapper is invisible, as it must be at Level 0"
  fi
}

main_m2() {
  load_env
  local region; region="$(region_or_default "${1:-}")"
  ensure_run_id

  log "m2-verify in $region  (run id $CDK_CICD_TEST_RUN_ID)"

  # Identity must resolve to the test account before any deploy. (creds are refreshed out of
  # band with `harness.sh creds`; here we only assert, we do not re-auth.)
  local actual; actual="$(caller_account)" || die 'could not resolve caller identity'
  [ "$actual" = "$CDK_CICD_TEST_ACCOUNT" ] || die 'caller identity is not CDK_CICD_TEST_ACCOUNT -- refusing to deploy'

  ( cmd_check_bootstrap ) || die 'bootstrap check failed'

  # Teardown of BOTH fixtures is attempted no matter what fails above it, so a failed run
  # still leaves nothing behind.
  local rc=0
  if ! (
    cmd_deploy "$INERT_FIXTURE" "$region"
    cmd_assert "$INERT_FIXTURE" "$region"
    assert_inert "$INERT_FIXTURE" "$region"

    cmd_deploy "$INJECTED_FIXTURE" "$region"
    cmd_assert "$INJECTED_FIXTURE" "$region"
    assert_injected "$INJECTED_FIXTURE" "$region"
  ); then
    rc=1
  fi

  local entry
  for entry in "$INERT_FIXTURE" "$INJECTED_FIXTURE"; do
    if ! ( cmd_destroy "$entry" "$region" ); then
      log "teardown of $entry did not complete -- run \`harness.sh sweep\` to check for orphans"
      rc=1
    fi
  done

  if [ "$rc" = 0 ]; then
    log "m2-verify PASSED: $INERT_FIXTURE inert and $INJECTED_FIXTURE injected, both asserted and destroyed"
  else
    log "m2-verify FAILED in $region"
  fi
  return "$rc"
}

main_m2 "$@"
