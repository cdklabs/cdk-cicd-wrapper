# Deploy models and pipeline tuning

!!! abstract "What you'll build"
    - A pipeline using the right deploy model for your app — assembly promotion or deploy-time synth.
    - An async deploy that hands the CloudFormation wait to a Lambda instead of billing build compute.
    - The config-as-data tuning knobs: manual approval, forced deploy roles, and disposable pipelines.

zero-touch offers two CodePipeline deploy models. Guiding principle: **efficiency first.**

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

!!! tip "Which model?"
    Stick with the default **assembly promotion** unless you specifically need per-stage synth (for
    example, when a stage's template must be produced against that stage's injected config at deploy
    time). Promotion is one synth per run and is the closest match to Blueprint's behavior.

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
dominates your deploy time.

!!! warning "Async deploy is single-account for now"
    Cross-account stages under `asyncDeploy` are **refused at synth time**. Keep `asyncDeploy: false`
    (the default) for cross-account stages until this restriction lifts.

## Tuning the pipeline

Most tuning is config-as-data on `defineCICD` and the stages — there is no engine object to wire up. The
`engine` field only *selects* the CD engine (`EngineType.CODEPIPELINE` is the default; `CDK_PIPELINES` and
`GITHUB_ACTIONS` are the two alternates — see chapter 1's config reference). The knobs below are specific
to the default `CODEPIPELINE` engine:

| Knob | Where | Effect |
|---|---|---|
| `deployModel` | `defineCICD` | Assembly promotion (default) vs deploy-time synth (above). |
| `asyncDeploy` | `defineCICD` | Move the CloudFormation wait off build compute (above). |
| `ci.synthStages` | `defineCICD` | How many stages CI synthesizes as a validation gate. |
| `ci.image` / `ci.steps` | `defineCICD` | Custom CI build image and your own named build steps (chapter 1). |
| `manualApproval` | a stage | Gate a stage behind a human approval (chapter 2). |
| `deployment.deployRole` / `cfnExecutionRole` | a stage | Forced deploy / CloudFormation-execution roles (chapter 2). |

### Disposable pipelines

The pipeline's own support resources (artifact bucket, encryption key) are **retained** on a stack delete
by default, so you never lose a real pipeline's history to an accidental `cdk destroy`. For a throwaway —
a demo, or a PR/sandbox pipeline — provision it disposable so a delete leaves nothing behind:

```bash
npx cdk-cicd deploy-ci --disposable
```

!!! note "What about the pipeline's own build image?"
    Chapter 1's `ci.image` sets the image your **CI steps** run in — that's the build image you want in
    almost every case. The engine also has an internal `buildImage` prop for the pipeline's own build
    projects, but it is **not** settable from `cicd.config.ts` today; reach for `ci.image` instead.

## Verify

!!! success "Verify"
    - **Deploy model:** in an execution's Build logs, assembly promotion synthesizes once and each deploy
      consumes the artifact; deploy-time synth shows a synth step inside each stage's deploy.
    - **Async deploy:** the deploy action returns quickly and a wrapper Lambda drives the CloudFormation
      wait — the CodeBuild project isn't held open for the whole deployment.
    - **Disposable:** a pipeline provisioned with `--disposable` deletes its artifact bucket and key when
      the stack is deleted; the default retains them.

## Recap

You matched the deploy model to your app (promotion by default, deploy-time synth when you need it),
optionally moved the CloudFormation wait off build compute with `asyncDeploy`, and saw the config-as-data
tuning knobs plus disposable provisioning. Next: authenticating the pipeline's builds to a private npm
registry.
