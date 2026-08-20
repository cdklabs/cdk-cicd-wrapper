#!/usr/bin/env bash
# Bundle src/main.ts -> dist/app.js with aws-cdk-lib inlined, which is precisely
# what defeats the `node -r .../register` preload hook. Invoked by cdk.json#build.
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# esbuild is fetched on demand at a PINNED version rather than added to the repo's
# dependencies -- this fixture is the only thing that needs it, and a devDependency
# would churn yarn.lock for every install. `m2-bundled-diagnostic` owns this choice.
ESBUILD_VERSION='0.24.2'

npx -y "esbuild@${ESBUILD_VERSION}" src/main.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --outfile=dist/app.js
