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
export {
  CiConfig,
  DeploymentConfig,
  EngineType,
  RegionOrder,
  ResolvedCicdConfig,
  ResolvedStage,
  StageEnvironment,
  SynthesizerConfig,
  SynthesizerType,
} from './config/types';
export { defineCICD } from './config/define';

// The engine abstraction (m4-iengine). `IEngine`/`EngineRenderProps` are the seam CodePipeline (M4)
// and later GitHub Actions / container engines implement; concrete engines will be exported here as
// they land.
export { EngineRenderProps, IEngine } from './engine/types';
export { CodePipelineEngine, CodePipelineEngineProps } from './engine/codepipeline/CodePipelineEngine';

// The wrapper's own support resources (m4-support-resources) -- lazily provisioned, so a pipeline
// only pays for what it references. This is v2's resource-provider concept with the singleton and the
// untyped registry removed.
export { SupportResources, SupportResourcesProps } from './support/SupportResources';
