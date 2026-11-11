// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Change detection for the Repo 2 CD pipeline. A target's fingerprint is a SHA-256 over everything that
// decides what deploying it would produce: its deploy.config entry, its image reference and `version`,
// the image's immutable ECR digest, the rest of its `config/<stage>.json`, the Region of a parallel
// action, and the deploy repository's package manifest/lockfile. After a successful deploy the pipeline
// stores the fingerprint in a per-target SSM parameter; an equal fingerprint later means "nothing to do".
//
// The pipeline-shape fingerprint is different: it covers the deploy.config fields the synthesized
// pipeline was built from (targets, roles, registries). A mismatch means the pipeline itself is stale and
// `cdk-cicd deploy-ci` has to be re-run; it is computed by the same wrapper function the synth uses.

import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import type {
  DeploymentTargetEnvironment,
  ResolvedDeploymentConfig,
  ResolvedDeploymentTarget,
} from '@cdklabs/cdk-cicd-wrapper';
import { deploymentPipelineShapeFingerprint, parseEcrRepository } from '@cdklabs/cdk-cicd-wrapper';
import { resolveLatestEcrImage, resolveTargetImage, VERSION_KEY } from './DeployFromImage';

/** What the CD pipeline's CodeBuild projects provide to check the checked-out deploy.config. */
export interface PipelineContext {
  /** Shape fingerprint the pipeline was synthesized with (`EXPECTED_DEPLOYMENT_TOPOLOGY`). */
  readonly expectedTopology: string;
  /** Each target's concrete account/Regions as the pipeline resolved them (`CDK_CICD_TARGET_ENVIRONMENTS`). */
  readonly targetEnvironments: { [stage: string]: DeploymentTargetEnvironment };
  /** Bootstrap qualifier the pipeline resolved (`CDK_CICD_QUALIFIER`). */
  readonly qualifier: string;
  /** The pipeline's partition (`CDK_CICD_PARTITION`). */
  readonly partition: string;
}

/** Read the pipeline context from the CodeBuild project environment; fails when any part is missing. */
export function readPipelineContext(env: NodeJS.ProcessEnv): PipelineContext {
  const missing = [
    'EXPECTED_DEPLOYMENT_TOPOLOGY',
    'CDK_CICD_TARGET_ENVIRONMENTS',
    'CDK_CICD_QUALIFIER',
    'CDK_CICD_PARTITION',
  ].filter((name) => (env[name] ?? '').length === 0);
  if (missing.length > 0) {
    throw new Error(
      `cdk-cicd pipeline: ${missing.join(', ')} not set -- this command runs inside the CD pipeline's ` +
        'CodeBuild projects, which `cdk-cicd deploy-ci` configures',
    );
  }
  let targetEnvironments: unknown;
  try {
    targetEnvironments = JSON.parse(env.CDK_CICD_TARGET_ENVIRONMENTS!);
  } catch (error) {
    throw new Error(`cdk-cicd pipeline: CDK_CICD_TARGET_ENVIRONMENTS is not JSON (${(error as Error).message})`);
  }
  if (targetEnvironments === null || typeof targetEnvironments !== 'object' || Array.isArray(targetEnvironments)) {
    throw new Error('cdk-cicd pipeline: CDK_CICD_TARGET_ENVIRONMENTS must be a JSON object');
  }
  return {
    expectedTopology: env.EXPECTED_DEPLOYMENT_TOPOLOGY!,
    targetEnvironments: targetEnvironments as PipelineContext['targetEnvironments'],
    qualifier: env.CDK_CICD_QUALIFIER!,
    partition: env.CDK_CICD_PARTITION!,
  };
}

/**
 * Fail when deploy.config changed a field the pipeline was built from. A target the config declares
 * without a concrete account or Region resolves to what the pipeline resolved it to at synth time.
 */
export function assertPipelineShape(config: ResolvedDeploymentConfig, context: PipelineContext): void {
  const environments: { [stage: string]: DeploymentTargetEnvironment } = {};
  for (const target of config.targets) {
    const expected = context.targetEnvironments[target.stage];
    const account = target.env.account ?? expected?.account;
    const regions = target.env.regions.length > 0 ? target.env.regions : expected?.regions;
    if (account !== undefined && regions !== undefined) environments[target.stage] = { account, regions };
  }
  const current = deploymentPipelineShapeFingerprint(
    config,
    environments,
    context.partition,
    config.qualifier ?? context.qualifier,
  );
  if (current !== context.expectedTopology) {
    throw new Error(
      'cdk-cicd: deploy.config changed fields that shape the CD pipeline; ' +
        're-run cdk-cicd deploy-ci to update its actions and permissions',
    );
  }
}

/** Resolves a tag of an ECR repository to its `sha256:` digest. Injectable for tests. */
export type EcrDigestResolver = (
  repository: { account: string; region: string; repositoryName: string },
  tag: string,
) => string;

