# pipeline-app fixture (m4-verify)

The source project the M4 pipeline builds and deploys. Unlike the `level*` fixtures, this one is a
**self-contained npm project** (its own `package.json`) because it is uploaded to S3 and installed by
the pipeline's CodeBuild with `npm ci` — it cannot lean on the repo-root `node_modules` the way a
locally-synthesized fixture can.

`m4-verify.sh` turns this directory into the deployable bundle at gate time:

1. copies these committed files into a temp dir,
2. generates `cicd.config.ts` there (run-specific: the run id in `application`, the run's S3 source
   bucket in `Repository.s3(...)`, and the `codeArtifact` repo) — kept OUT of the committed tree
   because it is regenerated per run,
3. runs `npm install` against CodeArtifact to produce `package-lock.json` — also kept out of the tree
   because its `resolved` URLs embed the CodeArtifact account id,
4. zips the temp dir and uploads it as the pipeline's S3 source object.

## What is committed here (all account-id-free)

- `bin/app.ts` / `lib/stack.ts` — a one-SSM-parameter stack, named `cdkcicdtest-<run-id>-app`, that
  tags itself `cdk-cicd-wrapper-test` so the teardown guard can destroy it and `Stage` so the gate can
  tell dev from prod.
- `cdk.json` — `npx cdk-cicd exec bin/app.ts`, the zero-touch entry point.
- `config/{dev,prod}.json` — per-stage config the wrapper injects.
- `package.json` — the deps the pipeline installs (`@cdklabs/*@0.0.0` from CodeArtifact; `aws-cdk-lib`
  / `constructs` / `cdk-nag` peers; `aws-cdk` + `ts-node` for the build).

The `cicd.config.ts` the gate generates defines an S3-source pipeline with `dev` (us-west-2, auto) and
`prod` (us-west-1, manual approval) — two single-region stages, so the two stage stacks are distinct
and teardown stays simple. Multi-region-within-a-stage is already proven by `m3-verify`.
