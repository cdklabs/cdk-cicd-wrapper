#!/usr/bin/env bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Demo #1 (the M2 milestone proof, decision D3): a REAL deploy to the test account showing
# that runtime injection is differential -- a plain app stays inert, an exec-driven app is
# injected -- and that everything is torn down through the guard, leaving nothing behind.
#
#   test/proof/record-demo.sh m2-deploy
#
# This one DOES touch AWS: it drives test/proof/m2-verify.sh, which reads the gitignored .env,
# deploys level0-app + level1-app to us-west-2, asserts, and destroys both. Every AWS call is
# redacted by the harness, so no account id ever reaches the recording (verified after record).

. "$(dirname "$0")/../narrate.sh"

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "${REPO_ROOT}"

step "Where this recording came from"
say "Provenance first: branch, commit, clean tree."
run git rev-parse --abbrev-ref HEAD
run git rev-parse --short HEAD
run_sh 'git status --porcelain | head'

step "What the M2 gate proves"
say "Two fixtures, deployed for real to the test account:"
say "  level0-app -- a plain 'cdk init' app; its cdk.json runs the app directly."
say "  level1-app -- identical shape, but its cdk.json runs 'cdk-cicd exec'."
say "Injection must be DIFFERENTIAL: level0 stays inert (the wrapper adds nothing), level1"
say "is injected (the wrapper applies a config-driven tag tree-wide). We prove it on the"
say "REAL deployed template, then destroy both through the teardown guard."
note "Every AWS call below is redacted -- the account id never appears."

step "Deploy -> assert -> destroy, for real"
say "One command runs the whole gate. The deploys are real; asciinema compresses the wait."
run bash test/proof/m2-verify.sh

step "Nothing left behind"
say "The gate destroyed both stacks through the guard. A sweep confirms no fixture orphans"
say "remain -- the only tagged stacks are the CDK bootstrap stacks, which the guard refuses."
run_sh 'bash test/proof/harness.sh sweep | grep -E "level0|level1" || echo "   no level0/level1 fixture stacks remain"'

outro "M2 verified against real AWS: zero-touch injection, differential and reversible. Demo #1 complete."