export const describeEcrDigest: EcrDigestResolver = (repository, tag) => {
  const result = spawnSync(
    'aws',
    [
      'ecr',
      'describe-images',
      '--registry-id',
      repository.account,
      '--repository-name',
      repository.repositoryName,
      '--image-ids',
      `imageTag=${tag}`,
      '--query',
      'imageDetails[0].imageDigest',
      '--output',
      'text',
      '--region',
      repository.region,
      '--no-cli-pager',
    ],
    { encoding: 'utf-8', timeout: 60_000 },
  );
  if (result.error !== undefined || result.status !== 0) {
    const detail = result.error?.message ?? String(result.stderr ?? '').trim();
    throw new Error(`could not resolve ${repository.repositoryName}:${tag} to a digest: ${detail}`);
  }
  return String(result.stdout ?? '').trim();
};

/** Seams for the AWS lookups a fingerprint needs. */
export interface FingerprintDependencies {
  readonly resolveDigest?: EcrDigestResolver;
  readonly resolveLatestImage?: (baseImage: string) => string;
}

const TOOLING_FILES = ['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml'];
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/;

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

/** The `version` and the hash of the remaining keys of `config/<stage>.json`, validated like the deploy. */
function readStageFile(cwd: string, stage: string): { version: string | null; stageConfig: string | null } {
  const file = path.resolve(cwd, 'config', `${stage}.json`);
  if (!existsSync(file)) return { version: null, stageConfig: null };
  let document: unknown;
  try {
    document = JSON.parse(readFileSync(file, 'utf-8'));
  } catch (error) {
    throw new Error(
      `cdk-cicd deploy --from-image: ${file} exists but could not be read as JSON (${(error as Error).message})`,
    );
  }
  const isObject = document !== null && typeof document === 'object' && !Array.isArray(document);
  const version = isObject ? (document as { [key: string]: unknown })[VERSION_KEY] : undefined;
  if (typeof version !== 'string' || version.length === 0 || version.trim() !== version) {
    throw new Error(
      `cdk-cicd deploy --from-image: ${file} must contain a non-empty string version field with no surrounding whitespace`,
    );
  }
  // Keys besides `version` make the file the target's injected stage configuration, so a change to any
  // of them must redeploy the target with the same image. A version-only file contributes nothing extra,
  // which keeps the fingerprint of existing version-only targets unchanged.
  const { [VERSION_KEY]: _version, ...rest } = document as { [key: string]: unknown };
  return { version, stageConfig: Object.keys(rest).length > 0 ? sha256(JSON.stringify(rest)) : null };
}

/** The image's registry identity plus its immutable digest, or null for a non-ECR image. */
function immutableEcrImage(image: string | undefined, resolveDigest: EcrDigestResolver) {
  if (image === undefined) return null;
  const parsed = parseEcrRepository(image);
  if (parsed === undefined) return null;
  let imageDigest: string;
  if (image.includes('@')) {
    imageDigest = parsed.tagOrDigest ?? '';
  } else {
    try {
      imageDigest = resolveDigest(parsed, parsed.tagOrDigest ?? 'latest');
    } catch (error) {
      throw new Error(`cdk-cicd: could not resolve immutable ECR digest for ${image}: ${(error as Error).message}`);
    }
  }
  if (!SHA256_DIGEST.test(imageDigest)) {
    throw new Error(`cdk-cicd: ECR returned an invalid image digest for ${image}: ${imageDigest}`);
  }
  return {
    registryHost: parsed.registryHost,
    account: parsed.account,
    region: parsed.region,
    repositoryName: parsed.repositoryName,
    imageDigest,
  };
}

/**
 * The fingerprint of one deployment unit: a target, or one Region of a parallel multi-region target.
 * An `autoDeploy` target always runs the newest tagged image in its repository -- the rule the deploy
 * itself applies -- so a new push changes this fingerprint and a config-repo run never rolls it back.
 */
export function targetFingerprint(
  config: ResolvedDeploymentConfig,
  target: ResolvedDeploymentTarget,
  region: string | undefined,
  cwd: string,
  dependencies: FingerprintDependencies = {},
): string {
  const { version, stageConfig } = readStageFile(cwd, target.stage);
  const resolvedImage = resolveTargetImage(target, config, cwd, () => version ?? undefined);
  const effectiveImage =
    target.autoDeploy === true && resolvedImage !== undefined
      ? (dependencies.resolveLatestImage ?? resolveLatestEcrImage)(resolvedImage)
      : resolvedImage;
  const ecrImage = immutableEcrImage(effectiveImage, dependencies.resolveDigest ?? describeEcrDigest);
  const tooling = Object.fromEntries(
    TOOLING_FILES.filter((name) => existsSync(path.resolve(cwd, name))).map((name) => [
      name,
      sha256(readFileSync(path.resolve(cwd, name))),
    ]),
  );
  const input = {
    schema: 'container-deployment-target-v3',
    target,
    image: target.image ?? config.image ?? null,
    version,
    ...(stageConfig === null ? {} : { stageConfig }),
    ...(ecrImage === null ? {} : { immutableEcrImage: ecrImage }),
    region: region ?? null,
    tooling,
  };
  return sha256(JSON.stringify(input));
}

