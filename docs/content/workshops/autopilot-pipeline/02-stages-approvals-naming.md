# Stages, approvals, and stack names

!!! abstract "What you'll build"
    - A dev → prod promotion path expressed as config data, with a fail-closed approval gate.
    - Multi-region stages that fan out — without growing the pipeline.
    - Forced deployment roles for controlled (Automation Framework) accounts.
    - Stack names you control per stage with `stageStackName`.

## Stages are config rows, not pipeline code

A stage is either a bare name or an object with its own environment:

```ts
export default defineCICD({
  application: 'my-app',
  repository: Repository.codecommit('my-app'),
  stages: [
    'dev',                                                        // inner loop, auto-approved
    { name: 'prod', env: { account: '333333333333', region: 'eu-west-1' }, manualApproval: true },
  ],
});
```

A multi-region stage stays **one** deploy action — the region fan-out happens inside `cdk-cicd deploy`
(the regions deploy in turn), so the pipeline shape doesn't grow with regions:

```ts
{ name: 'prod', env: { account: '333333333333', regions: ['eu-west-1', 'us-east-1'] } }
```

## Manual-approval gates are fail-closed

`manualApproval: true` puts a **Manual Approval** action ahead of the stage's deploy (at a lower run
order), so the deploy cannot start until a human approves. Non-`dev`/`res` stages are gated **by default**;
set `manualApproval: false` to opt a stage out. Rejection or the approval timeout fails the stage —
nothing ships unapproved.

<!-- SCREENSHOT: CodePipeline console showing the Manual Approval action ahead of the prod deploy action -->

## Forced deployment roles

In controlled accounts, deploys must go through a specific, pre-provisioned role rather than the
pipeline's own identity. Set `deployment` on the stage to force the deploy role and (optionally) the
CloudFormation execution role — the wrapper threads them into synth and deploy for you, with no change to
`bin/`:

```ts
{
  name: 'prod',
  env: { account: '333333333333', region: 'eu-west-1' },
  manualApproval: true,
  deployment: {
    deployRole: 'arn:aws:iam::333333333333:role/automation-deployer',
    cfnExecutionRole: 'arn:aws:iam::333333333333:role/automation-deployer',
  },
}
```

!!! tip "This is the Automation Framework pattern"
    Forcing a controlled role per stage is exactly what enterprise "deploy only through role X" policies
    need. Container mode (chapter 5) uses the same `deployment.deployRole` shape on its deploy targets.

## Controlling the CloudFormation stack name

Autopilot synthesizes the same `bin/` once per stage, so a bare `new MyStack(app, 'my-app')` deploys the same
name in every stage. Use the opt-in `stageStackName` helper to qualify it by stage:

```ts
import { stageStackName } from '@cdklabs/cdk-cicd-wrapper';

new MyStack(app, 'my-app', {
  stackName: stageStackName('my-app'),   // -> my-app-dev / my-app-prod
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
```

This is the one place you'd import the wrapper in `bin/`, and it's opt-in. It reads the stage from
`CDK_STAGE` (which `cdk-cicd exec` sets). Migrating from Blueprint? The same helper reproduces Blueprint's exact stack
name so you **update in place instead of recreating** — see the migration chapter.

## Verify

!!! success "Verify"
    - The pipeline shows a **Manual Approval** action before each gated stage's deploy; approving it lets
      the deploy proceed, rejecting it fails the stage.
    - For a multi-region stage, each region's stack is created in turn under the one deploy action.
    - With `stageStackName`, the deployed CloudFormation stacks are named per stage (e.g. `my-app-dev`,
      `my-app-prod`). Check locally:

      ```bash
      CDK_STAGE=prod npx cdk-cicd synth --stage prod   # stack name resolves to my-app-prod
      ```

## Recap

Stages, approvals, regions, and roles are all config data on the `stages` array — the pipeline shape
doesn't grow as you add regions, and gates are fail-closed by default. `stageStackName` gives you explicit
control of CloudFormation stack names per stage, which is also the key to migrating without a recreate.
Next: how and when the pipeline synthesizes, and the tuning knobs that go with it.
