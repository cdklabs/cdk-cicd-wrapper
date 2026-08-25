# Continuous Deployment

CD (Continuous Deployment) is a continuous method of software delivery, where you continuously deploy iterative code changes through various stages.

This iterative process helps reduce the chance that you develop new code based on buggy or failed previous versions. The {{ project_name }} can catch bugs early in the development cycle, and help ensure that all the code deployed to production complies with your established code standards.

## Common terms

### Stage

A stage is a [deployment environment](https://en.wikipedia.org/wiki/Deployment_environment) the solution is deployed to — for example `dev`, `int`, `prod`. Unlike Blueprint (0.x), v3 has no reserved stage names (no forced `RES`, no built-in `DEV`/`INT`/`PROD`): every stage you list in `cicd.config.ts`'s `stages` array is deployed, in the order listed, by the pipeline running in whichever account/region your ambient credentials point at when you run `cdk-cicd deploy-ci`.

### Stack

The unit of deployment in AWS CDK is called a stack. See the [CDK documentation](https://docs.aws.amazon.com/cdk/v2/guide/stacks.html) for more.

## Defining stages

List your stages in `cicd.config.ts`. A stage can be a bare name (auto-approved only for `dev`/`res`, gated by manual approval otherwise) or a full object with its own account/region and approval setting:

```typescript
import { defineCICD, Repository } from '@cdklabs/cdk-cicd-wrapper';

export default defineCICD({
  application: 'my-app',
  repository: Repository.codecommit('my-repo'),
  stages: [
    'dev', // auto-approved; account/region resolved from ambient credentials at deploy time
    { name: 'int', env: { account: '222222222222', region: 'eu-west-1' } }, // gated by default
    { name: 'prod', env: { account: '333333333333', region: 'eu-west-1' }, manualApproval: true },
  ],
});
```

A stage's `env` can target multiple regions instead of one, with `regionOrder` controlling whether they roll out one after another (`RegionOrder.SEQUENTIAL`, the default) or all at once (`RegionOrder.PARALLEL`):

```typescript
{ name: 'prod', env: { account: '333333333333', regions: ['eu-west-1', 'us-east-1'], regionOrder: RegionOrder.PARALLEL } }
```

A stage's `deployment` field can force a specific deploy role / CloudFormation execution role, if your account setup requires it:

```typescript
{ name: 'prod', env: { account: '333333333333', region: 'eu-west-1' }, deployment: { deployRole: 'arn:aws:iam::333333333333:role/Deployer', cfnExecutionRole: 'arn:aws:iam::333333333333:role/CfnExec' } }
```

## Deploying different stacks per stage

There is no `addStack()`/provider-callback API in v3 — `bin/` is plain CDK, so you construct whichever stacks you want directly. `cdk-cicd exec` sets `CDK_STAGE` to the active stage's name (also readable through `stageStackName`'s default), so conditional stacks are ordinary TypeScript:

```typescript
// bin/my-app.ts
import * as cdk from 'aws-cdk-lib';
import { MyStack } from '../lib/my-stack';
import { ExperimentalStack } from '../lib/experimental-stack';

const app = new cdk.App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION };

new MyStack(app, 'my-app', { env });

if (process.env.CDK_STAGE === 'dev') {
  new ExperimentalStack(app, 'my-app-experimental', { env });
}
```

Although each stage *can* deploy a different set of stacks, keeping them identical across stages is recommended — divergence between stages is exactly what makes a faulty deployment harder to catch before it reaches your later stages.

### Varying application-level configuration per stage

For values that differ per stage but don't change *which* stacks deploy (a feature flag, a resource size, an external endpoint), use `AppConfig` (exported from `@cdklabs/cdk-cicd-wrapper`) rather than branching on `CDK_STAGE` directly — it reads `config/<CDK_STAGE>.json` (falling back to `config/local.json` outside the pipeline) so each stage's values live in one file. Call `AppConfig.of(this)` from inside a construct, so it reads the config the wrapper already resolved and injected as context rather than doing its own file I/O:

```typescript
import { AppConfig } from '@cdklabs/cdk-cicd-wrapper';

interface MyAppConfig {
  readonly instanceSize: string;
}

export class MyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const config: MyAppConfig = AppConfig.of(this);
    // use config.instanceSize, etc.
  }
}
```

See the package's `AppConfig`/`ConfigSchema` type reference for the full validation/defaulting story.
