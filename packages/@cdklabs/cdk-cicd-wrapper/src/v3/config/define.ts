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

import { BuildImage } from './build-image';
import { Repository } from './repository';
import {
  CiConfig,
  CodeArtifactConfig,
  DeployModel,
  DeploymentConfig,
  EngineType,
  RegionOrder,
  ResolvedCicdConfig,
  ResolvedDeploymentConfig,
  ResolvedDeploymentTarget,
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
  /** How the deployed assembly is produced. Defaults to `DeployModel.ASSEMBLY_PROMOTION`. */
  readonly deployModel?: DeployModel;
  /** Let a Lambda execute and await CloudFormation instead of paying build compute to wait. Off by default. */
  readonly asyncDeploy?: boolean;
  /** Container mode (Repo 1): build & push a deployer image to ECR instead of deploying. See `BuildImage`. */
  readonly deployerImage?: BuildImage;
}

/**
 * Normalize the permissive CI input. `synthStages` has THREE meanings, so it cannot collapse to one:
 * unset -> `[]`, which the engine reads as its efficiency default (one env); `'all'` -> the full stage
 * list (the documented "synth every stage" -- resolved here, since only here are the stage names known);
 * an explicit list -> that list. Collapsing `'all'` to `[]` -- as this once did -- silently synthesized
 * only the first stage, contradicting the field's own doc.
 */
function normalizeCi(ci: CiConfigInput | undefined, stageNames: string[]): CiConfig {
  return {
    steps: ci?.steps ?? {},
    synthStages: ci?.synthStages === undefined ? [] : ci.synthStages === 'all' ? [...stageNames] : ci.synthStages,
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
  const stages = props.stages.map(normalizeStage);
  return {
    application,
    qualifier: props.qualifier ?? (application !== undefined ? deriveQualifier(application) : undefined),
    repository: props.repository,
    stages,
    synthesizer: { type: props.synthesizer?.type ?? SynthesizerType.DEFAULT },
    engine: props.engine ?? EngineType.CODEPIPELINE,
    ci: normalizeCi(
      props.ci,
      stages.map((s) => s.name),
    ),
    codeArtifact: props.codeArtifact,
    deployModel: props.deployModel ?? DeployModel.ASSEMBLY_PROMOTION,
    asyncDeploy: props.asyncDeploy ?? false,
    deployerImage: props.deployerImage,
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
export const defineCICD = resolveCicdConfig;

/** A deployment target, as written in Repo 2's `deploy.config.ts`. `env` takes one region or many. */
export interface DeploymentTargetInput {
  readonly stage: string;
  readonly env?: StageEnvInput;
  readonly manualApproval?: boolean;
  readonly deployment?: DeploymentConfig;
  /** This target's deployer image (tag/digest), overriding the top-level `image` -- the per-stage version. */
  readonly image?: string;
}

/** What a user passes to `defineDeployment` (Repo 2). Deliberately permissive; normalized to resolved structs. */
export interface DeploymentProps {
  /** Default deployer image (an ECR/OCI reference, tag or digest); optional if every target pins its own `image`. */
  readonly image?: string;
  /** The targets to run the image against, in order. */
  readonly targets: DeploymentTargetInput[];
  /**
   * The config-only source repository the CD pipeline watches (where this `deploy.config.ts` lives).
   * Omit for the local `cdk-cicd deploy --from-image` executor; set it to provision a CD CodePipeline
   * with `cdk-cicd deploy-ci` (source -> CodeBuild that runs the image against each target).
   */
  readonly repository?: Repository;
  /** Private CodeArtifact repo the CD build logs into before `npm ci` (for a pre-release wrapper CLI). */
  readonly codeArtifact?: CodeArtifactConfig;
}

function normalizeTarget(target: DeploymentTargetInput): ResolvedDeploymentTarget {
  const env: StageEnvInput = target.env ?? {};
  const regions = env.regions ?? (env.region !== undefined ? [env.region] : []);
  return {
    stage: target.stage,
    env: {
      account: env.account,
      regions,
      regionOrder: env.regionOrder ?? RegionOrder.SEQUENTIAL,
    },
    // Same gate default as stages: inner-loop targets deploy without approval, the rest require it.
    manualApproval: target.manualApproval ?? !AUTO_APPROVE_STAGES.has(target.stage),
    deployment: target.deployment,
    image: target.image,
  };
}

/**
 * The container-mode (Repo 2) entry point a user writes in `deploy.config.ts`:
 *
 * ```ts
 * export default defineDeployment({
 *   image: 'ACCT.dkr.ecr.eu-west-1.amazonaws.com/my-app-deployer:1.4.2',
 *   targets: [
 *     { stage: 'dev', env: { account: '...', region: 'eu-west-1' } },
 *     { stage: 'prod', env: { account: '...', regions: ['eu-west-1', 'us-east-1'] }, manualApproval: true },
 *   ],
 * });
 * ```
 *
 * TS-only for the same reason as `defineCICD`: jsii silently omits free functions, and this is loaded
 * in-process by the CLI (via ts-node) so it never crosses the jsii boundary. Only the resolved
 * `ResolvedDeploymentConfig` is jsii-modeled.
 */
export function defineDeployment(props: DeploymentProps): ResolvedDeploymentConfig {
  return {
    image: props.image,
    targets: props.targets.map(normalizeTarget),
    repository: props.repository,
    codeArtifact: props.codeArtifact,
  };
}
