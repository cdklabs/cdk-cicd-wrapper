# A config-driven pipeline (zero-touch)

The whole v3 opt-in is two things: a `cicd.config.ts`, and pointing `cdk.json` at `cdk-cicd exec`.

## 1. Your app stays plain CDK

`bin/app.ts` is exactly what `cdk init` gave you — a plain `App` with your stacks. No `PipelineBlueprint`,
no builder, no wrapper import:

```ts
// bin/app.ts
import * as cdk from 'aws-cdk-lib';
import { MyStack } from '../lib/my-stack';

const app = new cdk.App();
new MyStack(app, 'my-app', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
```

## 2. Describe the pipeline in `cicd.config.ts`

```ts
// cicd.config.ts
import { defineCICD, Repository } from '@cdklabs/cdk-cicd-wrapper';

export default defineCICD({
  application: 'my-app',
  repository: Repository.codecommit('my-app'),   // or .github('org/my-app', 'main') / .s3('bucket/app.zip')
  stages: ['dev', 'prod'],
});
```

## 3. Point `cdk.json` at the wrapper's exec hook

```json
{
  "app": "npx cdk-cicd exec bin/app.ts"
}
```

`cdk-cicd exec` runs your app under a preload that injects the resolved config (and tags, synthesizer, and
compliance Aspects) around it — which is how your untouched `bin/` becomes wrapper-aware without importing
anything.

## 4. Provision the pipeline — once

```bash
npx cdk-cicd deploy-ci
```

This deploys **one** pipeline into your hub account from `cicd.config.ts` alone. On every run it:

```
Source → Build (checks + synth) → UpdatePipeline (re-deploys itself from config) → deploy dev → deploy prod
```

The **UpdatePipeline** stage means you never run `deploy-ci` again by hand: change `cicd.config.ts`, push,
and the pipeline re-synthesizes its own definition on the next run and applies the change before the
stages it affects.

That's the core loop. The next chapters layer on stages/approvals, deploy models, private registries, and
container mode.
