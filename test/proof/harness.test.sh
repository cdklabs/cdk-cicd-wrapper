#!/usr/bin/env bash
# =============================================================================
# Unit test for harness.sh's teardown guard.
#
# Makes NO AWS calls: it puts a fake `aws` on PATH and drives the guard through
# every refusal branch. Exits non-zero if any case that must be refused is allowed
# -- and also if the one case that must be allowed is refused, because otherwise a
# guard that refused everything would pass vacuously.
#
#   bash harness.test.sh
# =============================================================================
set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- fake account/env: never reads .env, never talks to AWS -------------------
export CDK_CICD_TEST_ACCOUNT='123456789012'
export CDK_CICD_TEST_REGION_PRIMARY='us-west-2'
export CDK_CICD_TEST_REGION_SECONDARY='us-west-1'
export CDK_CICD_TEST_RUN_ID='rtest'
readonly OTHER_ACCOUNT='210987654321'
readonly OUR_STACK='cdkcicdtest-rtest-level0'

# Which account the fake `aws sts get-caller-identity` reports.
CALLER_ACCOUNT="$CDK_CICD_TEST_ACCOUNT"

# --- stub the aws CLI --------------------------------------------------------
STUB_DIR="$(mktemp -d)"
trap 'rm -rf "$STUB_DIR"' EXIT

cat >"$STUB_DIR/aws" <<'STUB'
#!/usr/bin/env bash
# Fake aws CLI. Behaviour is selected by $FAKE_CASE so the guard's real arguments
# need no parsing.
set -eu

case "${1:-} ${2:-}" in
  'sts get-caller-identity')
    printf '%s\n' "${FAKE_CALLER_ACCOUNT:?}"
    exit 0
    ;;
  'cloudformation describe-stacks')
    case "${FAKE_CASE:?}" in
      tagged)
        printf 'arn:aws:cloudformation:us-west-2:123456789012:stack/cdkcicdtest-rtest-level0/abc\trtest\n' ;;
      untagged)
        printf 'arn:aws:cloudformation:us-west-2:123456789012:stack/cdkcicdtest-rtest-level0/abc\tNone\n' ;;
      empty-tag)
        printf 'arn:aws:cloudformation:us-west-2:123456789012:stack/cdkcicdtest-rtest-level0/abc\t\n' ;;
      wrong-account)
        printf 'arn:aws:cloudformation:us-west-2:210987654321:stack/cdkcicdtest-rtest-level0/abc\trtest\n' ;;
      wrong-region)
        printf 'arn:aws:cloudformation:eu-west-1:123456789012:stack/cdkcicdtest-rtest-level0/abc\trtest\n' ;;
      missing)
        echo 'An error occurred (ValidationError): Stack with id does not exist' >&2
        exit 254 ;;
      *)
        echo "fake aws: unknown FAKE_CASE '${FAKE_CASE}'" >&2
        exit 99 ;;
    esac
    exit 0
    ;;
  'cloudformation delete-stack'|'cloudformation wait')
    # Only reachable if the guard let something through. Shout about it.
    echo "fake aws: DELETE REACHED ($*)" >&2
    exit 0
    ;;
esac
echo "fake aws: unexpected call: $*" >&2
exit 98
STUB
chmod +x "$STUB_DIR/aws"
PATH="$STUB_DIR:$PATH"
export PATH

# --- load the function under test -------------------------------------------
# harness.sh only runs main() when executed, not when sourced.
# shellcheck source=./harness.sh
. "$TEST_DIR/harness.sh"

# --- assertions --------------------------------------------------------------
failures=0
checked=0

# The guard signals refusal by `die` (exit 1), so every case runs in a subshell.
# usage: expect_refused <label> <fake_case> [stack-name [region]]
expect_refused() {
  local label="$1" fc="$2"; shift 2
  checked=$((checked + 1))
  local out rc=0
  out="$(
    export FAKE_CASE="$fc" FAKE_CALLER_ACCOUNT="$CALLER_ACCOUNT"
    guard_destroyable "$@" 2>&1
  )" || rc=$?
  if [ "$rc" = 0 ]; then
    printf 'NOT REFUSED  %s\n             guard said: %s\n' "$label" "$out"
    failures=$((failures + 1))
  elif ! printf '%s' "$out" | grep -q 'refusing to destroy'; then
    printf 'WRONG REASON %s\n             guard said: %s\n' "$label" "$out"
    failures=$((failures + 1))
  else
    printf '  refused    %-38s %s\n' "$label" "$(printf '%s' "$out" | tail -n1)"
  fi
}

