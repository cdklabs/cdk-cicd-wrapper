# cdk-cicd-wrapper pipeline layout

Stage and action names as the wrapper renders them, per engine (`engine` in `cicd.config.ts`: `codepipeline`
by default, `cdk-pipelines`, or `github-actions`, which renders no CodePipeline). `<stage>` is a stage name
from the config (`dev`, `prod`, ...) and `<region>` an AWS Region. Every CodeBuild project runs in the pipeline
account.

## `codepipeline` (the default engine)

| Stage | Action | Provider | What it runs |
| --- | --- | --- | --- |
| `Source` | `Source` | CodeCommit, CodeStarSourceConnection or S3 | fetches the application repository |
| `Build` | `Build` | CodeBuild | CI, then synth. CI is `npm ci` plus the project's `npm run audit`, `build` and `test` when present; configured `ci.steps` replace all of that, `npm ci` included. The synth step is always appended: `npx cdk-cicd synth --all` (the default `ASSEMBLY_PROMOTION` deploy model), or with `DEPLOY_TIME_SYNTH` `npx cdk-cicd synth --stage <first stage>` as validation only |
| `UpdatePipeline` | `SelfMutate` | CodeBuild | `npx cdk-cicd deploy-ci`: updates the pipeline's own stack from `cicd.config.ts` |
| `<stage>` | `Approve-<stage>` | Manual | manual approval (stages other than `dev`/`res` by default) |
| `<stage>` | `Deploy-<stage>` | CodeBuild | `npx cdk-cicd deploy --stage <stage> --yes`, with `--from-assembly` under `ASSEMBLY_PROMOTION` (it deploys the assembly `Build` synthesized). Deploys the application stacks into the stage's account and Regions, assuming the stage account's CDK bootstrap roles |
| `<stage>` | `Await-<stage>` | Lambda | only with `asyncDeploy: true`: executes and waits for the change sets `Deploy-<stage>` prepared |

A stage with several Regions and `regionOrder: PARALLEL` gets one action per Region instead:
`Deploy-<stage>-<region>` (and `Await-<stage>-<region>`). Sequential Regions share one `Deploy-<stage>`.

A rejected or timed-out `Approve-<stage>` also ends in `FAILED`. That is a decision, not an incident.

## `cdk-pipelines`

| Stage | Action | Provider | What it runs |
| --- | --- | --- | --- |
| `Source` | (named after the repository) | CodeCommit, CodeStarSourceConnection or S3 | fetches the repository |
| `Build` | `Synth` | CodeBuild | CI and `cdk synth` |
| `UpdatePipeline` | `SelfMutate` | CodeBuild | `cdk deploy` of the pipeline stack |
| `Assets` | one per asset (named after it) | CodeBuild | publishes the application's file and Docker assets to the stage accounts' CDK bootstrap bucket and ECR repository. Present only when the application has assets |
| `<stage>` | `Approve-<stage>` | Manual | manual approval |
| `<stage>` | `Prepare` / `Deploy` (or `<Stack>.Prepare` / `<Stack>.Deploy`) | CloudFormation | creates and executes a change set per application stack in the stage account |

A stage with several Regions becomes one pipeline stage per Region, `<stage>-<region>`. The approval sits only
in the first of them.

## Container mode, Repo 1 (`deployerImage` set)

| Stage | Action | Provider | What it runs |
| --- | --- | --- | --- |
| `Source` | `Source` | as above | fetches the application repository |
| `BuildImage` | `BuildAndPush` | CodeBuild | CI, synth of the validation stages, then builds and pushes the deployer image to ECR |

## Container mode, Repo 2 (`deploy.config.ts`)

| Stage | Action | Provider | What it runs |
| --- | --- | --- | --- |
| `Source` | `Source` | CodeCommit, CodeStarSourceConnection or S3 | fetches the deployment-config repository |
| `Plan` | `Plan` | CodeBuild | `cdk-cicd pipeline plan`: decides which targets changed |
| `Deploy-<n>` | `Approve-<stage>` | Manual | manual approval for that target |
| `Deploy-<n>` | `Deploy-<stage>` (or `Deploy-<stage>-<region>` for parallel Regions) | CodeBuild | `cdk-cicd deploy --from-image --target <stage>`: pulls the deployer image and deploys it into the target's account and Regions |

A target with `autoDeploy: true` also gets its own pipeline: a `Source` stage, then a `Deploy-<stage>` stage
with a `Deploy-<stage>` action. It is started by every new image pushed to ECR.

## DevOps Agent forwarder

With `devopsAgent` set in the config, the pipeline stack also holds an EventBridge rule and a Lambda that
open one investigation per failed action (approvals excluded). Investigation titles read
`Pipeline <pipeline> failed at <stage> / <action>`.
