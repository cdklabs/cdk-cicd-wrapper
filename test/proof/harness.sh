#!/usr/bin/env bash
# =============================================================================
# cdk-cicd-wrapper zero-touch proof harness -- deploy -> assert -> destroy against the
# real test account.
#
# The governing rule for this repo is "nothing untested reaches GitHub". This is
# the loop that proves it, and `harness.test.sh` next door proves this file's
# teardown guard refuses to touch anything that is not ours.
#
# Config comes from the gitignored repo-root .env:
#   CDK_CICD_TEST_ACCOUNT, CDK_CICD_TEST_REGION_PRIMARY, CDK_CICD_TEST_REGION_SECONDARY
# Optional overrides:
#   CDK_CICD_TEST_RUN_ID   reuse one run id across separate subcommand invocations
#   CDK_CICD_ENV_FILE      alternative .env path
#   CDK_CICD_REPO_ROOT     alternative repo root (default: `git rev-parse` from here)
#   CDK_CICD_FIXTURE_DIR   alternative fixture root (default: <repo>/test/fixtures)
#   CDK_CICD_REDACT=0      stop masking the account id in this script's output
#
# Location is fixed by decision D7 in task.md: harness tooling is committed here
# under `test/proof/`, while raw run logs stay in the gitignored
# `development/v3-proof/`. Nothing in this script depends on its own path -- it
# finds the repo root via git and the fixture root via env.
#
# Requires bash (pipefail, process substitution), not a strict POSIX sh.
# =============================================================================
set -euo pipefail

# --- constants ---------------------------------------------------------------
readonly TAG_KEY='cdk-cicd-wrapper-test'   # the ONLY thing that makes a stack destroyable
readonly FIXTURE_TAG_KEY='cdk-cicd-wrapper-fixture'
readonly STACK_PREFIX='cdkcicdtest'
readonly BOOTSTRAP_SSM_PARAM='/cdk-bootstrap/hnb659fds/version'

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly HARNESS_DIR

usage() {
  cat <<'EOF'
usage: harness.sh <subcommand>

  creds                          assert AWS credentials resolve to CDK_CICD_TEST_ACCOUNT
  check-bootstrap                assert the CDK bootstrap SSM parameter exists in both regions
  deploy  <fixture> [region]     synth+deploy a fixture, tagged with a run id
  assert  <fixture> [region]     query AWS to prove the stack and its resource really exist
  destroy <fixture> [region]     tear the fixture down (through the teardown guard)
  sweep [--destroy]              list every stack tagged cdk-cicd-wrapper-test, with age
  run     <fixture> [region]     creds -> check-bootstrap -> deploy -> assert -> destroy

Fixtures are directories under <repo>/test/fixtures, e.g. level0-app.
Region defaults to CDK_CICD_TEST_REGION_PRIMARY.
EOF
}

# --- plumbing ----------------------------------------------------------------
die()  { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
log()  { printf '\n== %s\n' "$*"; }
info() { printf '   %s\n' "$*"; }

# Mask the account id in anything this script prints: the proof log is meant to be
# readable by a human and pasted into a review, so the account id may not leak in.
redact() {
  if [ -n "${CDK_CICD_TEST_ACCOUNT:-}" ] && [ "${CDK_CICD_REDACT:-1}" = '1' ]; then
    sed -e "s/${CDK_CICD_TEST_ACCOUNT}/<account>/g"
  else
    cat
  fi
}

# Run the AWS CLI with its stderr masked, for the calls whose stdout we capture with $(...).
# An AWS authorization failure reads "User: arn:aws:sts::<account>:assumed-role/... is not authorized
# to ...", so the account id leaks on exactly the path most likely to be hit and then pasted into a
# review -- or recorded into a committed demo. stderr is buffered to a file and filtered synchronously
# rather than through a background process substitution, so nothing is lost or reordered on exit.
aws_masked() {
  local err rc=0 out
  err="$(mktemp)"
  out="$(aws "$@" 2>"$err")" || rc=$?
  if [ -s "$err" ]; then redact <"$err" >&2; fi
  rm -f "$err"
  printf '%s' "$out"
  return "$rc"
}

repo_root() {
  if [ -n "${CDK_CICD_REPO_ROOT:-}" ]; then
    printf '%s\n' "$CDK_CICD_REPO_ROOT"
  else
    git -C "$HARNESS_DIR" rev-parse --show-toplevel
  fi
}

# Idempotent. Skips the .env read when CDK_CICD_TEST_ACCOUNT is already exported,
# which is what lets harness.test.sh source this file with no .env in sight.
load_env() {
  if [ -z "${CDK_CICD_TEST_ACCOUNT:-}" ]; then
    local env_file="${CDK_CICD_ENV_FILE:-$(repo_root)/.env}"
    [ -f "$env_file" ] || die "no env file at $env_file (see CLAUDE.md #AWS / test account)"
    set -a
    # shellcheck disable=SC1090
    . "$env_file"
    set +a
  fi
  [ -n "${CDK_CICD_TEST_ACCOUNT:-}" ]          || die 'CDK_CICD_TEST_ACCOUNT is unset'
  [ -n "${CDK_CICD_TEST_REGION_PRIMARY:-}" ]   || die 'CDK_CICD_TEST_REGION_PRIMARY is unset'
  [ -n "${CDK_CICD_TEST_REGION_SECONDARY:-}" ] || die 'CDK_CICD_TEST_REGION_SECONDARY is unset'
  case "$CDK_CICD_TEST_ACCOUNT" in
    [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]) ;;
    *) die 'CDK_CICD_TEST_ACCOUNT is not a 12-digit account id' ;;
  esac
}