# usage: expect_allowed <label> <fake_case> <stack-name> <region>
expect_allowed() {
  local label="$1" fc="$2"; shift 2
  checked=$((checked + 1))
  local out rc=0
  out="$(
    export FAKE_CASE="$fc" FAKE_CALLER_ACCOUNT="$CALLER_ACCOUNT"
    guard_destroyable "$@" 2>&1
  )" || rc=$?
  if [ "$rc" != 0 ]; then
    printf 'WRONGLY REFUSED %s\n             guard said: %s\n' "$label" "$out"
    failures=$((failures + 1))
  else
    printf '  allowed    %-38s %s\n' "$label" "$(printf '%s' "$out" | tail -n1)"
  fi
}

echo '== teardown guard refusal cases'

expect_refused 'unset stack name'          tagged
expect_refused 'empty stack name'          tagged ''                  us-west-2
expect_refused 'empty region'              tagged "$OUR_STACK"        ''
expect_refused 'CDKToolkit'                tagged CDKToolkit          us-west-2
expect_refused 'CDKToolkit-suffixed'       tagged CDKToolkit-custom   us-west-2
expect_refused 'name outside test prefix'  tagged my-production-stack us-west-2
expect_refused 'stack does not exist'      missing       "$OUR_STACK" us-west-2
expect_refused 'no cdk-cicd-wrapper-test tag' untagged   "$OUR_STACK" us-west-2
expect_refused 'empty cdk-cicd-wrapper-test tag' empty-tag "$OUR_STACK" us-west-2
expect_refused 'stack in another account'  wrong-account "$OUR_STACK" us-west-2
expect_refused 'stack in another region'   wrong-region  "$OUR_STACK" us-west-2

# Ambient credentials pointing elsewhere, stack otherwise perfectly ours.
CALLER_ACCOUNT="$OTHER_ACCOUNT"
expect_refused 'ambient creds, other account' tagged "$OUR_STACK" us-west-2
CALLER_ACCOUNT="$CDK_CICD_TEST_ACCOUNT"

echo '== positive control'
expect_allowed 'our own tagged stack'      tagged "$OUR_STACK" us-west-2

# =============================================================================
# destroy_stack ordering
#
# The cases above call guard_destroyable directly, which proves the guard refuses --
# but NOT that the delete path still consults it. Without these two, moving the
# delete-stack call above the guard inside destroy_stack keeps the whole suite green.
# The fake aws prints 'DELETE REACHED' on any delete-stack/wait, so that string is
# the witness: it must be absent when the guard refuses and present when it allows.
# =============================================================================
echo '== destroy_stack consults the guard before deleting'

destroy_out() {
  local fc="$1" stack="$2" region="$3"
  (
    export FAKE_CASE="$fc" FAKE_CALLER_ACCOUNT="$CALLER_ACCOUNT"
    destroy_stack "$stack" "$region" 2>&1
  ) || true
}

checked=$((checked + 1))
out="$(destroy_out untagged "$OUR_STACK" us-west-2)"
if printf '%s' "$out" | grep -q 'DELETE REACHED'; then
  printf 'DELETED ANYWAY  %-30s %s\n' 'untagged stack' "$out"
  failures=$((failures + 1))
else
  printf '  no delete   %-38s %s\n' 'untagged stack refused by destroy_stack' \
    "$(printf '%s' "$out" | tail -n1)"
fi

# Positive control for the witness itself: if 'DELETE REACHED' could never appear, the
# assertion above would pass vacuously.
checked=$((checked + 1))
out="$(destroy_out tagged "$OUR_STACK" us-west-2)"
if printf '%s' "$out" | grep -q 'DELETE REACHED'; then
  printf '  deleted     %-38s %s\n' 'our own tagged stack via destroy_stack' 'reached delete-stack'
else
  printf 'NOT DELETED     %-30s %s\n' 'our own tagged stack' "$out"
  failures=$((failures + 1))
fi

echo
if [ "$failures" = 0 ]; then
  printf 'PASS: %s/%s guard cases behaved as specified\n' "$checked" "$checked"
  exit 0
fi
printf 'FAIL: %s of %s guard cases misbehaved\n' "$failures" "$checked"
exit 1
