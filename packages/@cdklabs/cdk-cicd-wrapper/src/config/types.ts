// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The RESOLVED cicd-config shape -- the union-free, defaults-applied structs `defineCICD` produces
// and the CLI (exec/synth/deploy) consumes. The flexible INPUT shapes a user writes (single region or
// many, a stage as a bare name or an object) use TS unions and live in ./define.ts; they are never
// part of the jsii surface. Only the resolved structs here cross the language boundary.

import { aws_codebuild as codebuild, aws_ec2 as ec2 } from 'aws-cdk-lib';
import { WorkflowTriggers } from 'cdk-pipelines-github';
import { BuildImage } from './build-image';
import { Repository } from './repository';

/**
 * A security plugin's stable identity (issue #241). Serializable, so it is what `cicd.config.ts`
 * carries (through CDK context) to select a built-in plugin or declare a custom one. A custom
 * plugin's actual `IAspect` instance is supplied separately in `bin/` via `CdkCicd.addPlugin`, since
 * a live object cannot cross the context boundary.
 */
export interface PluginRef {
  /** Stable plugin name. Built-in names are fixed; a custom name must match a `bin/` `addPlugin`. */
  readonly name: string;
  /** Plugin version, recorded for inventory and divergence warnings. */
  readonly version: string;
}

/** Order in which a stage's regions are rolled out. */
export enum RegionOrder {
  /** One region after another (default). */
  SEQUENTIAL = 'sequential',
  /** All regions at once. */
  PARALLEL = 'parallel',
}

/**
 * The language of the CDK application CI builds. Selects which default build phase the engines render
 * when no `ci.steps` is set: the Node/npm default, or the Python (pip/uv) default. When left unset the
 * engine auto-detects from `cdk.json`'s `app` command (a `python`/`uv run python` command is Python;
 * anything else is Node).
 */
export enum CiLanguage {
  /** Node/TypeScript CDK app: `npm ci` then `npm run audit|build|test` (the default). */
  NODE = 'node',
  /** Python CDK app: install then `pip-audit`/`mypy`/`pytest` (pip) or their `uv run` equivalents (uv). */
  PYTHON = 'python',
}

/** Which stack synthesizer the wrapper installs. */
export enum SynthesizerType {
  /** `DefaultStackSynthesizer` -- the Autopilot default. */
  DEFAULT = 'default',
  /** `AppStagingSynthesizer` -- opt-in, still alpha. */
  APP_STAGING = 'app_staging',
}

/** Which CI/CD engine renders the pipeline. */
export enum EngineType {
  /**
   * The lightweight flat engine on raw `aws-cdk-lib/aws-codepipeline` -- the Autopilot default. Its deploy
   * stages re-invoke the app per stage, so the user's `bin` stays a plain single-stage app.
   */
  CODEPIPELINE = 'codepipeline',
  /**
   * The Blueprint-compatible self-mutating pipeline on `aws-cdk-lib/pipelines` (Source -> Synth -> Assets ->
   * one wave per stage). `cdk-cicd exec` assembles it by replaying the plain `bin` once per configured
   * stage (see runtime/pipeline-assembler), so the user's `bin` still needs no wrapper code.
   */
  CDK_PIPELINES = 'cdk-pipelines',
  /**
   * Renders a GitHub Actions workflow (`cdk-pipelines-github`) instead of an AWS-hosted pipeline
   * (Blueprint `GitHubPipelinePlugin`, migrated). Like `CDK_PIPELINES`, it needs every stage built as a `cdk.Stage`
   * inside one synth, so `cdk-cicd exec` assembles it the same way -- replaying the plain `bin` once per
   * configured stage.
   */
  GITHUB_ACTIONS = 'github-actions',
}

/**
 * GitHub Actions engine configuration: the OIDC role the workflow assumes plus the workflow file's own
 * identity (Blueprint `GitHubPipelinePluginOptions`, migrated). Only read when `engine` is `GITHUB_ACTIONS`;
 * `repository` must be `Repository.github(...)` in that case (the workflow runs where GitHub already
 * checked the source out, so there is no CodeStar-connection source action to build).
 */
