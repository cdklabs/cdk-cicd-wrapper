# `bundled-app` fixture — blocked on a missing prerequisite

## Missing prerequisite: `esbuild`

`esbuild` is **not resolvable** from the repo-root `node_modules` today
(`require.resolve('esbuild')` throws). The harness task that created this fixture deliberately did not
install it — adding a dependency would churn `yarn.lock`, and the choice of where it belongs
(root `devDependencies` vs. a fixture-local install vs. `npx esbuild@x` pinned in `bundle.sh`) is a
call for whoever activates the fixture.

Consequence: `./bundle.sh` exits 1 with that message, and because `cdk.json#build` runs it,
**`npx cdk synth` fails here by design**. Everything else about the fixture is complete — the shape is
what matters, and the shape is on disk.

## What it is for

The v3 zero-touch path is a `node -r @cdklabs/cdk-cicd-wrapper/register` preload that swaps the `App`
class on the live module object of `aws-cdk-lib/core/lib/app`. Bundling inlines `aws-cdk-lib` into
`dist/app.js`, so at run time there is no module object left to patch and the preload becomes a no-op —
**silently**. That silence is the bug; `m2-bundled-diagnostic` (wave 2) must turn it into a clear
"this app is bundled, call `CdkCicd.attach(app)` instead" message, and this fixture is the thing it
fires on.

## Shape

| Path | Role |
|---|---|
| `src/main.ts` | single-file app (stack + `App` in one file) — one esbuild entry |
| `bundle.sh` | `esbuild --bundle --platform=node` → `dist/app.js` |
| `cdk.json` | `"app": "node dist/app.js"`, `"build": "./bundle.sh"` |

`dist/` is build output and must never be committed.
