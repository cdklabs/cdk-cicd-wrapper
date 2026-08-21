// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The RESOLVED cicd-config shape -- the union-free, defaults-applied structs `defineCICD` produces
// and the CLI (exec/synth/deploy) consumes. The flexible INPUT shapes a user writes (single region or
// many, a stage as a bare name or an object) use TS unions and live in ./define.ts; they are never
// part of the jsii surface. Only the resolved structs here cross the language boundary.

import { Repository } from './repository';

/** Order in which a stage's regions are rolled out. */
export enum RegionOrder {
  /** One region after another (default). */
  SEQUENTIAL = 'sequential',
  /** All regions at once. */
  PARALLEL = 'parallel',
}

/** Which stack synthesizer the wrapper installs. */
export enum SynthesizerType {
  /** `DefaultStackSynthesizer` -- the v3 default. */
  DEFAULT = 'default',
  /** `AppStagingSynthesizer` -- opt-in, still alpha. */
  APP_STAGING = 'app_staging',
}

/** Which CI/CD engine renders the pipeline. */
export enum EngineType {
  /** AWS CodePipeline -- the v3 default (and, in M4, the only one). */
  CODEPIPELINE = 'codepipeline',
}

/**
 * How the deployed cloud assembly is produced. See `task.md` D-deploy: two CodePipeline
 * implementations, efficiency first.
 */
export enum DeployModel {
  /**
   * The default, and what v2 did: the CI/build phase synthesizes every stage **once** and keeps
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
  /** Stages CI synthesizes for validation. Empty means all stages. */
  readonly synthStages: string[];
  /** Optional CodeBuild image override. */
  readonly image?: string;
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
  /** The source repository. */
  readonly repository: Repository;
  /** The deployment stages, in order. */
  readonly stages: ResolvedStage[];
  /** The synthesizer configuration. */
  readonly synthesizer: SynthesizerConfig;
  /** Which engine renders the pipeline. Defaults to CodePipeline. */
  readonly engine: EngineType;
  /** Resolved CI configuration. */
  readonly ci: CiConfig;
  /** Private CodeArtifact npm repository the builds authenticate against, if any. */
  readonly codeArtifact?: CodeArtifactConfig;
  /** How the deployed cloud assembly is produced. Defaults to `ASSEMBLY_PROMOTION`. */
  readonly deployModel: DeployModel;
}