export interface GitHubActionsConfig {
  /**
   * Name of the OIDC role the workflow assumes to deploy. Must be a literal (not CDK-generated): the
   * workflow YAML embeds its ARN as plain text, which only works for a name known before synth.
   * @default `<application>-github-role`
   */
  readonly roleName?: string;
  /**
   * Subject claims allowed to assume the role, e.g. `['repo:owner/repo:ref:refs/heads/main']`. Defaults
   * to every ref/environment of `repository`'s `owner/repo` when omitted.
   */
  readonly subjectClaims?: string[];
  /** An existing GitHub OIDC provider's ARN. Omit to have one created (one per account/provider URL). */
  readonly openIdConnectProviderArn?: string;
  /** GitHub certificate thumbprints. @default - the built-in, currently-valid set */
  readonly thumbprints?: string[];
  /** File path for the generated workflow. @default ".github/workflows/deploy.yml" */
  readonly workflowPath?: string;
  /** Name of the generated workflow. @default "deploy" */
  readonly workflowName?: string;
  /** GitHub workflow triggers. @default - push to the tracked branch, plus manual dispatch */
  readonly workflowTriggers?: WorkflowTriggers;
  /**
   * Region the workflow assumes the OIDC role in when publishing assets (NOT the region assets publish
   * to). @default "us-west-2"
   */
  readonly publishAssetsAuthRegion?: string;
}

/**
 * How the deployed cloud assembly is produced. See `task.md` D-deploy: two CodePipeline
 * implementations, efficiency first.
 */
export enum DeployModel {
  /**
   * The default, and what Blueprint did: the CI/build phase synthesizes every stage **once** and keeps
   * `cdk.out`, which is promoted as the pipeline artifact. Each deploy stage consumes that assembly and
   * performs no synth of its own -- one synth per pipeline run.
   */
  ASSEMBLY_PROMOTION = 'assembly-promotion',
  /**
   * Each stage synthesizes at deploy time from code + pinned deps, against that stage's injected config.
   * The promoted unit is the code, not a baked assembly; CI synth is validation only. Costs one synth per
   * stage, and is the model to pick when a stage's template must be produced with that stage's
   * credentials (for example a synth-time lookup that only the target account can resolve).
   */
  DEPLOY_TIME_SYNTH = 'deploy-time-synth',
}

/** Resolved CI configuration: the checks/build steps and which stages CI synthesizes for validation. */
export interface CiConfig {
  /**
   * Named build steps as shell commands, e.g. `{ lint: 'npx cdk-cicd validate' }`. Empty means the
   * engine applies its built-in default set.
   */
  readonly steps: { [key: string]: string };
  /**
   * The CDK app's language, selecting which default build phase the engines render when `steps` is
   * empty. Omitted means auto-detect from `cdk.json`'s `app` command at synth time (see `CiLanguage`).
   */
  readonly language?: CiLanguage;
  /**
   * Which stages CI synthesizes. Empty means the engine's default -- every stage under
   * `ASSEMBLY_PROMOTION`, one env under `DEPLOY_TIME_SYNTH`. A non-empty list names the stages
   * explicitly; `defineCICD`'s `'all'` shorthand resolves to the full stage list here.
   */
  readonly synthStages: string[];
  /** Optional CodeBuild image override. */
  readonly image?: string;
  /**
   * Escape hatch (Blueprint `CDKPipelineProps.ciBuildSpec`, migrated): deep-merged into the CI build project's
   * generated buildspec via `codebuild.mergeBuildSpecs`, augmenting rather than replacing the engine's
   * own phases. Scoped the same way Blueprint scoped it -- the CI build project only, not self-update or
   * per-stage deploy projects.
   */
  readonly partialBuildSpec?: codebuild.BuildSpec;
}

/**
 * A private CodeArtifact npm repository the pipeline's builds authenticate against. When set, every
 * build project runs `aws codeartifact login` before `npm ci` and is granted read access to the
 * repository -- which is how a pipeline installs private packages (including the wrapper itself before
 * it is published to the public npm registry).
 */
export interface CodeArtifactConfig {
  /** The CodeArtifact domain. */
  readonly domain: string;
  /** The repository within the domain. */
  readonly repository: string;
  /** Domain-owning account. Defaults to the pipeline's own account. */
  readonly account?: string;
  /** Region the domain lives in. Defaults to the pipeline's own region. */
  readonly region?: string;
  /** npm scope to bind to the repository, e.g. `cdklabs` for `@cdklabs/*`. Omit for the default scope. */
  readonly npmScope?: string;
}

