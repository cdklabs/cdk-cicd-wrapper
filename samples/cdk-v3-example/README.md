# cdk-v3-example

The v3 shape of the CDK CI/CD Wrapper, side by side with the v2 `cdk-ts-example`. The contrast is the
point: **the app is ordinary CDK with no wrapper code**, and one `cicd.config.ts` turns it into a
pipeline.

```
bin/app.ts        plain `new App()` + your stacks — no PipelineBlueprint, no builder chain
lib/stack.ts      your application stack (unchanged CDK)
cicd.config.ts    defineCICD({ application, repository, stages }) — the only wrapper-aware file
cdk.json          "app": "npx cdk-cicd exec bin/app.ts"  — the wrapper injects config/tags around the app
```

Compare with `../cdk-ts-example` (v2): there the pipeline is built *inside* `src/main.ts` via
`PipelineBlueprint.builder()…synth(app)`, and the projen `CdkCICDWrapper` generates the scaffolding.

## Use it

```bash
npm install                       # resolves @cdklabs/* from your registry (CodeArtifact while v3 is pre-release)
npx cdk-cicd deploy-ci            # provisions the pipeline into the hub account, from cicd.config.ts alone
```

The pipeline then runs Source → Build (checks + synth) → self-update → deploy per stage, with `prod`
gated on a manual approval. `dev` deploys `cdk-v3-example-dev`, `prod` deploys `cdk-v3-example-prod` —
`bin/app.ts` uses `stageStackName` to name them.

## Migrating an existing v2 app

`cdk-cicd migrate --entry src/main.ts` scaffolds the `cicd.config.ts`. To keep already-deployed resources
(update in place instead of recreating), name your stacks to match what v2 deployed —
`stageStackName('app', { stageFirst: true, uppercaseStage: true })` reproduces v2's `DEV-app`. See the
repo `MIGRATION.md` (*Preserving already-deployed resources*).
