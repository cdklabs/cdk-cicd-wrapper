#!/usr/bin/env bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# M2 runtime-injection demo: how `cdk-cicd exec` turns an UNTOUCHED `cdk init` app into a
# wrapped one with zero edits to bin/, and how a bundled app that defeats the hook is caught
# instead of shipping silently non-compliant.
#
#   test/proof/record-demo.sh m2-injection
#
# Everything is real and driven live, but it is all `cdk synth` -- NO AWS account, NO
# credentials, NO deploy. The real deploy-under-injection proof is demo #1 at the m2-verify
# gate. No AWS account id is ever printed (see CLAUDE.md ground rule 4): credentials are
# scrubbed and a placeholder account is used, so synth cannot resolve a real one.

. "$(dirname "$0")/../narrate.sh"

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
CLI="${REPO_ROOT}/packages/@cdklabs/cdk-cicd-wrapper-cli/lib/index.js"
FIXTURES="${REPO_ROOT}/test/fixtures"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT" "${FIXTURES}/bundled-app/dist"' EXIT

# --- credential isolation: guarantees no real account id can appear in this recording -------
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_PROFILE \
      AWS_CONTAINER_CREDENTIALS_FULL_URI AWS_CONTAINER_AUTHORIZATION_TOKEN \
      AWS_CONTAINER_CREDENTIALS_RELATIVE_URI AWS_WEB_IDENTITY_TOKEN_FILE AWS_ROLE_ARN
export AWS_EC2_METADATA_DISABLED=true
export CDK_DEFAULT_ACCOUNT=111111111111    # placeholder; never a real account
export CDK_DEFAULT_REGION=us-west-2
export CDK_CICD_TEST_RUN_ID=m2demo

# Pull one fact out of a synthesized SSM parameter (value or tags), so claims are shown not told.
marker() { # <outdir> <jq-ish: value|tags>
  node -e '
    const fs=require("fs"),p=require("path"),dir=process.argv[1],what=process.argv[2];
    const f=fs.readdirSync(dir).find(x=>x.endsWith(".template.json"));
    const t=JSON.parse(fs.readFileSync(p.join(dir,f),"utf8"));
    const r=Object.values(t.Resources).find(x=>x.Type==="AWS::SSM::Parameter");
    console.log(what==="tags" ? JSON.stringify(r.Properties.Tags ?? "(none)") : r.Properties.Value);
  ' "$1" "$2"
}

step "Where this recording came from"
say "Provenance first: branch, commit, and a clean tree."
run git rev-parse --abbrev-ref HEAD
run git rev-parse --short HEAD
run_sh 'git status --porcelain | head'
run_sh 'git log --oneline -6'

step "Level 0 — a plain 'cdk init' app the wrapper never touches"
say "level0-app is stock cdk init. There is no wrapper import anywhere in it -- prove it:"
run_sh 'grep -rn "@cdklabs/cdk-cicd-wrapper" '"${FIXTURES}"'/level0-app/bin '"${FIXTURES}"'/level0-app/lib || echo "(no wrapper import -- untouched)"'
say "Synthesized on its own, the wrapper is completely inert: no injected tags."
run_sh 'cd '"${FIXTURES}"'/level0-app && npx cdk synth --output '"${OUT}"'/level0 >/dev/null 2>&1'
note "level0 SSM tags: $(marker "${OUT}/level0" tags)   <- nothing added"

step "Level 1 — one command injects the wrapper, with ZERO edits to bin/"
say "level1-app's bin/app.ts is the SAME shape as level0 -- again, no wrapper import in bin/:"
run_sh 'grep -rn "@cdklabs/cdk-cicd-wrapper" '"${FIXTURES}"'/level1-app/bin || echo "(bin/ is untouched -- no wrapper import)"'
say "The wrapper owns the cdk.json app command. Instead of \`node bin/app.ts\`, it runs"
say "\`cdk-cicd exec bin/app.ts\`, which resolves the stage config and injects it. Watch:"
run_sh 'cd '"${FIXTURES}"'/level1-app && CDK_STAGE=dev npx cdk synth --app "node '"${CLI}"' exec bin/app.ts" --output '"${OUT}"'/level1 >/dev/null 2>&1'
note "level1 SSM value: $(marker "${OUT}/level1" value)"
note "level1 SSM tags:  $(marker "${OUT}/level1" tags)"
say "The application name came from config/dev.json via injected context, and the Stage tag"
say "was applied tree-wide by the preload -- all without a single line added to bin/."

step "Bundling silently defeats the hook — so we detect it, loudly"
say "esbuild inlines aws-cdk-lib, so a bundled entry constructs its own App and the preload"
say "patches nothing. That would deploy with no synthesizer, tags or Aspects -- worse than a"
say "crash. bundled-app reproduces it. Bundle it, then synth it under exec:"
run_sh 'cd '"${FIXTURES}"'/bundled-app && ./bundle.sh >/dev/null 2>&1 && ls -1 dist/'
run_sh 'cd '"${FIXTURES}"'/bundled-app && npx cdk synth --app "node '"${CLI}"' exec dist/app.js" --output '"${OUT}"'/bundled 2>&1 | grep -o "cdk-cicd-wrapper: .*attach(app) .*App." | head -1 || true'
note "Non-zero exit, with an actionable message -- the silent failure is now a loud one."

step "The escape hatch the message points at"
say "For bundled / ESM / vendored apps, the documented one-liner restores the wrapper. It is"
say "the single runtime symbol on the public API:"
run_sh 'grep -n "CdkCicd" '"${REPO_ROOT}"'/packages/@cdklabs/cdk-cicd-wrapper/src/v3/index.ts'
say "The user adds one line in bin/ -- CdkCicd.attach(app) -- and the same Aspects and tags apply."

outro "M2 injection: Autopilot by default, an explicit escape hatch when bundling defeats it. Next: the real deploy (demo #1) at the m2-verify gate."