/**
 * HTTP(S) proxy configuration for the pipeline's CodeBuild projects (Blueprint `IProxyConfig`, migrated).
 * When set, every build project reads proxy credentials from Secrets Manager, exports
 * `HTTP(S)_PROXY` before running its install commands, and curls `proxyTestUrl` to prove the tunnel
 * works before the real install runs.
 */
export interface ProxyConfig {
  /**
   * ARN of the Secrets Manager secret holding the proxy credentials, as the keys `username`,
   * `password`, `http_proxy_port`, `https_proxy_port` and `proxy_domain`.
   */
  readonly proxySecretArn: string;
  /**
   * Hosts that bypass the proxy. Empty means the engine adds its own region's `amazonaws.com`
   * endpoint, so calls to AWS APIs (e.g. a private-registry `codeartifact login`) skip the proxy.
   */
  readonly noProxy: string[];
  /** URL curl'd (through the proxy) to confirm it works before the install phase's real commands run. */
  readonly proxyTestUrl: string;
}

/**
 * A generic private npm registry the pipeline's builds authenticate against with a bearer token
 * (Blueprint `NPMRegistryConfig`, migrated). Unlike `CodeArtifactConfig` (an `aws codeartifact login`), this covers
 * any npm-compatible registry: when set, every build project writes a `.npmrc` -- scoped to `scope` when
 * given, otherwise overriding the default registry -- with an auth token read from Secrets Manager.
 */
export interface NpmRegistryConfig {
  /** The registry URL, e.g. `https://npm.example.com/`. */
  readonly url: string;
  /** ARN of the Secrets Manager secret holding the bearer token (the secret's plain `SecretString`). */
  readonly basicAuthSecretArn: string;
  /** npm scope to bind to the registry, e.g. `cdklabs` for `@cdklabs/*`. Omit to override the default registry. */
  readonly scope?: string;
}

/**
 * VPC configuration for a wrapper-managed VPC (Blueprint `IManagedVpcConfig`, migrated from `VPCProvider`).
 * Every field is optional; an unset field takes Blueprint's original default.
 */
export interface ManagedVpcConfig {
  /** CIDR block for the VPC. @default '172.31.0.0/20' */
  readonly cidrBlock?: string;
  /** Subnet CIDR mask. @default 24 */
  readonly subnetCidrMask?: number;
  /** Max AZs. @default 2 */
  readonly maxAzs?: number;
  /**
   * The subnets the VPC's CodeBuild projects run in. Defaults to `PRIVATE_ISOLATED` when a `proxy`
   * is configured (no NAT egress; the CodeBuild VPC endpoints below cover AWS API calls instead) and
   * `PRIVATE_WITH_EGRESS` otherwise -- the rule Blueprint's `VPCProvider` applied.
   */
  readonly subnetType?: ec2.SubnetType;
  /**
   * Remove the default inbound/outbound rules from the VPC's default security group.
   * @default true
   */
  readonly restrictDefaultSecurityGroup?: boolean;
  /** Allow all outbound traffic by default from the security group the wrapper creates. @default true */
  readonly allowAllOutbound?: boolean;
  /**
   * S3 bucket to send VPC flow logs to. Blueprint always used the RES stage's compliance-log bucket
   * implicitly; Autopilot has not migrated that bucket yet (`m9-migrate-compliance-bucket`), so this is an
   * explicit prop instead -- omit to skip flow logs.
   */
  readonly flowLogsBucketName?: string;
  /**
   * Extra CodeBuild VPC interface endpoints beyond the default set (SSM, STS, CloudWatch Logs,
   * CloudFormation, Secrets Manager, KMS). Only used for the isolated-subnet case (see `subnetType`).
   */
  readonly codeBuildVpcInterfaces?: ec2.InterfaceVpcEndpointAwsService[];
}

/**
 * VPC configuration for the pipeline's own CodeBuild projects (Blueprint `IVpcConfig`, migrated from
 * `VPCProvider`). Set `managedVpc` to have the wrapper create a VPC, or `vpcId` to look up an
 * existing one; setting neither -- the default -- runs every CodeBuild project without a VPC.
 */
export interface VpcConfig {
  /** Create a new VPC with these settings. */
  readonly managedVpc?: ManagedVpcConfig;
  /**
   * Look up an existing VPC by id. A value starting with `resolve:ssm:` is resolved from the named
   * SSM parameter at synth time instead of being used literally (Blueprint `VPCFromLookUpStack` parity).
   */
  readonly vpcId?: string;
}

