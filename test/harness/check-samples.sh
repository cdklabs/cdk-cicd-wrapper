#!/usr/bin/env bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Sample-app project harness. For every app under samples/ this:
#   1. runs a dependency SECURITY audit (npm audit for a package.json, pip-audit for requirements.txt),
#   2. runs the runtime/EOL + cdk-floor policy check (check-samples.mjs against runtime-policy.json).
#
# FAILS (non-zero exit) on: a high/critical dependency vulnerability, or a Lambda runtime past its AWS
# deprecation date without an explicit `cdk-cicd:allow-runtime` opt-out. WARNS (does not fail) on: a
# supported-but-not-latest runtime, or an aws-cdk-lib floor below the policy. Warnings are printed so a
# reviewer sees drift accumulating before it becomes an EOL failure.
#
# Reused by the `check:samples` projen task and the `sample-harness` GitHub workflow.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
SAMPLES_DIR="$REPO_ROOT/samples"
fail=0

echo "== dependency security audit =="
while IFS= read -r pkg; do
  dir="$(dirname "$pkg")"
  case "$dir" in *node_modules*) continue;; esac
  echo "-- npm audit: ${dir#$REPO_ROOT/}"
  # --audit-level=high so a low/moderate advisory warns in the log but only high/critical fails the gate.
  ( cd "$dir" && npm audit --omit=dev --audit-level=high ) || { echo "  FAIL: high/critical npm advisory in ${dir#$REPO_ROOT/}"; fail=1; }
done < <(find "$SAMPLES_DIR" -maxdepth 2 -name package.json -not -path '*/node_modules/*')

while IFS= read -r req; do
  dir="$(dirname "$req")"
  echo "-- pip-audit: ${dir#$REPO_ROOT/}"
  if command -v pip-audit >/dev/null 2>&1; then
    ( cd "$dir" && pip-audit -r "$(basename "$req")" ) || { echo "  FAIL: vulnerable python dependency in ${dir#$REPO_ROOT/}"; fail=1; }
  else
    echo "  SKIP: pip-audit not installed"
  fi
done < <(find "$SAMPLES_DIR" -maxdepth 2 -name requirements.txt -not -path '*/.venv/*')

echo
echo "== runtime / EOL / cdk-currency policy =="
node "$HERE/check-samples.mjs" || fail=1

echo
if [ "$fail" -ne 0 ]; then
  echo "Sample harness: FAILED — fix the issues above (or add cdk-cicd:allow-runtime for an intentional pin)."
  exit 1
fi
echo "Sample harness: PASSED."