# A run id ties a stack, its SSM parameter and its tag together. Generated once per
# `run`; standalone subcommands need it exported so they agree on the same stack.
ensure_run_id() {
  if [ -z "${CDK_CICD_TEST_RUN_ID:-}" ]; then
    CDK_CICD_TEST_RUN_ID="r$(date -u +%Y%m%d%H%M%S)"
    export CDK_CICD_TEST_RUN_ID
    info "generated run id $CDK_CICD_TEST_RUN_ID  (export CDK_CICD_TEST_RUN_ID=$CDK_CICD_TEST_RUN_ID to reuse)"
  fi
}

fixture_root()  { printf '%s\n' "${CDK_CICD_FIXTURE_DIR:-$(repo_root)/test/fixtures}"; }
fixture_short() { printf '%s\n' "${1%-app}"; }   # level0-app -> level0

fixture_dir() {
  local dir="$(fixture_root)/$1"
  [ -f "$dir/cdk.json" ] || die "no such fixture: $1 (looked for $dir/cdk.json)"
  printf '%s\n' "$dir"
}

# The one naming rule, mirrored by each fixture's bin/app.ts and stack.
stack_name()  { printf '%s-%s-%s\n' "$STACK_PREFIX" "$CDK_CICD_TEST_RUN_ID" "$(fixture_short "$1")"; }
param_name()  { printf '/%s/%s/%s\n' "$STACK_PREFIX" "$CDK_CICD_TEST_RUN_ID" "$(fixture_short "$1")"; }
cdk_out_dir() { printf '%s\n' "${TMPDIR:-/tmp}/cdkcicdtest-$CDK_CICD_TEST_RUN_ID-$1.cdk.out"; }

region_or_default() { printf '%s\n' "${1:-$CDK_CICD_TEST_REGION_PRIMARY}"; }
caller_account()    { aws_masked sts get-caller-identity --query Account --output text; }