/** A resolved stage's target environment. `regions` is always a list, even for a single region. */
export interface StageEnvironment {
  /** Target account. Omitted means environment-agnostic (resolved from ambient creds at deploy). */
  readonly account?: string;
  /** Target regions, in order. Never empty for an environment-specific stage. */
  readonly regions: string[];
  /** How the regions roll out. */
  readonly regionOrder: RegionOrder;
}

/** Forced deployer / CloudFormation-execution roles for a stage. */
export interface DeploymentConfig {
  /** ARN the CLI assumes to deploy (passed as `cdk deploy --role-arn`). */
  readonly deployRole?: string;
  /** ARN CloudFormation assumes to execute the change set. */
  readonly cfnExecutionRole?: string;
  /**
   * ExternalId presented when assuming `deployRole` (the `sts:ExternalId` a hardened cross-account
   * trust policy requires). Overrides the pipeline-level `ResolvedCicdConfig.deployRoleExternalId` for
   * this stage. A literal, or a `resolve:secretsmanager:<arn>` reference resolved at synth time (the
   * same `resolve:` convention `VpcConfig.vpcId` uses). Ignored when `deployRole` is unset -- an
   * ExternalId only applies to a role assumption the wrapper actually performs.
   */
  readonly externalId?: string;
}

/**
 * Names for the CDK Pipelines (Blueprint-compatible `CDK_PIPELINES`) engine's IAM roles -- the parity
 * replacement for Blueprint's `PipelineRoleNameEnforcementPlugin`, which the 1.x assembler-owned
 * pipeline stack gives a consumer no way to reattach. Any field omitted keeps CDK's generated name (no
 * behavior change). Only read when `engine` is `EngineType.CDK_PIPELINES`. The flat engine's roles are a
 * different set -- see `CodePipelineRoleNames`.
 */
export interface PipelineRoleNames {
  /** `RoleName` forced on the CodePipeline pipeline role. */
  readonly pipeline?: string;
  /** `RoleName` forced on the CDK Pipelines file-publishing (assets) role. */
  readonly assetsFile?: string;
  /** `RoleName` forced on the CDK Pipelines docker-image-publishing (assets) role. */
  readonly assetsDocker?: string;
}

/**
 * Names for the flat `CODEPIPELINE` engine's IAM roles. This engine's role set differs from the CDK
 * Pipelines engine (no asset-publishing roles; instead one CodeBuild role per stage), so it takes its
 * own struct. Any field omitted keeps CDK's generated name. Only read when `engine` is
 * `EngineType.CODEPIPELINE`.
 */
export interface CodePipelineRoleNames {
  /** `RoleName` forced on the CodePipeline pipeline role. */
  readonly pipeline?: string;
  /**
   * Prefix for the per-stage CodeBuild project roles: each stage's build role is named
   * `<buildRolePrefix>-<stage>` (plus the CI/self-update projects, `<buildRolePrefix>-build` /
   * `<buildRolePrefix>-selfupdate`). Omit to keep CDK-generated names.
   */
  readonly buildRolePrefix?: string;
}

/** A fully resolved deployment stage. */
export interface ResolvedStage {
  /** Stage name, e.g. `dev`, `prod`. */
  readonly name: string;
  /** Where this stage deploys. */
  readonly env: StageEnvironment;
  /** Whether a manual approval gates this stage. */
  readonly manualApproval: boolean;
  /** Forced roles for this stage, if any. */
  readonly deployment?: DeploymentConfig;
}

/** The resolved synthesizer choice. */
export interface SynthesizerConfig {
  /** The synthesizer to install. */
  readonly type: SynthesizerType;
}

