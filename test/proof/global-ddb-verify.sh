#!/usr/bin/env bash
# =============================================================================
# global-ddb-verify -- proves v3 deploys a DynamoDB GLOBAL TABLE across regions. From the global-ddb-app
# fixture, `cdk-cicd deploy --stage dev` deploys one stack in the primary region that owns a TableV2 with
# a replica in the secondary region; the gate then asserts the table in the primary region carries the
# replica AND the replica table is ACTIVE in the secondary region. Then it tears everything down.
#
#   bash test/proof/global-ddb-verify.sh
#
# Uses the gitignored .env + ambient creds; every AWS call redacted; the stack (and its global table +
# replica, via RemovalPolicy.DESTROY) is torn down through the harness guard on exit.
# =============================================================================
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./harness.sh
. "$HERE/harness.sh"

readonly FIXTURE='global-ddb-app'

stack_of()  { printf '%s-%s-global-ddb\n' "$STACK_PREFIX" "$CDK_CICD_TEST_RUN_ID"; }
table_of()  { printf '%s-%s-global\n' "$STACK_PREFIX" "$CDK_CICD_TEST_RUN_ID"; }

main_ddb() {
  load_env; ensure_run_id
  local primary="$CDK_CICD_TEST_REGION_PRIMARY" secondary="$CDK_CICD_TEST_REGION_SECONDARY"
  log "global-ddb-verify (run $CDK_CICD_TEST_RUN_ID) primary $primary, replica $secondary"
  local actual; actual="$(caller_account)" || die 'no caller identity'
  [ "$actual" = "$CDK_CICD_TEST_ACCOUNT" ] || die 'caller is not the test account'

  local dir stack table rc=0
  dir="$(fixture_dir "$FIXTURE")"; stack="$(stack_of)"; table="$(table_of)"

  # --- deploy via the v3 CLI (single stage; the replica is created cross-region) --------------------
  log "leg 1: cdk-cicd deploy --stage dev ($primary) -- provisions the global table + $secondary replica"
  if ! ( cd "$dir" \
          && CDK_DEFAULT_ACCOUNT="$CDK_CICD_TEST_ACCOUNT" CDK_DEFAULT_REGION="$primary" \
             AWS_REGION="$primary" AWS_DEFAULT_REGION="$primary" \
             npx cdk-cicd deploy --stage dev --yes 2>&1 | redact ); then rc=1; fi

  # Tag the stack so the teardown guard accepts it (cdk-cicd deploy does not tag). Armed as a trap so a
  # later failure still tears down.
  if [ "$rc" = 0 ]; then
    aws cloudformation update-stack --stack-name "$stack" --region "$primary" --use-previous-template \
      --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM --tags "Key=$TAG_KEY,Value=$CDK_CICD_TEST_RUN_ID" >/dev/null 2>&1 || true
    aws cloudformation wait stack-update-complete --stack-name "$stack" --region "$primary" >/dev/null 2>&1 || true
  fi
  trap 'teardown_ddb' EXIT

  if [ "$rc" = 0 ]; then
    log 'leg 2: assert the global table is multi-region'
    # Primary: the table exists and lists the secondary region as a replica.
    local replicas
    replicas="$(aws_masked dynamodb describe-table --table-name "$table" --region "$primary" \
      --query 'Table.Replicas[].RegionName' --output text 2>/dev/null)" || true
    info "primary $primary replicas: ${replicas:-none}"
    case " $replicas " in
      *" $secondary "*) info "replica $secondary present on the primary table" ;;
      *) log "replica $secondary NOT listed on the primary table"; rc=1 ;;
    esac
    # Secondary: the replica table is ACTIVE there.
    local status
    status="$(aws_masked dynamodb describe-table --table-name "$table" --region "$secondary" \
      --query 'Table.TableStatus' --output text 2>/dev/null)" || true
    if [ "$status" = 'ACTIVE' ]; then info "replica table ACTIVE in $secondary -- PROVED a multi-region global table"; \
      else log "replica table in $secondary is '${status:-missing}'"; rc=1; fi
  fi

  log 'teardown (stack + global table + replica) runs on exit'
  [ "$rc" = 0 ] && log 'global-ddb-verify PASSED: v3 deployed a DynamoDB global table across two regions, then torn down' \
                || log 'global-ddb-verify FAILED'
  return "$rc"
}

# Guarded teardown. The harness guard requires the run-id tag; if tagging never landed (e.g. deploy failed
# before leg-1's tag step), fall back to a prefix+account-guarded delete so a partial stack cannot orphan.
teardown_ddb() {
  local stack region; stack="$(stack_of)"; region="$CDK_CICD_TEST_REGION_PRIMARY"
  if ! ( destroy_stack "$stack" "$region" ); then
    local sid arn_acct amb
    sid="$(aws cloudformation describe-stacks --stack-name "$stack" --region "$region" --query 'Stacks[0].StackId' --output text 2>/dev/null)" || true
    if [ -n "$sid" ] && [ "$sid" != 'None' ]; then
      arn_acct="$(printf '%s' "$sid" | cut -d: -f5)"; amb="$(caller_account 2>/dev/null || true)"
      case "$stack" in
        "$STACK_PREFIX"-*)
          if [ "$arn_acct" = "$CDK_CICD_TEST_ACCOUNT" ] && [ "$amb" = "$CDK_CICD_TEST_ACCOUNT" ]; then
            log "fallback: deleting untagged '$stack' (prefix+account guarded)"
            aws cloudformation delete-stack --stack-name "$stack" --region "$region" >/dev/null 2>&1
            aws cloudformation wait stack-delete-complete --stack-name "$stack" --region "$region" >/dev/null 2>&1 \
              && info "fallback delete complete" || die "MANUAL CLEANUP NEEDED: stack '$stack' in $region"
          else die "MANUAL CLEANUP NEEDED: '$stack' account/ambient mismatch -- refusing to delete"
          fi
          ;;
        *) die "MANUAL CLEANUP NEEDED: '$stack' outside '$STACK_PREFIX-' prefix -- refusing to delete" ;;
      esac
    fi
  fi
}

main_ddb "$@"