# =============================================================================
# THE TEARDOWN GUARD
#
# The most important function in this file. Nothing is deleted unless this returns
# 0, and every destroy path goes through destroy_stack, which calls it first.
# It refuses on:
#
#   1. empty / unset stack name
#   2. empty / unset region
#   3. the CDKToolkit bootstrap stack (by name, before any API call)
#   4. a stack name outside the disposable `cdkcicdtest-` prefix
#   5. describe-stacks failure -- stack does not exist (or no permission)
#   6. the stack's own ARN region != the region we were told to act in
#   7. the stack's own ARN account != CDK_CICD_TEST_ACCOUNT
#   8. ambient credentials pointing at some other account
#   9. the `cdk-cicd-wrapper-test` tag absent or empty
#
# 6-8 are what stop a stale profile or a copy-pasted region from turning this into
# a deletion in someone else's account.
# =============================================================================
guard_destroyable() {
  local stack="${1:-}" region="${2:-}"

  [ -n "$stack" ]  || die 'guard: refusing to destroy -- empty stack name'
  [ -n "$region" ] || die 'guard: refusing to destroy -- empty region'

  case "$stack" in
    CDKToolkit|CDKToolkit-*)
      die "guard: refusing to destroy '$stack' -- that is the CDK bootstrap stack" ;;
  esac

  case "$stack" in
    "$STACK_PREFIX"-*) ;;
    *) die "guard: refusing to destroy '$stack' -- outside the disposable '$STACK_PREFIX-' prefix" ;;
  esac

  load_env

  local live
  live="$(aws cloudformation describe-stacks \
            --stack-name "$stack" --region "$region" \
            --query "[Stacks[0].StackId, Stacks[0].Tags[?Key=='${TAG_KEY}']|[0].Value]" \
            --output text 2>/dev/null)" \
    || die "guard: refusing to destroy '$stack' -- describe-stacks failed in $region (stack not found?)"

  local stack_id tag_value
  stack_id="$(printf '%s\n' "$live" | cut -f1)"
  tag_value="$(printf '%s\n' "$live" | cut -f2)"

  # arn:aws:cloudformation:<region>:<account>:stack/<name>/<uuid>
  local arn_region arn_account
  arn_region="$(printf '%s\n' "$stack_id" | cut -d: -f4)"
  arn_account="$(printf '%s\n' "$stack_id" | cut -d: -f5)"

  [ "$arn_region" = "$region" ] \
    || die "guard: refusing to destroy '$stack' -- stack lives in '$arn_region', asked to act in '$region'"
  [ "$arn_account" = "$CDK_CICD_TEST_ACCOUNT" ] \
    || die "guard: refusing to destroy '$stack' -- stack account is not CDK_CICD_TEST_ACCOUNT"

  local ambient
  ambient="$(caller_account 2>/dev/null || true)"
  [ "$ambient" = "$CDK_CICD_TEST_ACCOUNT" ] \
    || die "guard: refusing to destroy '$stack' -- ambient credentials are not for CDK_CICD_TEST_ACCOUNT"

  case "$tag_value" in
    ''|None|null)
      die "guard: refusing to destroy '$stack' -- it does not carry the '$TAG_KEY' tag" ;;
  esac

  info "guard: '$stack' is ours ($TAG_KEY=$tag_value) in $region -- destroy allowed"
}

# The ONLY code path in this file that deletes a stack.
#
# Every AWS call here is followed by an explicit `|| die`, and that is load-bearing rather than
# belt-and-braces: `cmd_run` invokes its steps as `if ! ( cmd_x )`, and bash DISABLES errexit inside a
# subshell used as an `if` condition -- for the whole call tree. Without these checks a failed
# delete-stack, or a waiter that returns because the stack went DELETE_FAILED, would fall through to
# `info "deleted"` and report success while leaking the stack.
destroy_stack() {
  local stack="${1:-}" region="${2:-}"
  guard_destroyable "$stack" "$region"

  info "deleting $stack in $region"
  aws cloudformation delete-stack --stack-name "$stack" --region "$region" </dev/null 2>&1 | redact \
    || die "delete-stack failed for '$stack' in $region"
  aws cloudformation wait stack-delete-complete --stack-name "$stack" --region "$region" </dev/null 2>&1 | redact \
    || die "waiting for '$stack' to delete failed in $region -- it may be DELETE_FAILED; check the console"
  info "deleted $stack"
}

# =============================================================================
# subcommands
# =============================================================================
cmd_creds() {
  load_env
  log 'creds'
  # Credential-agnostic: obtain AWS credentials for CDK_CICD_TEST_ACCOUNT by whatever mechanism you
  # use (env vars, a shared-config/SSO profile, or your org's credential tool), then run this to
  # assert the resolved identity is the intended test account.
  local actual
  actual="$(caller_account)" \
    || die 'aws sts get-caller-identity failed -- configure AWS credentials for CDK_CICD_TEST_ACCOUNT first'
  [ "$actual" = "$CDK_CICD_TEST_ACCOUNT" ] \
    || die 'sts get-caller-identity returned a DIFFERENT account than CDK_CICD_TEST_ACCOUNT'
  aws_masked sts get-caller-identity --query Arn --output text | redact
  info 'credentials resolve to CDK_CICD_TEST_ACCOUNT'
}

cmd_check_bootstrap() {
  load_env
  log 'check-bootstrap'
  local region version
  for region in "$CDK_CICD_TEST_REGION_PRIMARY" "$CDK_CICD_TEST_REGION_SECONDARY"; do
    version="$(aws ssm get-parameter --name "$BOOTSTRAP_SSM_PARAM" --region "$region" \
                 --query Parameter.Value --output text 2>/dev/null)" \
      || die "no CDK bootstrap in $region ($BOOTSTRAP_SSM_PARAM missing) -- wait for cdk bootstrap"
    info "$region bootstrapped, version $version"
  done
}

