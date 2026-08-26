#!/usr/bin/env bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# M4 milestone proof: the CodePipeline engine. From a tiny cicd.config.ts and ZERO wrapper code in the
# app, the wrapper renders ONE flat pipeline -- source, build, a self-updating stage, and one deploy
# action per stage, with manual-approval gates -- where Blueprint's CDK Pipelines grew 100+ CodeBuild projects.
#
#   test/proof/record-demo.sh m4-pipeline
#
# This demo is LOCAL and deterministic: it renders the pipeline in memory (no AWS, no publish, nothing
# left behind) so the recording shows the pipeline's shape without a 15-minute live run. The end-to-end
# proof on real AWS is test/proof/m4-verify.sh, which this narration points to and which has passed.

. "$(dirname "$0")/../narrate.sh"

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "${REPO_ROOT}"
TOUR="test/proof/demos/lib/m4-pipeline-tour.js"

step "Where this recording came from"
say "Provenance first: branch, short commit, and whether the tree was clean."
run git rev-parse --abbrev-ref HEAD
run git rev-parse --short HEAD
say "An empty listing means a clean tree."
run_sh 'git status --porcelain | grep -v "^ M .claude" | head'

step "Zero wrapper code in the user's app"
say "The whole M4 opt-in is one config file. No import of the wrapper in bin/, no CDK Pipelines"
say "constructs -- the app stays exactly what 'cdk init' produced."
run_sh 'sed -n "1,14p" test/fixtures/pipeline-app/cdk.json test/fixtures/pipeline-app/bin/app.ts'
note "cdk.json points at 'cdk-cicd exec'; the app itself is a plain CDK app."

step "One flat pipeline, rendered from that config"
say "The engine turns the config into a single CodePipeline. Source, a CI Build, a self-updating"
say "stage that re-deploys the pipeline from config each run, then ONE deploy action per stage."
say "A non-dev stage is gated: a manual approval is ordered ahead of its deploy."
run node "${TOUR}" default
note "4 CodeBuild projects total -- 1 CI, 1 self-update, 1 per stage. Blueprint grew 100+."

step "The prod gate is fail-closed"
say "prod's approval runs at run-order 1 and its deploy at 2, so the deploy cannot start until a"
say "human approves. Rejection or the 7-day timeout fails the stage -- nothing ships unapproved."

step "Opt-in: hand the CloudFormation wait to a Lambda"
say "With asyncDeploy the deploy stage stops paying build compute to watch CloudFormation: the"
say "build prepares change sets and exits, and a small stateful Lambda executes and awaits them."
run node "${TOUR}" async
note "Off by default -- the build-compute path above is what m4-verify proves end to end."

step "Proven on real AWS"
say "This shape is not just rendered -- test/proof/m4-verify.sh provisions it from a bare config on"
say "the test account, flows a commit dev -> prod through the manual approval (driving the gate with"
say "codepipeline put-approval-result), asserts both stage stacks, then tears everything down."
say "It has PASSED end to end in the default assembly-promotion model on the test account; every AWS"
say "call there is redacted, so no account id leaks into this recording."

outro "M4: one config, zero wrapper code in the app, one flat pipeline with gates and self-update -- where Blueprint grew 100+ projects."
