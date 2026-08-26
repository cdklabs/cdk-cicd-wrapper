# Migrating from Blueprint

!!! abstract "What you'll build"
    - A `cicd.config.ts` generated from your existing Blueprint entry with the `cdk-cicd migrate` codemod.
    - A flattened `bin/` and a repointed `cdk.json`.
    - Most importantly: a switchover that **updates deployed stacks in place** instead of recreating them.

Moving an app from Blueprint (`PipelineBlueprint.builder()…synth(app)`) to zero-touch is: generate a `cicd.config.ts`,
flatten your `bin/`, and repoint `cdk.json`.

## Scaffold the config with the codemod

```bash
npx cdk-cicd migrate --entry src/main.ts --application my-app   # add --dry-run to preview
```

`migrate` reads your Blueprint entry, extracts the stage list, and writes a `cicd.config.ts` — flagging the
repository, `workbench`, and any phases/hooks as TODOs for you to fill in. It deliberately **does not**
rewrite your entry file's stack construction (that's where a codemod silently corrupts code), and prints
the remaining manual steps.

!!! tip "Preview first"
    Always run with `--dry-run` first to see the generated config and the manual-step list before it
    writes anything.

## Do the rest by hand

1. In your entry, drop the `PipelineBlueprint.builder()…synth(app)` chain and construct your stacks
   directly on a plain `new App()`.
2. Point `cdk.json` at `npx cdk-cicd exec <entry>`.
3. Provision the pipeline once: `npx cdk-cicd deploy-ci`.

## Keep already-deployed resources (no recreate!)

This is the part to get right. CloudFormation keys resources to a stack by **name**. Blueprint nested your stacks
in an `AppStage` (a `cdk.Stage`), so it deployed `<stageId>-<name>` (e.g. `DEV-my-app`). zero-touch's plain `bin/`
deploys just `<name>`. **A different name means a new stack — a full recreate.** Match Blueprint's name and it's
an in-place update instead:

```ts
import { stageStackName } from '@cdklabs/cdk-cicd-wrapper';

// Reproduces Blueprint's `DEV-my-app`, so CloudFormation UPDATES the existing stack.
new MyStack(app, 'my-app', {
  stackName: stageStackName('my-app', { stageFirst: true, uppercaseStage: true }),
});
```

`uppercaseStage` matches Blueprint's *default* stages (`RES`/`DEV`/`INT` — no `PROD` unless you called
`.defineStages(...)` yourself). If your Blueprint stages were
lowercase or custom-case, drop it (the stage is used verbatim), or set `stackName` to your literal Blueprint
name.

## Verify before switching the pipeline over

!!! success "Verify"
    Synthesize the migrated app for a stage and diff it against the live stacks:

    ```bash
    CDK_STAGE=dev npx cdk-cicd synth --stage dev
    npx cdk diff --app cdk.out/dev/<region>
    ```

    Expect **only modifications** — no resources destroyed/created and no `(requires replacement)`. If the
    name doesn't match, `cdk diff` shows everything as newly-created; that's the tell you'd recreate. Do
    **not** switch the pipeline over until the diff is clean.

!!! warning "A wrong stack name recreates production"
    If the migrated stack name doesn't match the Blueprint name, the first pipeline run deletes the old stack and
    creates a new one — a full recreate of production resources. The `cdk diff` above is the gate that
    catches this before it happens.

The full detail (and the RETAIN + `cdk import` fallback) is in the repo's `MIGRATION.md`.

## Recap

The codemod scaffolds your `cicd.config.ts` and lists the manual steps; you flatten `bin/` and repoint
`cdk.json`. The one thing you must get right is stack naming — `stageStackName` reproduces Blueprint's exact
names so CloudFormation updates in place, and `cdk diff` proves it before you flip the pipeline. That's
the whole migration.
