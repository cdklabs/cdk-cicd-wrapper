// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// defineCICD: the one-file Level-1 authoring API. It takes the flexible shape a user writes in
// cicd.config.ts and normalizes it to the union-free ResolvedCicdConfig the CLI consumes.
//
// defineCICD (and its input interfaces) are TS-ONLY on purpose: the input uses unions -- a stage may
// be a bare name or an object, an env may name one region or many -- which jsii cannot express. Only
// the RESOLVED output (./types.ts) is jsii-modeled. This is also why defineCICD is a free function:
// jsii silently omits free functions, and the TS authoring path (cicd.config.ts loaded via ts-node in
// the CLI, in-process) never crosses the jsii boundary. A Python/Java authoring equivalent is a
// separate, later concern (design open-question O1); for now `Repository` + the enums + the resolved
// structs are the jsii surface, and this function serves the TS path.

import { Repository } from './repository';
import {
  CiConfig,
  CodeArtifactConfig,
  DeploymentConfig,
  EngineType,
  RegionOrder,
  ResolvedCicdConfig,
  ResolvedStage,
  StageEnvironment,
  SynthesizerType,
} from './types';

/** Stage names that default to no manual approval (inner-loop / research stages). */
const AUTO_APPROVE_STAGES = new Set(['dev', 'res']);

/** A stage's target environment, as written. Either `region` (one) or `regions` (many). */
export interface StageEnvInput {
  readonly account?: string;
  readonly region?: string;
  readonly regions?: string[];
  readonly regionOrder?: RegionOrder;
}

/** A stage, as written: a full object (bare-name string form is handled at the array level). */
export interface StageInput {
  readonly name: string;
  readonly env?: StageEnvInput;
  readonly manualApproval?: boolean;
  readonly deployment?: DeploymentConfig;
}

/** CI config as written. `synthStages` may be the string `'all'` or an explicit list. */
export interface CiConfigInput {
  readonly steps?: { [key: string]: string };
  readonly synthStages?: string[] | 'all';
  readonly image?: string;
}

/** What a user passes to `defineCICD`. Deliberately permissive; normalized to `ResolvedCicdConfig`. */
export interface CicdConfigProps {
  readonly application?: string;
  readonly qualifier?: string;
  readonly repository: Repository;
  /** Each stage is either a bare name (`'dev'`) or a full object. */
  readonly stages: Array<string | StageInput>;
  readonly synthesizer?: { readonly type?: SynthesizerType };
  readonly engine?: EngineType;
  readonly ci?: CiConfigInput;
  readonly codeArtifact?: CodeArtifactConfig;
}

/** Normalize the permissive CI input, collapsing `synthStages: 'all'` to an empty list. */
function normalizeCi(ci?: CiConfigInput): CiConfig {
  return {
    steps: ci?.steps ?? {},
    synthStages: ci?.synthStages === undefined || ci.synthStages === 'all' ? [] : ci.synthStages,
    image: ci?.image,
  };
}

/** Derive a ≤10-char, lowercase-alphanumeric bootstrap qualifier from an application name. */
function deriveQualifier(application: string): string {
  const sanitized = application.toLowerCase().replace(/[^a-z0-9]/g, '');
  return sanitized.slice(0, 10) || 'cdkcicd';
}

function normalizeStage(stage: string | StageInput): ResolvedStage {
  const input: StageInput = typeof stage === 'string' ? { name: stage } : stage;
  const env: StageEnvInput = input.env ?? {};

  const regions = env.regions ?? (env.region !== undefined ? [env.region] : []);

  const resolvedEnv: StageEnvironment = {
    account: env.account,
    regions,
    regionOrder: env.regionOrder ?? RegionOrder.SEQUENTIAL,
  };

  return {
    name: input.name,
    env: resolvedEnv,
    // Inner-loop stages deploy without a gate; everything else defaults to requiring approval.
    manualApproval: input.manualApproval ?? !AUTO_APPROVE_STAGES.has(input.name),
    deployment: input.deployment,
  };
}

/**
 * Normalize an already-parsed config object (e.g. from a `cicd.config.yaml`) into the resolved shape.
 * Shared with `defineCICD` so YAML and TS authoring get identical defaults.
 */
export function resolveCicdConfig(props: CicdConfigProps): ResolvedCicdConfig {
  const application = props.application;
  return {
    application,
    qualifier: props.qualifier ?? (application !== undefined ? deriveQualifier(application) : undefined),
    repository: props.repository,
    stages: props.stages.map(normalizeStage),
    synthesizer: { type: props.synthesizer?.type ?? SynthesizerType.DEFAULT },
    engine: props.engine ?? EngineType.CODEPIPELINE,
    ci: normalizeCi(props.ci),
    codeArtifact: props.codeArtifact,
  };
}

/**
 * The Level-1 entry point a user writes in `cicd.config.ts`:
 *
 * ```ts
 * export default defineCICD({
 *   application: 'my-app',
 *   repository: Repository.github('org/my-app'),
 *   stages: [{ name: 'dev', env: { account: '...', region: 'us-east-1' } }, 'prod'],
 * });
 * ```
 */
export function defineCICD(props: CicdConfigProps): ResolvedCicdConfig {
  return resolveCicdConfig(props);
}
