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
}
