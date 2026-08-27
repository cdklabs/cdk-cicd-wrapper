# Configuration reference (`cicd.config.ts`)

Everything the Autopilot (`1.x`) wrapper needs is declared in one file, `cicd.config.ts`, next to your
`cdk.json`, using `defineCICD({ ... })`. This page documents every field it accepts. The source of truth
is [`src/config/types.ts`](https://github.com/cdklabs/cdk-cicd-wrapper/blob/main/packages/%40cdklabs/cdk-cicd-wrapper/src/config/types.ts)
and `src/config/define.ts`.

```typescript
import { defineCICD, Repository } from '@cdklabs/cdk-cicd-wrapper';

export default defineCICD({
  application: 'my-app',
  repository: Repository.github('my-org/my-app'),
  stages: ['dev', { name: 'prod', env: { account: '111111111111', region: 'eu-west-1' } }],
});
```

## Fields at a glance

| Field                     | Type                          | Default                                | Purpose                                                                     |
| ------------------------- | ----------------------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| `application`             | `string`                      | —                                      | Application name; drives the bootstrap qualifier and asset naming.          |
| `qualifier`               | `string`                      | derived from `application` (≤10 chars) | CDK bootstrap qualifier.                                                    |
| `repository`              | `Repository`                  | — (required)                           | The pipeline's source. See [Repository](#repository).                       |
| `stages`                  | `Array<string \| StageInput>` | — (required)                           | Deployment stages, in order. See [Stages](#stages).                         |
| `engine`                  | `EngineType`                  | `CODEPIPELINE`                         | Which engine renders the pipeline. See [Engine](#engine).                   |
| `githubActions`           | `GitHubActionsConfig`         | —                                      | GitHub Actions engine config; read only when `engine` is `GITHUB_ACTIONS`.  |
| `synthesizer`             | `{ type: SynthesizerType }`   | `DEFAULT`                              | Which stack synthesizer to install.                                         |
| `ci`                      | `CiConfigInput`               | engine defaults                        | Build steps and which stages CI synthesizes. See [CI](#ci).                 |
| `deployModel`             | `DeployModel`                 | `ASSEMBLY_PROMOTION`                   | How the deployed assembly is produced. See [Deploy model](#deploy-model).   |
| `codeArtifact`            | `CodeArtifactConfig`          | —                                      | Private CodeArtifact npm repo the builds authenticate against.              |
| `npmRegistry`             | `NpmRegistryConfig`           | —                                      | Generic private npm registry (bearer token).                                |
| `proxy`                   | `ProxyConfigInput`            | —                                      | HTTP(S) proxy every build project routes through.                           |
| `vpc`                     | `VpcConfig`                   | no VPC                                 | VPC the pipeline's CodeBuild projects run in. See [VPC](#vpc).              |
| `complianceLogBucketName` | `string`                      | —                                      | Compliance/access-log destination bucket name.                              |
| `codeBuildEnvSettings`    | `codebuild.BuildEnvironment`  | —                                      | CodeBuild overrides (privileged mode, compute, env vars).                   |
| `asyncDeploy`             | `boolean`                     | `false`                                | Let a Lambda own the CloudFormation wait instead of build compute.          |
| `express`                 | `boolean`                     | `false`                                | Deploy with CloudFormation express mode. See [Express mode](#express-mode). |
| `deployerImage`           | `BuildImage`                  | —                                      | Container mode: build & push a deployer image instead of deploying.         |

## `application` and `qualifier`

`application` names the app and drives asset naming. `qualifier` is the CDK bootstrap qualifier; when
omitted it is derived from `application` — lowercased, non-alphanumerics stripped, truncated to 10
characters (falling back to `cdkcicd` if that leaves nothing).

## Repository

The source repository, constructed through a `Repository` factory. The tracked branch defaults to
`main`.

```typescript
Repository.github('my-org/my-app'); // via a CodeStar (CodeConnections) connection
Repository.codecommit('my-repo'); // AWS CodeCommit
Repository.codestarConnection('my-org/my-app', connArn); // any provider via an existing connection ARN
Repository.s3('my-bucket/my-key'); // a versioned S3 object
// each factory takes an optional trailing `branch` argument, e.g. Repository.github('my-org/my-app', 'develop')
```

When `engine` is `GITHUB_ACTIONS`, `repository` must be `Repository.github(...)` — the workflow runs
where GitHub already checked the source out.

## Stages

Each entry is either a bare name (`'dev'`) or a full object. A stage's environment can target one region
(`region`) or many (`regions`), and `regionOrder` controls rollout order.

```typescript
stages: [
  'dev', // account/region resolved from ambient credentials at deploy time
  { name: 'int', env: { account: '222222222222', region: 'eu-west-1' } },
  {
    name: 'prod',
    env: { account: '333333333333', regions: ['eu-west-1', 'us-east-1'], regionOrder: RegionOrder.PARALLEL },
    manualApproval: true,
    deployment: { deployRole: 'arn:aws:iam::333333333333:role/Deployer' },
  },
],
```

- **`manualApproval`** — defaults to auto-approve for `dev` and `res` (inner-loop stages) and gated for
  every other stage. Set it explicitly to override.
- **`regionOrder`** — `RegionOrder.SEQUENTIAL` (default) rolls regions out one after another;
  `RegionOrder.PARALLEL` deploys them at once.
- **`deployment`** — force a `deployRole` (`cdk deploy --role-arn`) and/or `cfnExecutionRole` for the
  stage.

See [Continuous Deployment](./cd.md) for the deeper stage model.

## Engine

`engine` selects how the pipeline is rendered:

- **`EngineType.CODEPIPELINE`** (default) — a lightweight flat pipeline on raw
  `aws-cdk-lib/aws-codepipeline`. Deploy stages re-invoke the app per stage, so `bin/` stays a plain
  single-stage app. This is also the only engine that supports [container mode](./container_mode.md).
- **`EngineType.CDK_PIPELINES`** — the Blueprint-compatible self-mutating pipeline on
  `aws-cdk-lib/pipelines` (Source → Synth → Assets → one wave per stage). Choose it when you want a
  pipeline shaped like a Blueprint (`0.x`) one.
- **`EngineType.GITHUB_ACTIONS`** — renders a GitHub Actions workflow instead of an AWS-hosted pipeline.
  Requires `repository` to be `Repository.github(...)` and reads the `githubActions` config.

## CI

`ci` controls the build steps and which stages CI synthesizes for validation.

```typescript
ci: {
  steps: { lint: 'npx cdk-cicd validate', test: 'npx jest' }, // empty => the engine's default check set
  synthStages: 'all', // 'all' (every stage), an explicit list, or omit for the engine default
  // image: 'aws/codebuild/standard:7.0',
  // partialBuildSpec: codebuild.BuildSpec.fromObject({ ... }), // merged into the CI build project only
},
```

- **`steps`** — named shell commands. Empty (the default) applies the engine's built-in check set
  (`npx cdk-cicd check`). Setting `steps` _replaces_ that default, so include a `check` step if you still
  want those checks.
- **`synthStages`** — `'all'` synthesizes every stage; an explicit list names stages; omitting it uses
  the engine default (every stage under `ASSEMBLY_PROMOTION`, one env under `DEPLOY_TIME_SYNTH`).
- **`partialBuildSpec`** — a CodeBuild spec fragment deep-merged into the CI build project's generated
  buildspec (the CI project only — not self-update or per-stage deploy projects).

## Deploy model

`deployModel` controls how the deployed cloud assembly is produced:

- **`DeployModel.ASSEMBLY_PROMOTION`** (default) — CI synthesizes every stage once and promotes `cdk.out`
  as the pipeline artifact; each deploy stage consumes that assembly (one synth per pipeline run).
- **`DeployModel.DEPLOY_TIME_SYNTH`** — each stage synthesizes at deploy time from code + pinned deps
  against that stage's injected config. Pick it when a stage's template must be produced with that
  stage's own credentials (for example a synth-time lookup only the target account can resolve).

## Private dependencies

Three independent, optional blocks let the pipeline's builds install private packages:

- **`codeArtifact`** — `{ domain, repository, account?, region?, npmScope? }`. Every build runs
  `aws codeartifact login` before `npm ci`.
- **`npmRegistry`** — `{ url, basicAuthSecretArn, scope? }`. Any npm-compatible registry; the build writes
  a `.npmrc` with a bearer token read from Secrets Manager.
- **`proxy`** — `{ proxySecretArn, noProxy?, proxyTestUrl? }`. Every build reads proxy credentials from
  Secrets Manager, exports `HTTP(S)_PROXY`, and curls `proxyTestUrl` to prove the tunnel before installs.
  `noProxy` defaults to `[]`; `proxyTestUrl` defaults to `https://aws.amazon.com`.

## VPC

`vpc` runs the pipeline's CodeBuild projects inside a VPC. Set `managedVpc` to have the wrapper create
one, or `vpcId` to look up an existing one; setting neither (the default) runs CodeBuild without a VPC.

```typescript
vpc: { managedVpc: { cidrBlock: '172.31.0.0/20', maxAzs: 2 } },
// or: vpc: { vpcId: 'vpc-0123456789abcdef0' }        // literal id, or 'resolve:ssm:/path' to read from SSM
```

`managedVpc` accepts `cidrBlock` (`172.31.0.0/20`), `subnetCidrMask` (`24`), `maxAzs` (`2`), `subnetType`,
`restrictDefaultSecurityGroup` (`true`), `allowAllOutbound` (`true`), `flowLogsBucketName`, and
`codeBuildVpcInterfaces`. See [Networking](./networking.md).

## Express mode

`express: true` deploys with CloudFormation express mode (`cdk deploy --express`): CloudFormation reports
each stack complete as soon as it applies the resource configuration, _without_ waiting for resources to
stabilize — materially faster for slow-to-stabilize stacks. Express runs with **rollback disabled** (a
failed deploy is left in a failed state for inspection). AWS does **not** recommend express mode for
production; it targets fast iterative deployments. Off by default.

## Container mode

`deployerImage: BuildImage.docker({ ... })` switches the pipeline to build and push a config-agnostic
deployer image instead of deploying stages (CodePipeline engine only). The deploy side is authored
separately with `defineDeployment` in a `deploy.config.ts`. See the
[Container mode guide](./container_mode.md) for the full two-repository flow.