/** The fully resolved pipeline configuration `defineCICD` produces. */
export interface ResolvedCicdConfig {
  /** Application name; drives the bootstrap qualifier and asset naming. */
  readonly application?: string;
  /** Bootstrap qualifier (≤10 chars), derived from `application` when not given. */
  readonly qualifier?: string;
  /**
   * CloudFormation stack name for the engine-owned self-mutating pipeline stack (the one the
   * `CDK_PIPELINES` and `GITHUB_ACTIONS` engines assemble). Only read by those self-mutating engines;
   * the flat `CODEPIPELINE` engine names its stack from the user's own `bin`.
   * @default `${application}-pipeline`
   *
   * Set this to preserve a pre-1.x (Blueprint) pipeline stack name so an already-deployed,
   * self-mutating pipeline can update IN PLACE instead of requiring a rename cutover -- the pipeline's
   * `SelfMutate` step runs `cdk deploy <thisName>`, and a self-mutating pipeline cannot rename its own
   * root stack. Changes ONLY the CloudFormation `stackName`, never the construct id, so the pipeline's
   * child logical IDs are unchanged from the default. Same Blueprint-parity family as `pipelineRoleNames`.
   */
  readonly pipelineStackName?: string;
  /** The source repository. */
  readonly repository: Repository;
  /** The deployment stages, in order. */
  readonly stages: ResolvedStage[];
  /** The synthesizer configuration. */
  readonly synthesizer: SynthesizerConfig;
  /** Which engine renders the pipeline. Defaults to CodePipeline. */
  readonly engine: EngineType;
  /** GitHub Actions engine configuration. Only read when `engine` is `EngineType.GITHUB_ACTIONS`. */
  readonly githubActions?: GitHubActionsConfig;
  /**
   * Forced IAM role names for the CDK Pipelines (`CDK_PIPELINES`) engine's own roles. Only read when
   * `engine` is `EngineType.CDK_PIPELINES`; omitted fields keep CDK-generated names.
   */
  readonly pipelineRoleNames?: PipelineRoleNames;
  /**
   * Forced IAM role names for the flat `CODEPIPELINE` engine's own roles. Only read when `engine` is
   * `EngineType.CODEPIPELINE`; omitted fields keep CDK-generated names.
   */
  readonly codePipelineRoleNames?: CodePipelineRoleNames;
  /**
   * Pipeline-level default ExternalId presented when assuming a stage's forced `deployRole`. A stage's
   * own `DeploymentConfig.externalId` overrides this. A literal or a `resolve:secretsmanager:<arn>`
   * reference resolved at synth time.
   */
  readonly deployRoleExternalId?: string;
  /** Resolved CI configuration. */
  readonly ci: CiConfig;
  /** Private CodeArtifact npm repository the builds authenticate against, if any. */
  readonly codeArtifact?: CodeArtifactConfig;
  /** Generic private npm registry the builds authenticate against with a bearer token, if any. */
  readonly npmRegistry?: NpmRegistryConfig;
  /** HTTP(S) proxy every build project routes through, if any. */
  readonly proxy?: ProxyConfig;
  /** VPC every CodeBuild project the pipeline creates runs in, if configured (Blueprint `VPCProvider`, migrated). */
  readonly vpc?: VpcConfig;
  /**
   * The name of the compliance/access-log destination bucket, if configured (Blueprint
   * `ComplianceBucketProvider`/`ComplianceLogBucketStack`, migrated). Threaded into
   * `SupportResources.complianceLogBucket`; see there for the bucket's shape.
   */
  readonly complianceLogBucketName?: string;
  /**
   * CodeBuild environment overrides -- privileged mode, compute type, environment variables -- applied
   * to every CodeBuild project the pipeline creates (Blueprint `codeBuildEnvSettings`, migrated from
   * `CodeBuildFactoryProvider`/`PipelineBlueprint.codeBuildEnvSettings(...)`). Reuses CDK's own
   * `BuildEnvironment` rather than a bespoke type, so it stays a drop-in for Blueprint callers. `buildImage`
   * here is a full `IBuildImage` (e.g. an ARM or GPU managed image); it is distinct from the engines'
   * own `buildImage` constructor prop, which takes a Docker-registry image string -- that prop wins
   * when both are set.
   */
  readonly codeBuildEnvSettings?: codebuild.BuildEnvironment;
  /** How the deployed cloud assembly is produced. Defaults to `ASSEMBLY_PROMOTION`. */
  readonly deployModel: DeployModel;
  /**
   * Container mode (Repo 1): when set, the pipeline runs CI then builds & pushes a config-agnostic
   * deployer image to ECR instead of deploying stages. Undefined = the normal deploy pipeline. (Named
   * `deployerImage`, not `build` -- jsii reserves `build` as a struct member name.)
   */
  readonly deployerImage?: BuildImage;
  /**
   * Hand the CloudFormation wait to a Lambda instead of holding CodeBuild compute for it (D-deploy-wait).
   *
   * Off by default: the build-compute path is what `m4-verify` proves end to end, and this one replaces
   * how deployment actually executes -- change sets prepared by the build, then executed and polled by a
   * Lambda -- so it is opt-in until a real run validates it. When on, a deploy stage stops billing build
   * minutes for the (usually dominant) stretch where CloudFormation is working.
   */
  readonly asyncDeploy: boolean;
  /**
   * Deploy with **CloudFormation express mode** (`cdk deploy --express`). CloudFormation reports each
   * stack operation complete as soon as it applies the resource configuration, *without* waiting for
   * resources to stabilize -- materially faster for stacks whose resources are slow to stabilize.
   * Express runs with **rollback disabled** (a failed deploy is left in a failed state for inspection);
   * forcing `--rollback` conflicts with the change-set path for nested stacks, so the CLI does not add
   * it. AWS does **not** recommend express mode for production -- it targets fast iterative
   * deployments. Off by default.
   */
  readonly express?: boolean;
  /**
   * Security plugins (hardening Aspects) to apply tree-wide, by `{ name, version }` (issue #241).
   * Omitted keeps the default-on set; an empty list opts out of all; a non-empty list COMPLETELY
   * overrides the defaults. A name that is not a built-in is a custom plugin and MUST be registered
   * in `bin/` via `CdkCicd.addPlugin` -- the config carries only its identity, not the instance.
   */
  readonly plugins?: PluginRef[];
}

