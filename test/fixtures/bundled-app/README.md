# `bundled-app` fixture — active as of `m2-bundled-diagnostic`

## `esbuild` is fetched on demand, pinned

`bundle.sh` runs `npx -y esbuild@0.24.2` rather than depending on a repo-installed esbuild. This
fixture is the only thing that needs esbuild, and a `devDependency` would churn `yarn.lock` for every
install, so `m2-bundled-diagnostic` (which owns this fixture) fetches a pinned version on demand. The
first bundle pays a one-time download; `dist/` is build output and is gitignored.

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
