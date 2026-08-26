# zero-touch test fixtures

CDK apps that the proof harness (`test/proof/harness.sh`) deploys, asserts and destroys against the
real test account. They are deliberately shaped like output a *user* would have, not like code this
repo owns, because their whole job is to show what the wrapper does to an app it did not write.

| Fixture | Shape | What it proves |
|---|---|---|
| `level0-app` | untouched `cdk init app --language typescript`, no wrapper import anywhere | **Level-0 inertness** — with no wrapper involvement the app synths and deploys exactly as stock CDK |
| `level1-app` | adds `cicd.config.ts` + `config/{local,dev,prod}.json` | stage config resolution, and injection with **zero edits to `bin/`** |
| `hardcoded-env-app` | `env` hardcoded to a foreign account/region in `bin/` | the drift rule — different region warns, different account errors and stops |
| `bundled-app` | esbuild single-file entrypoint | the preload hook is **silently** defeated by bundling, so `m2-bundled-diagnostic` must detect it |

## Contract with the harness

The harness derives every name from the fixture directory name minus its `-app` suffix, so a fixture
must follow all four of these or `harness.sh assert` fails:

- **Stack name** `cdkcicdtest-<run-id>-<short>` — e.g. `cdkcicdtest-r20260819212254-level0`.
- **SSM parameter** `/cdkcicdtest/<run-id>/<short>`, non-empty — this is the resource `assert` reads
  back to prove the deploy really happened, rather than trusting a green `cdk deploy` exit code.
- **Run id** from `CDK_CICD_TEST_RUN_ID`, falling back to `local` so a bare `npx cdk synth` still works
  for a human.
- **Stage env** from the stock `env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: ... }` line.
  Deleting `env` entirely makes the stack environment-agnostic and it will ignore the stage — see the
  caveat in `docs/design/v3-devops-experience.md`.

## Why there is no `package.json` or `node_modules`

Node resolution walks up to the repo root `node_modules`, which already hoists `aws-cdk-lib`,
`constructs`, `aws-cdk`, `ts-node` and `typescript`, and symlinks `@cdklabs/cdk-cicd-wrapper`. So the
fixtures need no install step. They are also outside the repo's own lint and jest projects on purpose,
which is what lets `level0-app` stay byte-for-byte plausible as `cdk init` output.

`bundled-app` is the exception: it needs `esbuild`, which is not a dependency of this repo, so it does
not build without the extra step documented in its own README. That is by design — it exists to be a
*failure* case.

Nothing here may contain an AWS account id. `cdk.out` is gitignored (`.gitignore` in this directory),
and the harness synthesizes to a temp dir anyway, because a synthesized `manifest.json` does contain
the account id.