/**
 * A resolved deployment target for container mode (Repo 2): a stage to deploy the pinned image against,
 * with its own environment and optional forced roles. `env` mirrors a `ResolvedStage`'s environment, but a
 * target names the stage it maps to rather than defining it -- the stage's stacks live in the image, not
 * here. `manualApproval` defaults the same way stages do (gated unless `dev`/`res`).
 */
export interface ResolvedDeploymentTarget {
  /** The stage in the image's app to deploy (passed to the in-container `cdk-cicd deploy --stage`). */
  readonly stage: string;
  /** Where this target deploys. */
  readonly env: StageEnvironment;
  /** Whether a manual approval gates this target. */
  readonly manualApproval: boolean;
  /** Forced roles for this target, if any. */
  readonly deployment?: DeploymentConfig;
  /**
   * The deployer image (tag/digest) to run for THIS target, overriding the config-level `image`. This is
   * how a stage pins its own application version -- bump `dev`'s tag to ship a new version to dev alone,
   * or set `int`/`prod` to the same tag to promote. When unset, the target uses the config-level `image`.
   */
  readonly image?: string;
}

/**
 * The fully resolved container-mode deployment configuration `defineDeployment` produces (Repo 2 of the
 * two-repo split). It pins one config-agnostic deployer image and lists the targets to run it against;
 * `cdk-cicd deploy --from-image` runs the image per target, synthesizing and deploying in-container.
 */
export interface ResolvedDeploymentConfig {
  /**
   * The default deployer image to run targets against (an ECR/OCI reference, tag or digest). A target's
   * own `image` overrides this, so per-stage versions live on the targets; this is the shared fallback.
   * Optional only because every target may pin its own `image` -- each target must resolve to one or the other.
   */
  readonly image?: string;
  /** The deployment targets, in order. */
  readonly targets: ResolvedDeploymentTarget[];
  /**
   * The config-only source repository the CD pipeline watches (where `deploy.config.ts` lives -- no CDK
   * code). Optional: when omitted, the config drives only the local `cdk-cicd deploy --from-image`
   * executor; set it to provision a CD CodePipeline (`cdk-cicd deploy-ci`) whose CodeBuild pulls the image
   * and deploys each target. This is the deploy-side twin of `ResolvedCicdConfig.repository`.
   */
  readonly repository?: Repository;
  /**
   * Private CodeArtifact repo the CD build authenticates against before `npm ci` (to install the wrapper
   * CLI when it is pre-release / not on public npm). Same shape as the pipeline-config `codeArtifact`.
   */
  readonly codeArtifact?: CodeArtifactConfig;
  /**
   * Generic private npm registry the CD build authenticates against before `npm ci`. Same shape as the
   * pipeline-config `npmRegistry`.
   */
  readonly npmRegistry?: NpmRegistryConfig;
}