cmd_deploy() {
  local fixture="${1:-}" region
  [ -n "$fixture" ] || die 'deploy needs a fixture name'
  load_env
  region="$(region_or_default "${2:-}")"
  ensure_run_id

  local dir stack out
  dir="$(fixture_dir "$fixture")"
  stack="$(stack_name "$fixture")"
  # cdk.out lands outside the repo so a synth can never drop an account id into the
  # working tree (cdk.out manifests contain it).
  out="$(cdk_out_dir "$fixture")"

  log "deploy $fixture -> $stack ($region)"
  # `|| die` for the same reason as in destroy_stack: errexit does not apply here when cmd_run calls us.
  ( cd "$dir" \
    && AWS_REGION="$region" AWS_DEFAULT_REGION="$region" \
       CDK_DEFAULT_ACCOUNT="$CDK_CICD_TEST_ACCOUNT" CDK_DEFAULT_REGION="$region" \
       npx cdk deploy "$stack" \
         --output "$out" \
         --require-approval never \
         --tags "$TAG_KEY=$CDK_CICD_TEST_RUN_ID" \
         --tags "$FIXTURE_TAG_KEY=$fixture" 2>&1 ) | redact \
    || die "cdk deploy failed for $fixture in $region"
  info "deployed $stack"
}

# Verifies the AWS-side facts directly. A green `cdk deploy` exit code is not
# evidence that the resource is there.
cmd_assert() {
  local fixture="${1:-}" region
  [ -n "$fixture" ] || die 'assert needs a fixture name'
  load_env
  region="$(region_or_default "${2:-}")"
  [ -n "${CDK_CICD_TEST_RUN_ID:-}" ] || die 'assert needs CDK_CICD_TEST_RUN_ID exported'

  local stack param
  stack="$(stack_name "$fixture")"
  param="$(param_name "$fixture")"

  log "assert $fixture ($stack in $region)"

  local status
  status="$(aws cloudformation describe-stacks --stack-name "$stack" --region "$region" \
              --query 'Stacks[0].StackStatus' --output text 2>/dev/null)" \
    || die "assert: stack $stack not found in $region"
  case "$status" in
    CREATE_COMPLETE|UPDATE_COMPLETE) info "stack status $status" ;;
    *) die "assert: stack $stack is $status" ;;
  esac

  local run_tag fixture_tag
  run_tag="$(aws_masked cloudformation describe-stacks --stack-name "$stack" --region "$region" \
               --query "Stacks[0].Tags[?Key=='${TAG_KEY}']|[0].Value" --output text)"
  fixture_tag="$(aws_masked cloudformation describe-stacks --stack-name "$stack" --region "$region" \
               --query "Stacks[0].Tags[?Key=='${FIXTURE_TAG_KEY}']|[0].Value" --output text)"
  [ "$run_tag" = "$CDK_CICD_TEST_RUN_ID" ] || die "assert: $TAG_KEY tag is '$run_tag', expected the run id"
  [ "$fixture_tag" = "$fixture" ]          || die "assert: $FIXTURE_TAG_KEY tag is '$fixture_tag', expected '$fixture'"
  info "tags present: $TAG_KEY=$run_tag $FIXTURE_TAG_KEY=$fixture_tag"

  local value
  value="$(aws ssm get-parameter --name "$param" --region "$region" \
             --query Parameter.Value --output text 2>/dev/null)" \
    || die "assert: SSM parameter $param does not exist in $region"
  [ -n "$value" ] || die "assert: SSM parameter $param is empty"
  info "SSM $param = '$value'"
  info 'assert OK'
}

cmd_destroy() {
  local fixture="${1:-}" region
  [ -n "$fixture" ] || die 'destroy needs a fixture name'
  load_env
  region="$(region_or_default "${2:-}")"
  [ -n "${CDK_CICD_TEST_RUN_ID:-}" ] || die 'destroy needs CDK_CICD_TEST_RUN_ID exported'

  log "destroy $fixture ($region)"
  destroy_stack "$(stack_name "$fixture")" "$region"
  rm -rf "$(cdk_out_dir "$fixture")"
}

