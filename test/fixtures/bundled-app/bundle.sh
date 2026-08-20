#!/usr/bin/env bash
# Bundle src/main.ts -> dist/app.js with aws-cdk-lib inlined, which is precisely
# what defeats the `node -r .../register` preload hook. Invoked by cdk.json#build.
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! npx --no-install esbuild --version >/dev/null 2>&1; then
  cat >&2 <<'EOF'
bundled-app: esbuild is not resolvable.

This fixture cannot be bundled until `esbuild` is available. It is deliberately NOT
added to the repo's dependencies by the harness task (that would churn yarn.lock);
whoever activates this fixture (`m2-bundled-diagnostic`, wave 2) owns that decision.
See ./README.md.
EOF
  exit 1
fi

npx --no-install esbuild src/main.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --outfile=dist/app.js
