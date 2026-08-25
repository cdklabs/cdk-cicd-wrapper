#!/usr/bin/env bash
# =============================================================================
# m1-verify -- the Wave 1 exit gate for the app-config layer.
#
# The unit suite (test/v3, 60 tests) proves the loader/validator in isolation.
# This proves the last acceptance leg the unit tests cannot: that the config
# layer actually drives a real `cdk synth`, and that a missing required field
# makes synth exit non-zero with the right ConfigError kind rather than
# emitting a half-configured template.
#
# Offline by design: Wave 1 has zero AWS dependency. No credentials, no deploy.
# The positive path uses a placeholder account; the negative path runs with
# credentials fully isolated so no ambient account can mask the failure.
#
#   bash test/proof/m1-verify.sh
# =============================================================================
set -euo pipefail

FIXTURE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../fixtures/level1-app" && pwd)"
PLACEHOLDER_ACCOUNT='111111111111'   # never a real account; synth-only
OUT_BASE="$(mktemp -d)"
trap 'rm -rf "$OUT_BASE"' EXIT

pass=0
fail=0
ok()   { printf '  ok    %s\n' "$*"; pass=$((pass + 1)); }
bad()  { printf 'FAIL    %s\n' "$*"; fail=$((fail + 1)); }

# The stage config feeds the app through the wrapper's file-fallback path -- AppConfig.of
# with no injected context, loading config/<stage>.json directly. level1-app's cdk.json now
# runs `cdk-cicd exec` (the m2 injection path), so this gate forces the plain path with an
# explicit --app override; that is exactly the code path a plain `cdk deploy` (no exec) hits,
# which is what m1 must keep guarding independently of m2.
PLAIN_APP='npx ts-node -P tsconfig.json --prefer-ts-exts bin/app.ts'

# A `cdk synth` with the ambient environment scrubbed to exactly what the caller
# passes. Isolating the credential sources (container endpoint, shared files,
# IMDS) is what makes the negative case deterministic -- otherwise the CDK CLI
# resolves an account from ambient creds and fills aws.accountId behind our back.
synth() {
  local out="$1"; shift
  ( cd "$FIXTURE_DIR" \
    && env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN \
           -u AWS_CONTAINER_CREDENTIALS_FULL_URI -u AWS_CONTAINER_AUTHORIZATION_TOKEN \
           -u AWS_CONTAINER_CREDENTIALS_RELATIVE_URI -u AWS_PROFILE \
           -u AWS_WEB_IDENTITY_TOKEN_FILE -u AWS_ROLE_ARN -u AWS_ROLE_SESSION_NAME \
           -u CDK_DEFAULT_ACCOUNT -u CDK_DEFAULT_REGION -u AWS_REGION -u AWS_DEFAULT_REGION \
           AWS_EC2_METADATA_DISABLED=true \
           AWS_SHARED_CREDENTIALS_FILE=/dev/null AWS_CONFIG_FILE=/dev/null \
           CDK_CICD_TEST_RUN_ID=m1verify \
           "$@" \
           npx cdk synth --app "$PLAIN_APP" --output "$out" >"$out.log" 2>&1 )
}

echo '== m1-verify: config drives synth, and fails closed'

# --- positive: CDK_STAGE=dev resolves config/dev.json, account derived ---------
if synth "$OUT_BASE/dev" CDK_STAGE=dev CDK_DEFAULT_ACCOUNT="$PLACEHOLDER_ACCOUNT" CDK_DEFAULT_REGION=us-west-2; then
  if grep -q 'cdkcicdtest-level1 fixture' "$OUT_BASE/dev"/*.template.json 2>/dev/null; then
    ok 'config/dev.json drives synth (application folded into the template)'
  else
    bad 'dev synth succeeded but the config value did not reach the template'
  fi
else
  bad "dev synth exited non-zero (see $OUT_BASE/dev.log)"; cat "$OUT_BASE/dev.log"
fi

# --- positive: CDK_STAGE unset falls back to config/local.json -----------------
if synth "$OUT_BASE/local" CDK_DEFAULT_ACCOUNT="$PLACEHOLDER_ACCOUNT" CDK_DEFAULT_REGION=us-west-2; then
  ok 'CDK_STAGE unset falls back to config/local.json and synths'
else
  bad "local synth exited non-zero (see $OUT_BASE/local.log)"; cat "$OUT_BASE/local.log"
fi

# --- negative: no account anywhere -> MISSING_ATTRIBUTE, non-zero exit ----------
# Credentials fully isolated (see synth()), and CDK_DEFAULT_ACCOUNT unset, so
# applyDerivedDefaults cannot fill aws.accountId and validation throws.
if synth "$OUT_BASE/neg" CDK_STAGE=dev; then
  bad 'negative case synthesized successfully -- a missing account should have failed synth'
  cat "$OUT_BASE/neg.log"
else
  # Right failure, not an incidental one. The message wording is the kind assertion and is
  # Node-version-independent: only MISSING_ATTRIBUTE says "attribute" (MISSING_KEY says "key"),
  # so this text uniquely identifies the kind without depending on how Node renders the thrown
  # error's `kind` property.
  if grep -q "required config attribute 'aws.accountId'" "$OUT_BASE/neg.log"; then
    ok "missing account fails synth with ConfigError MISSING_ATTRIBUTE on aws.accountId"
  else
    bad 'negative case failed, but not with the expected MISSING_ATTRIBUTE on aws.accountId'
    cat "$OUT_BASE/neg.log"
  fi
fi

echo
if [ "$fail" = 0 ]; then
  printf 'PASS: %s/%s m1-verify checks passed\n' "$pass" "$pass"
  exit 0
fi
printf 'FAIL: %s of %s m1-verify checks failed\n' "$fail" "$((pass + fail))"
exit 1
