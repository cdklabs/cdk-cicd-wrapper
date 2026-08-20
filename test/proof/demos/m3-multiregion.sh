#!/usr/bin/env bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# M3 milestone proof: the v3 deploy model on real AWS. One `cdk-cicd deploy` builds a stage
# once and rolls it out to TWO regions, and the drift rule refuses a deploy whose synthesized
# account does not match where it is headed.
#
#   test/proof/record-demo.sh m3-multiregion
#
# This DOES touch AWS: it drives test/proof/m3-verify.sh (reads the gitignored .env, deploys
# level1-app's dev stage to us-west-2 + us-west-1, asserts, destroys, then proves the drift
# refusal on hardcoded-env-app). Every AWS call is redacted; no account id reaches the recording.

. "$(dirname "$0")/../narrate.sh"

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "${REPO_ROOT}"

step "Where this recording came from"
say "Provenance first: branch, commit, clean tree."
run git rev-parse --abbrev-ref HEAD
run git rev-parse --short HEAD
run_sh 'git status --porcelain | head'

step "What M3 adds: deploy-time synth, multi-region, and a drift guard"
say "A user writes ONE cicd.config.ts. level1-app's 'dev' stage lists two regions:"
run_sh 'grep -A1 "name: .dev." '"${REPO_ROOT}"'/test/fixtures/level1-app/cicd.config.ts | sed "s/process.env.*!/<from env>/"'
say "The deploy model is: synth each stage x region at deploy time, check each synthesized"
say "assembly for drift (does its account/region match where we are deploying?), and only"
say "then deploy. An account mismatch aborts; a region mismatch only warns."

step "Deploy one stage to two regions, from a single build"
say "One command. It synthesizes dev for both regions, drift-checks each, deploys both, and"
say "-- because this is the test harness -- asserts each region then tears them down through"
say "the teardown guard. The deploys are real; asciinema compresses the wait."
run bash test/proof/m3-verify.sh

step "What just happened"
say "Leg 1 proved one build reached us-west-2 AND us-west-1, both injected, both destroyed."
say "Leg 2 proved the drift rule REFUSED a foreign-account deploy -- nothing shipped."
note "Nothing is left behind; the teardown guard governed every delete."

outro "M3 verified on real AWS: define once, synth per stage x region, drift-gated, multi-region deploy. Next: the CodePipeline engine (M4)."
