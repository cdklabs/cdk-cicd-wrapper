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
| `pipelineStackName`       | `string`                      | `${application}-pipeline`              | CloudFormation stack name for the self-mutating pipeline stack (`CDK_PIPELINES`/`GITHUB_ACTIONS`). See [Pipeline stack name](#pipeline-stack-name). |
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
| `pipelineRoleNames`       | `PipelineRoleNames`           | CDK-generated names                    | Force IAM role names on the `CDK_PIPELINES` engine's roles. See [Pipeline role names](#pipeline-role-names). |
| `codePipelineRoleNames`   | `CodePipelineRoleNames`       | CDK-generated names                    | Force IAM role names on the flat `CODEPIPELINE` engine's roles. See [Pipeline role names](#pipeline-role-names). |
| `deployRoleExternalId`    | `string`                      | —                                      | Pipeline-level default ExternalId for the forced deploy-role assumption. See [Cross-account externalId](#cross-account-externalid). |
| `codeBuildEnvSettings`    | `codebuild.BuildEnvironment`  | —                                      | CodeBuild overrides (privileged mode, compute, env vars).                   |
| `asyncDeploy`             | `boolean`                     | `false`                                | Let a Lambda own the CloudFormation wait instead of build compute.          |
| `express`                 | `boolean`                     | `false`                                | Deploy with CloudFormation express mode. See [Express mode](#express-mode). |
| `deployerImage`           | `BuildImage`                  | —                                      | Container mode: build & push a deployer image instead of deploying.         |
| `plugins`                 | `PluginRef[]`                 | the default-on hardening set           | Security plugins (hardening Aspects) applied tree-wide. See [Security plugins](#security-plugins). |

## `application` and `qualifier`

`application` names the app and drives asset naming. `qualifier` is the CDK bootstrap qualifier; when
omitted it is derived from `application` — lowercased, non-alphanumerics stripped, truncated to 10
characters (falling back to `cdkcicd` if that leaves nothing).

## Pipeline stack name

The `CDK_PIPELINES` and `GITHUB_ACTIONS` engines assemble their own self-mutating pipeline stack, named
`${application}-pipeline` by default. `pipelineStackName` overrides the CloudFormation stack name of
that stack:

```typescript
export default defineCICD({
  application: 'automation',
  pipelineStackName: 'automation', // deploy the pipeline stack as `automation`, not `automation-pipeline`
  repository: Repository.codecommit('automation'),
  engine: EngineType.CDK_PIPELINES,
  stages: [/* … */],
});
```

Set it to preserve a pre-1.x (Blueprint) pipeline stack name when migrating an **already-deployed**
pipeline. A deployed pipeline is self-mutating: its `SelfMutate` step runs `cdk deploy <stackName>`, and
a self-mutating pipeline cannot rename its own root stack in place — so if the synthesized stack name
changes from the deployed one, `SelfMutate` fails with `No stacks match the name(s) <oldName>`. Pinning
the name back to the deployed value lets the existing pipeline update in place, avoiding a disruptive
rename cutover (pipeline outage plus, where the pipeline pins cross-account role names, a manual
role-name resequencing).

The override changes **only** the CloudFormation `stackName`. The construct id stays
`${application}-pipeline`, so the pipeline's child resource logical IDs (roles, CodeBuild projects,
artifact buckets) — which derive from the construct node path — are unchanged from the default. It does
not restore pre-1.x child logical IDs; it is scoped to the pipeline stack name only. Omitting the field
keeps the `${application}-pipeline` default, so existing consumers are unaffected.

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
  stage, and optionally an `externalId` presented when assuming `deployRole`. See
  [Cross-account externalId](#cross-account-externalid).

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

## GitHub Actions

When `engine` is `EngineType.GITHUB_ACTIONS`, `githubActions` configures the generated workflow and the
OIDC role it assumes. Every field is optional.

```typescript
githubActions: {
  roleName: 'my-app-github-role', // OIDC role the workflow assumes (literal; embedded in the workflow YAML)
  subjectClaims: ['repo:my-org/my-app:ref:refs/heads/main'], // allowed OIDC subject claims
  openIdConnectProviderArn: 'arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com',
  thumbprints: ['<sha1>'], // GitHub cert thumbprints (defaults to the built-in set)
  workflowPath: '.github/workflows/deploy.yml',
  workflowName: 'deploy',
  workflowTriggers: { push: { branches: ['main'] } }, // cdk-pipelines-github WorkflowTriggers
  publishAssetsAuthRegion: 'us-west-2', // region the OIDC role is assumed in when publishing assets
},
```

- **`roleName`** — the OIDC role the workflow assumes. Must be literal (the workflow YAML embeds its
  ARN as plain text). Defaults to `<application>-github-role`.
- **`subjectClaims`** — OIDC subject claims allowed to assume the role. Defaults to every ref/environment
  of `repository`'s `owner/repo`.
- **`openIdConnectProviderArn`** — an existing OIDC provider ARN; omit to have one created.
- **`thumbprints`** — GitHub certificate thumbprints; defaults to the built-in, currently-valid set.
- **`workflowPath`** / **`workflowName`** — file path and name of the generated workflow (default
  `.github/workflows/deploy.yml`, `deploy`).
- **`workflowTriggers`** — the workflow's triggers (default: push to the tracked branch plus manual
  dispatch).
- **`publishAssetsAuthRegion`** — the region the OIDC role is assumed in when publishing assets (not the
  region assets publish to). Default `us-west-2`.

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
- **`image`** — an optional CodeBuild image override for the CI build project.
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

- **`codeArtifact`** — a private CodeArtifact npm repository. Every build runs `aws codeartifact login`
  before `npm ci`. Fields: `domain` and `repository` (required); `account` and `region` default to the
  pipeline's own; `npmScope` binds an npm scope (e.g. `cdklabs` for `@cdklabs/*`).
- **`npmRegistry`** — any npm-compatible registry authenticated with a bearer token; the build writes a
  `.npmrc` with a token read from Secrets Manager. Fields: `url` (the registry URL) and
  `basicAuthSecretArn` (the Secrets Manager secret) are required; `scope` binds an npm scope, omit to
  override the default registry.
- **`proxy`** — route every build through an HTTP(S) proxy. `proxySecretArn` (required) is the Secrets
  Manager secret holding the proxy credentials; the build exports `HTTP(S)_PROXY` and curls
  `proxyTestUrl` to prove the tunnel before installs. `noProxy` defaults to `[]`; `proxyTestUrl` defaults
  to `https://aws.amazon.com`.

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

## Pipeline role names

Force deterministic IAM role names on the pipeline's own roles — the parity replacement for Blueprint's
`PipelineRoleNameEnforcementPlugin`. Use it when external cross-account trust policies, SCPs, or
permission boundaries reference fixed role names. Any field you omit keeps the CDK-generated name, so
existing pipelines are unaffected. The two engines expose **different** role sets, so each takes its own
field (the `GITHUB_ACTIONS` engine's only role is already nameable via `githubActions.roleName`).

For `EngineType.CDK_PIPELINES`, use `pipelineRoleNames`:

```typescript
pipelineRoleNames: {
  pipeline: 'my-app-codepipeline-role', // the CodePipeline pipeline role
  assetsFile: 'my-app-codepipeline-assets-file-role', // CDK Pipelines file-publishing role
  assetsDocker: 'my-app-codepipeline-assets-docker-role', // CDK Pipelines docker-publishing role
},
```

For the flat `EngineType.CODEPIPELINE`, use `codePipelineRoleNames`:

```typescript
codePipelineRoleNames: {
  pipeline: 'my-app-codepipeline-role', // the CodePipeline pipeline role
  buildRolePrefix: 'my-app-build', // per-stage CodeBuild roles => `<prefix>-<projectId>`, e.g. `my-app-build-deploy-dev`
},
```

## Cross-account externalId

When a stage forces a `deployRole` (see [Stages](#stages)), you can present an `ExternalId` on the role
assumption — the `sts:ExternalId` condition a hardened cross-account trust policy requires. It threads
into the synthesizer as `DefaultStackSynthesizer.deployRoleExternalId`, so it applies to the
`cdk deploy --role-arn` assumption the wrapper performs; it is a no-op without a `deployRole`.

Set a pipeline-level default with `deployRoleExternalId`, and override per stage with
`deployment.externalId` (the per-stage value wins):

```typescript
export default defineCICD({
  application: 'my-app',
  repository: Repository.github('my-org/my-app'),
  deployRoleExternalId: 'org-wide-external-id', // pipeline-level default
  stages: [
    {
      name: 'prod',
      env: { account: '333333333333', region: 'eu-west-1' },
      deployment: {
        deployRole: 'arn:aws:iam::333333333333:role/Deployer',
        externalId: 'prod-only-external-id', // overrides the pipeline-level default for this stage
      },
    },
  ],
});
```

Either value may be a literal, or a `resolve:secretsmanager:<arn>` reference resolved at exec time from
the secret's `SecretString` (so the ExternalId can live in Secrets Manager rather than in
`cicd.config.ts`).

## Security plugins

`plugins` selects the security-hardening Aspects the wrapper applies tree-wide (`PluginRef[]`, each a
`{ name, version }`). Omitting it applies the default-on set; `[]` opts out of all of them; a non-empty
list **completely overrides** the defaults (list only what you want). A name that is not a built-in is a
custom plugin and must be registered in `bin/` via `CdkCicd.addPlugin`.

```typescript
plugins: [{ name: 'EncryptBucketOnTransit', version: '1.0.0' }], // only this one; defaults dropped
// plugins: [],                                                   // opt out of all default hardening
```

See [Getting started](../getting_started/index.md) for the built-in set and the custom-plugin flow.