/** The target a pipeline action names, after checking the action still matches the target's topology. */
export function pipelineTarget(
  config: ResolvedDeploymentConfig,
  stage: string,
  region: string | undefined,
): ResolvedDeploymentTarget {
  const target = config.targets.find((candidate) => candidate.stage === stage);
  if (target === undefined) throw new Error(`cdk-cicd: no deployment target named ${stage}`);
  if (region === undefined && target.env.regionOrder === 'parallel' && target.env.regions.length > 1) {
    throw new Error(
      `cdk-cicd: target ${stage} now needs parallel region actions; ` +
        're-run cdk-cicd deploy-ci to update the pipeline topology',
    );
  }
  return target;
}

/** Reads the fingerprint stored for a unit: '' when it was never deployed. Injectable for tests. */
export type StateReader = (parameterName: string) => string;

export const readStateParameter: StateReader = (parameterName) => {
  const result = spawnSync(
    'aws',
    [
      'ssm',
      'get-parameter',
      '--name',
      parameterName,
      '--query',
      'Parameter.Value',
      '--output',
      'text',
      '--no-cli-pager',
    ],
    { encoding: 'utf-8', timeout: 60_000 },
  );
  if (result.error === undefined && result.status === 0) return String(result.stdout ?? '').trim();
  const stderr = String(result.stderr ?? '');
  if (stderr.includes('ParameterNotFound')) return '';
  throw new Error(`could not read ${parameterName}: ${result.error?.message ?? stderr.trim()}`);
};

/** One deployment stage of the CD pipeline, as the synth hands it to Plan (`CDK_CICD_PLAN`). */
export interface StagePlan {
  /** Exported variable that the stage's entry condition checks. */
  readonly variable: string;
  /** CodePipeline stage name, for the log. */
  readonly stage: string;
  readonly units: ReadonlyArray<{ readonly target: string; readonly region?: string; readonly parameter: string }>;
}

/** What Plan decided for one deployment stage. */
export interface StageDecision {
  readonly variable: string;
  readonly stage: string;
  readonly run: boolean;
  /** One line per unit: why it is changed or unchanged. */
  readonly reasons: string[];
}

const PLAN_VARIABLE = /^CDK_CICD_RUN_[0-9]+$/;

/** Parse and validate `CDK_CICD_PLAN`. */
export function parseStagePlans(value: string | undefined): StagePlan[] {
  if (value === undefined || value.length === 0) {
    throw new Error('cdk-cicd pipeline plan: CDK_CICD_PLAN is not set');
  }
  const plans = JSON.parse(value) as StagePlan[];
  if (!Array.isArray(plans)) throw new Error('cdk-cicd pipeline plan: CDK_CICD_PLAN must be a JSON array');
  for (const plan of plans) {
    if (typeof plan.variable !== 'string' || !PLAN_VARIABLE.test(plan.variable) || !Array.isArray(plan.units)) {
      throw new Error(`cdk-cicd pipeline plan: invalid stage entry ${JSON.stringify(plan)}`);
    }
  }
  return plans;
}

/**
 * Decide, per deployment stage, whether it has anything to deploy. A unit that cannot be fingerprinted
 * (malformed `config/<stage>.json`, ECR or SSM unavailable) counts as changed: the stage then runs and its
 * deploy action reports the real error, instead of Plan hiding it or failing every other stage.
 */
export function planStages(
  config: ResolvedDeploymentConfig,
  plans: readonly StagePlan[],
  cwd: string,
  readState: StateReader = readStateParameter,
  dependencies: FingerprintDependencies = {},
): StageDecision[] {
  return plans.map((plan) => {
    const reasons: string[] = [];
    let run = false;
    for (const unit of plan.units) {
      const label = unit.region === undefined ? unit.target : `${unit.target} (${unit.region})`;
      try {
        const target = pipelineTarget(config, unit.target, unit.region);
        const current = targetFingerprint(config, target, unit.region, cwd, dependencies);
        const previous = readState(unit.parameter);
        if (previous === current) {
          reasons.push(`${label}: unchanged`);
        } else {
          run = true;
          reasons.push(`${label}: ${previous === '' ? 'never deployed' : 'changed'}`);
        }
      } catch (error) {
        run = true;
        reasons.push(`${label}: could not be checked (${(error as Error).message}); running it`);
      }
    }
    return { variable: plan.variable, stage: plan.stage, run, reasons };
  });
}

/** The `NAME=true|false` lines the Plan build sources and exports. */
export function planOutput(decisions: readonly StageDecision[]): string {
  return decisions.map((decision) => `${decision.variable}=${decision.run ? 'true' : 'false'}\n`).join('');
}
