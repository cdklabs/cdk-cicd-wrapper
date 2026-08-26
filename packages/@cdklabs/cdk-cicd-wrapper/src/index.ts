// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// The v3 **public** surface. This barrel is re-exported from the package entry point, so everything
// named here lands in the jsii assembly and ships to Python/Java/.NET as well as npm. It is curated
// rather than a `export *` on purpose — several members of `./appconfig` cannot cross the jsii
// boundary and are internal-only:
//
//   ConfigLoader / ConfigLoadOptions  generic methods (`load<T>`) and `NodeJS.ProcessEnv`; `AppConfig`
//                                     is the jsii-safe front door for both.
//   ConfigError                       jsii cannot model a custom exception type. The `kind` enum is
//                                     exported so callers can still discriminate; the class itself is
//                                     an implementation detail of how the failure surfaces in JS.
//   deepMerge / getDefaultConfig /    bare functions and a mapped type; jsii only models types.
//   applyDerivedDefaults / DeepPartial
//   validateConfig / getByPath        bare functions, internal to validation.
//
// Anything in this repo that needs the unrestricted API imports from `./appconfig` directly.
export { AppConfig, AppConfigOptions } from './appconfig/accessor';
export { ConfigErrorKind } from './appconfig/error';
export { AwsEnvironment, BaseConfig, RemovalPolicies, RemovalPolicyValue } from './appconfig/schema';
export { ConditionalFieldGroup, ConfigSchema, FieldKind, RequiredField } from './appconfig/validation';

// Runtime injection. The preload (register.ts) is loaded for its side effect only and is NOT
// exported; `CdkCicd.attach` is the jsii-safe explicit entry point for bundled/ESM apps where the
// preload cannot patch App. The rest of `./runtime` (the shared helpers, the counter, the loader)
// stays internal for the same reasons the config machinery does.
export { CdkCicd } from './runtime/attach';

// CICD (pipeline) config -- the `cicd.config.ts` authoring surface. `Repository`, the enums and the
// resolved structs are jsii-modeled. `defineCICD` is exported for the TypeScript authoring path but,
// being a free function with a union-typed input, is invisible to jsii (Python/Java authoring parity
// is a later concern -- design open-question O1); the input interfaces (CicdConfigProps/StageInput/
// StageEnvInput) stay internal to ./config/define for the same union reason.
export { Repository, RepositorySourceType } from './config/repository';
// Container mode (Repo 1): build & push a config-agnostic deployer image to ECR (two-repo split).
export { BuildImage, BuildImageKind, DockerBuildProps, ImageTagStrategy } from './config/build-image';
export {
  CiConfig,
  CodeArtifactConfig,
  DeployModel,
  DeploymentConfig,
  EngineType,
  GitHubActionsConfig,
  ManagedVpcConfig,
  NpmRegistryConfig,
  ProxyConfig,
  RegionOrder,
  ResolvedCicdConfig,
  ResolvedDeploymentConfig,
  ResolvedDeploymentTarget,
  ResolvedStage,
  StageEnvironment,
  SynthesizerConfig,
  SynthesizerType,
  VpcConfig,
} from './config/types';
export { defineCICD } from './config/define';
// Container mode (Repo 2): `defineDeployment` authors the `deploy.config.ts` that drives
// `cdk-cicd deploy --from-image`. TS-only like `defineCICD`; only the resolved structs are jsii-modeled.
export { defineDeployment } from './config/define';
// Stack-name control for `bin/` (TS-authoring, like `defineCICD`): a stage-qualified name, and the option
// to reproduce Blueprint's `<STAGE>-<base>` so a migration updates the existing stack in place. See naming.ts.
export { stageStackName, StageStackNameOptions } from './config/naming';