# Orphan detection. Lists, then (optionally) destroys -- and the destroys still go
# through the guard, so a tagged-but-oddly-named stack gets reported and refused
# rather than deleted. The sweep continues past a refusal and exits non-zero at the end.
cmd_sweep() {
  load_env
  local do_destroy=0
  if [ "${1:-}" = '--destroy' ]; then do_destroy=1; fi

  log 'sweep'
  local found=0 region rows stack created status tag age_h now
  local -a doomed=()
  now="$(date -u +%s)"

  for region in "$CDK_CICD_TEST_REGION_PRIMARY" "$CDK_CICD_TEST_REGION_SECONDARY"; do
    rows="$(aws_masked cloudformation describe-stacks --region "$region" \
              --query "Stacks[?Tags[?Key=='${TAG_KEY}']].[StackName,CreationTime,StackStatus,Tags[?Key=='${TAG_KEY}']|[0].Value]" \
              --output text)" || die "sweep: describe-stacks failed in $region"
    while IFS=$'\t' read -r stack created status tag; do
      [ -n "$stack" ] || continue
      found=$((found + 1))
      age_h=$(( (now - $(date -u -d "$created" +%s)) / 3600 ))
      printf '   %s  %s  status=%s  %s=%s  age=%sh\n' "$region" "$stack" "$status" "$TAG_KEY" "$tag" "$age_h"
      doomed+=("$region $stack")
    done <<<"$rows"
  done

  if [ "$found" = 0 ]; then
    info "no stacks tagged $TAG_KEY in $CDK_CICD_TEST_REGION_PRIMARY or $CDK_CICD_TEST_REGION_SECONDARY -- no orphans"
    return 0
  fi
  info "$found tagged stack(s) found"

  if [ "$do_destroy" = 1 ]; then
    # Each destroy runs in a subshell so that a guard refusal (which exits) skips just that stack
    # instead of wedging the rest of the sweep -- one tagged-but-renamed stack, or one already gone,
    # must not stop the real orphans being cleaned up.
    local entry refused=0
    for entry in "${doomed[@]}"; do
      if ! ( destroy_stack "${entry#* }" "${entry%% *}" ); then
        refused=$((refused + 1))
      fi
    done
    if [ "$refused" != 0 ]; then
      die "$refused of ${#doomed[@]} tagged stack(s) were not destroyed (see the refusals above)"
    fi
  else
    info 'run `harness.sh sweep --destroy` to tear these down'
  fi
}

# The whole loop. Teardown is attempted even when deploy or assert fails, so a
# failed run still leaves nothing behind -- but it still exits non-zero.
cmd_run() {
  local fixture="${1:-}" region
  [ -n "$fixture" ] || die 'run needs a fixture name'
  load_env
  region="$(region_or_default "${2:-}")"
  ensure_run_id

  log "run $fixture in $region  (run id $CDK_CICD_TEST_RUN_ID)"

  # Subshells: the subcommands signal failure by `die`, which exits. Running them
  # in a subshell turns that exit into a catchable non-zero status so teardown
  # always gets its turn.
  local rc=0
  if ! ( cmd_creds ); then rc=1; fi
  if [ "$rc" = 0 ] && ! ( cmd_check_bootstrap ); then rc=1; fi
  if [ "$rc" = 0 ] && ! ( cmd_deploy "$fixture" "$region" ); then rc=1; fi
  if [ "$rc" = 0 ] && ! ( cmd_assert "$fixture" "$region" ); then rc=1; fi

  if ! ( cmd_destroy "$fixture" "$region" ); then
    log 'teardown did not complete -- run `harness.sh sweep` to check for orphans'
    rc=1
  fi

  if [ "$rc" = 0 ]; then
    log "run OK: $fixture deployed, asserted and destroyed in $region"
  else
    log "run FAILED: $fixture in $region"
  fi
  return "$rc"
}

main() {
  local cmd="${1:-}"
  if [ "$#" -gt 0 ]; then shift; fi
  case "$cmd" in
    creds)             cmd_creds "$@" ;;
    check-bootstrap)   cmd_check_bootstrap "$@" ;;
    deploy)            cmd_deploy "$@" ;;
    assert)            cmd_assert "$@" ;;
    destroy)           cmd_destroy "$@" ;;
    sweep)             cmd_sweep "$@" ;;
    run)               cmd_run "$@" ;;
    ''|-h|--help|help) usage ;;
    *)                 usage; die "unknown subcommand '$cmd'" ;;
  esac
}

# Sourcing this file (harness.test.sh does) must not run anything.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main "$@"
fi
