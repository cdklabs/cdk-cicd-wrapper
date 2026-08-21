# Deploy models and async deploy

v3 offers two CodePipeline deploy models. Guiding principle: **efficiency first.**

## Default — assembly promotion

```ts
export default defineCICD({
  application: 'my-app',
  repository: Repository.codecommit('my-app'),
  stages: ['dev', 'prod'],
  // deployModel: DeployModel.ASSEMBLY_PROMOTION   // the default
});
```

The Build phase synthesizes **every stage once**, keeps `cdk.out`, and promotes it as the pipeline
artifact. Each deploy stage **consumes** that assembly and does not re-synthesize. One synth per run.

## Second option — deploy-time synth

```ts
import { defineCICD, DeployModel, Repository } from '@cdklabs/cdk-cicd-wrapper';

export default defineCICD({
  application: 'my-app',
  repository: Repository.codecommit('my-app'),
  stages: ['dev', 'prod'],
  deployModel: DeployModel.DEPLOY_TIME_SYNTH,
  ci: { synthStages: 'all' },   // CI synthesizes one env by default; 'all' validates every stage
});
```

Each stage synthesizes at deploy time. CI synthesizes **one env by default** (set `ci.synthStages` to a
list or `'all'`), and any stage CI already synthesized is **reused**, not synthesized again.

## Async deploy — don't pay build compute to wait

By default the deploy action holds a CodeBuild container for the whole CloudFormation wait. Opt into a
Lambda-driven wait instead:

```ts
export default defineCICD({
  application: 'my-app',
  repository: Repository.codecommit('my-app'),
  stages: ['dev', 'prod'],
  asyncDeploy: true,
});
```

The build prepares the change sets and exits; a small Lambda then executes them and drives the pipeline
action to completion when CloudFormation finishes — reporting back per invocation rather than holding a
build container open for the wait. Off by default — turn it on when the CloudFormation wait
dominates your deploy time. (Cross-account stages under `asyncDeploy` are refused at synth time for now.)
