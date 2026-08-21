# Migrating from v2

Moving an app from v2 (`PipelineBlueprint.builder()…synth(app)`) to v3 is: generate a `cicd.config.ts`,
flatten your `bin/`, and repoint `cdk.json`.

## Scaffold the config with the codemod

```bash
npx cdk-cicd migrate --entry src/main.ts --application my-app   # add --dry-run to preview
```

`migrate` reads your v2 entry, extracts the stage list, and writes a `cicd.config.ts` — flagging the
repository, `workbench`, and any phases/hooks as TODOs for you to fill in. It deliberately **does not**
rewrite your entry file's stack construction (that's where a codemod silently corrupts code), and prints
the remaining manual steps.

## Do the rest by hand

1. In your entry, drop the `PipelineBlueprint.builder()…synth(app)` chain and construct your stacks
   directly on a plain `new App()`.
2. Point `cdk.json` at `npx cdk-cicd exec <entry>`.
3. Provision the pipeline once: `npx cdk-cicd deploy-ci`.

## Keep already-deployed resources (no recreate!)

This is the part to get right. CloudFormation keys resources to a stack by **name**. v2 nested your stacks
in an `AppStage` (a `cdk.Stage`), so it deployed `<stageId>-<name>` (e.g. `DEV-my-app`). v3's plain `bin/`
deploys just `<name>`. **A different name means a new stack — a full recreate.** Match v2's name and it's
an in-place update instead:

```ts
import { stageStackName } from '@cdklabs/cdk-cicd-wrapper';

// Reproduces v2's `DEV-my-app`, so CloudFormation UPDATES the existing stack.
new MyStack(app, 'my-app', {
  stackName: stageStackName('my-app', { stageFirst: true, uppercaseStage: true }),
});
```

`uppercaseStage` matches v2's *default* stages (`RES`/`DEV`/`INT`/`PROD`). If your v2 stages were
lowercase or custom-case, drop it (the stage is used verbatim), or set `stackName` to your literal v2
name.

**Always verify before switching the pipeline over:**

```bash
CDK_STAGE=dev npx cdk-cicd synth --stage dev
npx cdk diff --app cdk.out/dev/<region>
```

Expect **only modifications** — no resources destroyed/created and no `(requires replacement)`. If the
name doesn't match, `cdk diff` shows everything as newly-created; that's the tell you'd recreate. The full
detail (and the RETAIN + `cdk import` fallback) is in the repo's `MIGRATION.md`.
