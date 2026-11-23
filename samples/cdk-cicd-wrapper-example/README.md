# cdk-cicd-wrapper-example

The Autopilot shape of the CDK CI/CD Wrapper. The point: **the app is ordinary CDK with no wrapper code** beyond the
opt-in `stageStackName` helper, and one `cicd.config.ts` turns it into a pipeline.

```
bin/app.ts        plain `new App()` + your stacks — no PipelineBlueprint, no builder chain
lib/stack.ts      your application stack (unchanged CDK)
cicd.config.ts    defineCICD({ application, repository, stages }) — the whole pipeline definition
cdk.json          "app": "npx cdk-cicd exec bin/app.ts"  — the wrapper injects config/tags around the app
```

Compare with the Blueprint shape — `PipelineBlueprint.builder()…synth(app)` built inside `src/main.ts`, with
the projen `CdkCICDWrapper` generating the scaffolding — preserved, untouched, on the `legacy-blueprint`
branch (its `cdk-ts-example` sample was removed from `main` in `m8-remove-v2`).

## Use it

```bash
npm install                       # resolves @cdklabs/* from your registry
npx cdk bootstrap aws://PIPELINE_ACCOUNT/REGION --qualifier cdkcicdwra --toolkit-stack-name CDKToolkit-cdkcicdwra
npx cdk-cicd deploy-ci            # provisions the pipeline into the hub account, from cicd.config.ts alone
```

The stages use `cdkcicdwra`, the qualifier `defineCICD` derives from `application` when `cicd.config.ts` sets
none, so the account needs that bootstrap next to its plain `cdk bootstrap`. Then push the sample, copied out of
this repository, to the `main` branch of the CodeCommit repository `deploy-ci` created.

The pipeline then runs Source → Build (`npm ci` + synth; the sample defines no `audit`/`build`/`test`
scripts, so those only warn) → self-update → deploy per stage, with `prod`
gated on a manual approval. `dev` deploys `cdk-cicd-wrapper-example-dev`, `prod` deploys `cdk-cicd-wrapper-example-prod` —
`bin/app.ts` uses `stageStackName` to name them.

## Migrating an existing Blueprint app

`cdk-cicd migrate --entry src/main.ts` scaffolds the `cicd.config.ts`. To keep already-deployed resources
(update in place instead of recreating), name your stacks to match what Blueprint deployed —
`stageStackName('app', { stageFirst: true, uppercaseStage: true })` reproduces Blueprint's `DEV-app`. See the
repo `MIGRATION.md` (*Preserving already-deployed resources*).