// The engine abstraction (m4-iengine). `IEngine`/`EngineRenderProps` are the seam CodePipeline (M4)
// and later container engines implement; concrete engines will be exported here as they land.
export { EngineRenderProps, IEngine } from './engine/types';
export { CodePipelineEngine, CodePipelineEngineProps } from './engine/codepipeline/CodePipelineEngine';
// Container mode (Repo 2) CD pipeline: consumes the pushed image and deploys each target. The deploy-side
// twin of the CI CodePipeline; `cdk-cicd deploy-ci` provisions it from a `deploy.config.ts` with a `repository`.
export { DeploymentPipeline, DeploymentPipelineProps } from './engine/codepipeline/DeploymentPipeline';
// The Blueprint-compatible engine: builds the pipeline with CDK Pipelines (`aws-cdk-lib/pipelines`), like Blueprint did,
// for teams that want a pipeline shaped like their old one. Activated by `cdk-cicd exec` (engine:
// CDK_PIPELINES in cicd.config), which assembles it by replaying the plain bin per stage -- so bin/ stays
// a plain app, no factory. The construct + IStageProvider are exported for advanced/explicit use.
export {
  CdkPipelinesEngine,
  CdkPipelinesEngineProps,
  CdkPipelinesStageContext,
  IStageProvider,
} from './engine/cdkpipelines/CdkPipelinesEngine';
// The GitHub Actions engine (m9-migrate-github-actions-engine): renders a `.github/workflows/deploy.yml`
// instead of an AWS-hosted pipeline (Blueprint `GitHubPipelinePlugin`, migrated). Same self-mutating shape as
// `CdkPipelinesEngine` -- activated by `engine: GITHUB_ACTIONS` in `cicd.config.ts`, assembled the same
// way (replaying the plain bin per stage).
export { GitHubActionsEngine, GitHubActionsEngineProps } from './engine/github/GitHubActionsEngine';

// The app that holds the pipeline. `cdk-cicd deploy-ci` uses it through `--app` so no user file is
// needed; it is exported because the same class is the explicit opt-in path for a user who would
// rather instantiate the pipeline in their own `bin/`.
export { PipelineApp, PipelineAppProps } from './app/PipelineApp';
export { DeploymentPipelineApp, DeploymentPipelineAppProps } from './app/DeploymentPipelineApp';

// The wrapper's own support resources (m4-support-resources) -- lazily provisioned, so a pipeline
// only pays for what it references. This is Blueprint's resource-provider concept with the singleton and the
// untyped registry removed.
export { SupportResources, SupportResourcesProps } from './support/SupportResources';
// VPC networking for the pipeline's own CodeBuild projects (m9-migrate-vpc); `VpcNetworking` is
// exported because it is the public return type of `SupportResources.vpcNetworking`.
export { VpcNetworking } from './support/Vpc';
// Default CloudWatch log-retention (m9-migrate-log-retention), applied tree-wide by the runtime
// injection hook; exported for a narrower, explicit `Aspects.of(scope).add(...)` use.
export { LogRetentionAspect, LogRetentionAspectProps } from './support/LogRetentionAspect';
// Blueprint's other default-on security-hardening plugins (m9-migrate-security-plugins). The four with no
// extra config/resource dependency are, like log retention above, applied tree-wide by the runtime
// injection hook; exported here too for a narrower, explicit use.
export { EncryptBucketOnTransitAspect } from './support/EncryptBucketOnTransitAspect';
export { EncryptSNSTopicOnTransitAspect } from './support/EncryptSNSTopicOnTransitAspect';
export { RotateEncryptionKeysAspect } from './support/RotateEncryptionKeysAspect';
export { DisablePublicIPAssignmentForEC2Aspect } from './support/DisablePublicIPAssignmentForEC2Aspect';
// Opt-in only (not wired into the runtime injection hook): each needs a dependency v3 does not
// provision by default yet -- a compliance-log bucket, a KMS key, or a caller-owned dead-letter queue.
export { DestroyEncryptionKeysOnDeleteAspect } from './support/DestroyEncryptionKeysOnDeleteAspect';
export {
  EncryptCloudWatchLogGroupsAspect,
  EncryptCloudWatchLogGroupsAspectProps,
} from './support/EncryptCloudWatchLogGroupsAspect';
export { AccessLogsForBucketAspect, AccessLogsForBucketAspectProps } from './support/AccessLogsForBucketAspect';
export { LambdaDLQAspect, LambdaDLQAspectProps } from './support/LambdaDLQAspect';
