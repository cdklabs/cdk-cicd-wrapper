# Stages, approvals, and stack names

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

A multi-region stage stays **one** deploy action — the region fan-out happens inside `cdk-cicd deploy`, so
the pipeline shape doesn't grow with regions:

```ts
{ name: 'prod', env: { account: '333333333333', regions: ['eu-west-1', 'us-east-1'] } }
```

## Manual-approval gates are fail-closed

`manualApproval: true` puts a **Manual Approval** action ahead of the stage's deploy (at a lower run
order), so the deploy cannot start until a human approves. Non-`dev`/`res` stages are gated **by default**;
set `manualApproval: false` to opt a stage out. Rejection or the approval timeout fails the stage —
nothing ships unapproved.

## Controlling the CloudFormation stack name

v3 synthesizes the same `bin/` once per stage, so a bare `new MyStack(app, 'my-app')` deploys the same
name in every stage. Use the opt-in `stageStackName` helper to qualify it by stage:

```ts
import { stageStackName } from '@cdklabs/cdk-cicd-wrapper';

new MyStack(app, 'my-app', {
  stackName: stageStackName('my-app'),   // -> my-app-dev / my-app-prod
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
```

This is the one place you'd import the wrapper in `bin/`, and it's opt-in. It reads the stage from
`CDK_STAGE` (which `cdk-cicd exec` sets). Migrating from v2? The same helper reproduces v2's exact stack
name so you **update in place instead of recreating** — see the migration chapter.
