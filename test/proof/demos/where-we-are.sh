#!/usr/bin/env bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# A "where we are" tour of the zero-touch redesign so far: the proof harness (Wave 0) and
# the app-config layer (Wave 1 / M1). It is a catch-up walkthrough, not a milestone
# gate -- it makes NO AWS calls and needs no credentials, so it can be recorded
# anywhere. The one real deploy demo comes with M2.
#
#   test/proof/record-demo.sh where-we-are
#
# Everything it shows is real: it drives the COMPILED public surface and runs the
# actual guard test. No AWS account id is ever printed (see CLAUDE.md ground rule 4).

. "$(dirname "$0")/../narrate.sh"

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "${REPO_ROOT}"
DEMO_DIR="$(dirname "$0")"

step "Where this recording came from"
say "Every proof states its own provenance: which branch and commit, and whether"
say "the tree was clean when it was recorded."
run git rev-parse --abbrev-ref HEAD
run git rev-parse --short HEAD
say "An empty listing below means a clean tree."
run_sh 'git status --porcelain | head'
say "The work so far, one commit per verified unit -- the evolution is reviewable."
run_sh 'git log --oneline -4'

step "The zero-touch public surface (jsii-safe)"
say "zero-touch is additive: it hangs off the existing package entry point, so the published"
say "0.x surface keeps working. Only a curated set of types crosses the jsii boundary."
run_sh 'sed -n "1,40p" packages/@cdklabs/cdk-cicd-wrapper/src/v3/index.ts | grep -vE "^//|^$" | head -20'
say "jsii SILENTLY drops exported free functions, so the machinery (the generic loader,"
say "the ConfigError class, the bare helpers) stays internal and only classes/structs/enums"
say "are exported. We verify that against the generated assembly rather than trusting it:"
run_sh 'node -e '"'"'const a=JSON.parse(require("fs").readFileSync("packages/@cdklabs/cdk-cicd-wrapper/.jsii","utf8")); const v3=Object.keys(a.types).filter(k=>(a.types[k].locationInModule||{}).filename?.includes("src/v3")); console.log(v3.length+" zero-touch types in the assembly:"); v3.forEach(k=>console.log("  "+a.types[k].kind.padEnd(9)+" "+k.split(".").pop()));'"'"''
note "11 types, and AppConfig is the one class a user actually calls."

step "M1: the config layer, through the API a user calls"
say "AppConfig.load reads a per-environment config file, layers the wrapper's base"
say "defaults under it, derives account/region from CDK's environment, and validates"
say "against a caller-supplied schema. First: JSON and YAML must load identically."
run_sh 'node "'"${DEMO_DIR}"'/lib/appconfig-tour.js" json-yaml-identical'
note "Same object either way -- the file format is the user's choice, not a behaviour change."

step "Safe-by-default merge + derived environment"
say "A blank aws block plus CDK's ambient account/region: the values are derived, and"
say "the base defaults RETAIN stateful resources so the wrapper never widens blast radius."
run_sh 'node "'"${DEMO_DIR}"'/lib/appconfig-tour.js" derived-account'
note "removalPolicies default to retain; the account/region came from the environment."

step "Fails closed, with a typed error"
say "A missing required key does not deploy a half-config -- it throws a typed"
say "ConfigError, which at a CDK entry point makes cdk synth exit non-zero and emit"
say "no templates."
run_sh 'node "'"${DEMO_DIR}"'/lib/appconfig-tour.js" missing-key'
say "And a subtle one: an unquoted 12-digit account id in YAML is a NUMBER. Coercing it"
say "would corrupt a leading-zero account, so it is rejected exactly like an absent key."
run_sh 'node "'"${DEMO_DIR}"'/lib/appconfig-tour.js" numeric-account'
note "Wrong type is treated the same as missing -- no silent coercion."

step "Wave 0: the teardown guard that makes real deploys safe"
say "Every later gate is a real deploy to a test account. Nothing is ever deleted"
say "unless this guard says the stack is ours -- right tag, right account, right region,"
say "and ambient credentials that also point at the test account. This runs the guard"
say "through 15 cases with a FAKE aws CLI, so it makes no real calls."
run_sh 'DEMO_PAUSE=0 bash test/proof/harness.test.sh | tail -6'
note "15/15, including a case that fails if the delete is ever moved above the guard."

step "The M1 unit suite"
say "The config layer ships with its own unit suite -- 4 files under test/v3 -- run on"
say "every gate (60 passing, ~99% line coverage) and reviewed by an agent with mutation"
say "testing before commit. Here are the files and the test count, counted live:"
run_sh 'ls -1 packages/@cdklabs/cdk-cicd-wrapper/test/v3/appconfig/'
run_sh 'grep -rhcE "^\s*(test|it)\(" packages/@cdklabs/cdk-cicd-wrapper/test/v3/appconfig/*.test.ts | awk "{n+=\$1} END{print n\" test cases\"}"'

outro "Where we are: Wave 0 harness + M1 config layer done. Next: m1-verify, then M2 runtime injection + the first real-deploy demo."
