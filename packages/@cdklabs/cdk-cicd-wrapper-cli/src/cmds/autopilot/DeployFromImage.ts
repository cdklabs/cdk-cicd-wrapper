// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// `cdk-cicd deploy --from-image` -- the deploy side of the container two-repo split (m6-container,
// Repo 2). A `deploy.config.ts` pins one config-agnostic deployer image and lists the targets to run
// it against; this runs that image once per (target x region), each run deploying exactly one stage to
// one region. The image holds the CDK app + its vendored deps, so the synth+deploy happens inside the
// container against the target's injected env -- no CDK code, npm install or registry access here.
//
// The image is authoritative for WHAT to deploy (the app and its stages); the deploy.config target is
// authoritative for WHERE (account + region + forced role). That is why each run pins a single region
// via `deploy --region`: the target's env overrides whatever region set the image's own cicd.config
// carries, so this repo -- not the image -- decides the deployment topology.

import { spawn as spawnProcess } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import type { ResolvedDeploymentConfig, ResolvedDeploymentTarget } from '@cdklabs/cdk-cicd-wrapper';
import {
  CFN_EXEC_ROLE_FLAG,
  COMPLIANCE_LOG_BUCKET_ACCOUNT_FLAG,
  COMPLIANCE_LOG_BUCKET_NAME_FLAG,
  COMPLIANCE_LOG_BUCKET_REGION_FLAG,
  DEPLOY_ROLE_EXTERNAL_ID_FLAG,
  DEPLOY_ROLE_FLAG,
  resolveExternalId,
} from './ExecCommand';
import { logger } from '../../utils/Logging';

const AWS_ACCOUNT_ID = /^\d{12}$/;
const AWS_REGION = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+-\d+$/;
const S3_BUCKET_NAME = /^(?!\d{1,3}(?:\.\d{1,3}){3}$)(?!.*\.\.)[a-z0-9](?:[a-z0-9.-]{1,61}[a-z0-9])$/;

/** Reads the deployed `version` (hash or semver) for a stage from `config/<stage>.json`. Injectable for tests. */
export type VersionReader = (cwd: string, stage: string) => string | undefined;
export const readVersionFromConfig: VersionReader = (cwd, stage) => {
  const file = path.join(cwd, 'config', `${stage}.json`);
  if (!existsSync(file)) return undefined;

  let document: unknown;
  try {
    document = JSON.parse(readFileSync(file, 'utf-8'));
  } catch (error) {
    throw new Error(
      `cdk-cicd deploy --from-image: ${file} exists but could not be read as JSON ` +
        `(${error instanceof Error ? error.message : String(error)})`,
    );
  }

  const version =
    document !== null && typeof document === 'object' && !Array.isArray(document)
      ? (document as { version?: unknown }).version
      : undefined;
  if (typeof version !== 'string' || version.length === 0 || version.trim() !== version) {
    throw new Error(
      `cdk-cicd deploy --from-image: ${file} must contain a non-empty string 'version' with no surrounding whitespace`,
    );
  }
  return version;
};

/**
 * The full deployer image to run for a target. A target-level digest is the strongest possible pin and
 * remains authoritative even when `config/<stage>.json` contains a version. Otherwise the base repo
 * comes from the target's `image` (override) or the config-level `image`; the VERSION (tag) comes from
 * the stage version file, so bumping that file and committing redeploys just that stage. If a version is
 * present it replaces any tag on the base (`repo[:oldtag]` -> `repo:<version>`). A config-level digest
 * still conflicts with a separate per-stage version because neither source is target-specific enough to
 * choose silently. Returns undefined when there is no base image at all.
 */
export function resolveTargetImage(
  target: ResolvedDeploymentTarget,
  config: ResolvedDeploymentConfig,
  cwd: string,
  readVersion: VersionReader = readVersionFromConfig,
): string | undefined {
  // Validate existing stage metadata before applying image precedence. A target-level digest remains
  // authoritative, but it must not let a malformed config/<stage>.json bypass fail-closed validation.
  const version = readVersion(cwd, target.stage);
  if (target.image?.includes('@')) {
    return target.image;
  }
  const base = target.image ?? config.image;
  if (base === undefined) return undefined;
  if (version === undefined) return base;
  if (base.includes('@')) {
    throw new Error(
      `cdk-cicd deploy --from-image: image '${base}' is pinned by digest and cannot be combined with ` +
        `config/${target.stage}.json version '${version}'; remove the separate version or use a tag-based image`,
    );
  }

  // Replace a tag only when its colon occurs after the final slash; this preserves registry ports.
  const lastSlash = base.lastIndexOf('/');
  const lastColon = base.lastIndexOf(':');
  const repository = lastColon > lastSlash ? base.slice(0, lastColon) : base;
  return `${repository}:${version}`;
}

/** One concrete (target x region) run: the stage/account/region/role the container deploys. */
export interface DockerTarget {
  readonly stage: string;
  /** Undefined for an environment-agnostic target (deploy against the container's ambient region). */
  readonly region?: string;
  readonly account?: string;
  /** Forced deploy role for this target, passed through to the inner synth via environment. */
  readonly deployRole?: string;
  /** Forced CloudFormation execution role for this target, passed through to the inner synth. */
  readonly cfnExecutionRole?: string;
  /** Resolved ExternalId for the forced deploy role. Never a `resolve:secretsmanager:` reference. */
  readonly externalId?: string;
  /** Existing same-account/same-Region compliance destination for application S3 access logs. */
  readonly complianceLogBucketName?: string;
  readonly complianceLogBucketAccount?: string;
  readonly complianceLogBucketRegion?: string;
}

interface ComplianceLoggingCoordinates {
  readonly bucketName: string;
  readonly account: string;
  readonly region: string;
}

function complianceLoggingForTarget(
  config: ResolvedDeploymentConfig,
  target: ResolvedDeploymentTarget,
): ComplianceLoggingCoordinates | undefined {
  const bucketName = target.complianceLogBucketName ?? config.complianceLogBucketName;
  const account = target.complianceLogBucketAccount;
  const region = target.complianceLogBucketRegion;
  const values = [bucketName, account, region];
  if (values.every((value) => value === undefined)) return undefined;
  if (
    values.some((value) => value === undefined || value.trim().length === 0) ||
    !S3_BUCKET_NAME.test(bucketName!) ||
    !AWS_ACCOUNT_ID.test(account!) ||
    !AWS_REGION.test(region!)
  ) {
    throw new Error(
      `cdk-cicd deploy --from-image: target '${target.stage}' has incomplete or invalid compliance ` +
        'logging coordinates; bucket name, 12-digit account, and AWS Region must be resolved together.',
    );
  }
  if (target.env.account !== account || target.env.regions.length !== 1 || target.env.regions[0] !== region) {
    throw new Error(
      `cdk-cicd deploy --from-image: target '${target.stage}' is ${target.env.account ?? 'account-agnostic'}/` +
        `${target.env.regions.length === 1 ? target.env.regions[0] : 'multi-or-region-agnostic'}, but compliance ` +
        `bucket '${bucketName}' is resolved for ${account}/${region}. S3 server access logs require the source ` +
        'and destination buckets to be in the same account and Region.',
    );
  }
  return { bucketName: bucketName!, account: account!, region: region! };
}

/**
 * The `docker run` argv that deploys one target/region from the pinned image.
 *
 * AWS credentials ride the standard `AWS_*` env var NAMES with no value (`-e AWS_ACCESS_KEY_ID`), so
 * `docker run` inherits them from this process's environment rather than us embedding secrets in argv
 * (which would leak them into the process table and any command log). The stage/account/region pins,
 * by contrast, are literal `-e NAME=value` -- they are not secret and must be fixed for the run. Inside
 * the container the entrypoint is `cdk-cicd deploy` for the single stage, pinned to the one region.
 */
export function dockerRunArgs(image: string, target: DockerTarget, options: { network?: string } = {}): string[] {
  const env: string[] = [];
  const setEnv = (name: string, value: string) => env.push('-e', `${name}=${value}`);
  const passEnv = (name: string) => env.push('-e', name); // inherit the host value by name

  setEnv('CDK_STAGE', target.stage);
  // Presence is authoritative even when empty: an environment-agnostic Repo 2 target must clear any
  // account baked into the image and let the inner CDK CLI resolve the caller's ambient credentials.
  setEnv('CDK_CICD_ACCOUNT_OVERRIDE', target.account ?? '');
  if (target.account !== undefined) {
    setEnv('CDK_DEFAULT_ACCOUNT', target.account);
    setEnv('CDK_DEPLOY_ACCOUNT', target.account);
  } else {
    passEnv('CDK_DEFAULT_ACCOUNT');
    passEnv('CDK_DEPLOY_ACCOUNT');
  }
  // The same presence contract applies to region. For an agnostic target, inherit every standard
  // ambient region variable by name; the inner synth then bypasses image config and selects that region.
  setEnv('CDK_CICD_REGION_OVERRIDE', target.region ?? '');
  if (target.region !== undefined) {
    setEnv('CDK_DEFAULT_REGION', target.region);
    setEnv('CDK_DEPLOY_REGION', target.region);
    // The CDK CLI re-derives its region from AWS_REGION/profile before running the app; pin both.
    setEnv('AWS_REGION', target.region);
    setEnv('AWS_DEFAULT_REGION', target.region);
  } else {
    passEnv('CDK_DEFAULT_REGION');
    passEnv('CDK_DEPLOY_REGION');
    passEnv('AWS_REGION');
    passEnv('AWS_DEFAULT_REGION');
  }
  // Repo 2 owns the role contract. Always set or clear these flags so an image-baked cicd.config cannot
  // override the deployment target. ExternalId is inherited by name from the docker client process rather
  // than embedded in argv, keeping the resolved value out of command logs and the process argument list.
  setEnv(DEPLOY_ROLE_FLAG, target.deployRole ?? '');
  setEnv(CFN_EXEC_ROLE_FLAG, target.cfnExecutionRole ?? '');
  if (target.externalId !== undefined) {
    passEnv(DEPLOY_ROLE_EXTERNAL_ID_FLAG);
  } else {
    setEnv(DEPLOY_ROLE_EXTERNAL_ID_FLAG, '');
  }
  const complianceValues = [
    target.complianceLogBucketName,
    target.complianceLogBucketAccount,
    target.complianceLogBucketRegion,
  ];
  if (
    complianceValues.some((value) => value !== undefined) &&
    complianceValues.some((value) => value === undefined || value.trim().length === 0)
  ) {
    throw new Error(
      `cdk-cicd deploy --from-image: target '${target.stage}' must provide compliance bucket name, ` +
        'account, and Region together.',
    );
  }
  if (target.complianceLogBucketName !== undefined) {
    if (
      !S3_BUCKET_NAME.test(target.complianceLogBucketName) ||
      !AWS_ACCOUNT_ID.test(target.complianceLogBucketAccount!) ||
      !AWS_REGION.test(target.complianceLogBucketRegion!)
    ) {
      throw new Error(
        `cdk-cicd deploy --from-image: target '${target.stage}' has invalid compliance bucket, ` +
          'account, or Region coordinates.',
      );
    }
    if (target.account !== target.complianceLogBucketAccount || target.region !== target.complianceLogBucketRegion) {
      throw new Error(
        `cdk-cicd deploy --from-image: target '${target.stage}' compliance destination must match the ` +
          'deployment account and Region.',
      );
    }
    setEnv(COMPLIANCE_LOG_BUCKET_NAME_FLAG, target.complianceLogBucketName);
    setEnv(COMPLIANCE_LOG_BUCKET_ACCOUNT_FLAG, target.complianceLogBucketAccount!);
    setEnv(COMPLIANCE_LOG_BUCKET_REGION_FLAG, target.complianceLogBucketRegion!);
  } else {
    // Presence is authoritative here too: clear any image-baked values so Repo 2 config decides whether
    // runtime injection applies the compliance aspect.
    setEnv(COMPLIANCE_LOG_BUCKET_NAME_FLAG, '');
    setEnv(COMPLIANCE_LOG_BUCKET_ACCOUNT_FLAG, '');
    setEnv(COMPLIANCE_LOG_BUCKET_REGION_FLAG, '');
  }
  // Creds inherited from the caller (who assumed the target account, for cross-account deploys).
  ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'].forEach(passEnv);

  const inner = ['cdk-cicd', 'deploy', '--stage', target.stage, '--yes'];
  if (target.region !== undefined) {
    inner.push('--region', target.region);
  }

  // `--network` lets the caller pick the container's network mode. The default docker bridge is right for
  // most runners; `host` (or a named network) is what a constrained/air-gapped runner needs so the deploy
  // can reach the AWS endpoints from inside the container.
  const net = options.network !== undefined ? ['--network', options.network] : [];
  return ['run', '--rm', ...net, ...env, image, ...inner];
}

/** The (target x region) runs for one target: one per region, or a single region-agnostic run. */
export function targetRuns(
  target: ResolvedDeploymentTarget,
  resolvedExternalId?: string,
  complianceLogging?: ComplianceLoggingCoordinates,
): DockerTarget[] {
  if (
    complianceLogging !== undefined &&
    (target.env.account !== complianceLogging.account ||
      target.env.regions.length !== 1 ||
      target.env.regions[0] !== complianceLogging.region)
  ) {
    throw new Error(
      `cdk-cicd deploy --from-image: target '${target.stage}' compliance destination must match its ` +
        'concrete account and single Region.',
    );
  }
  const base = {
    stage: target.stage,
    account: target.env.account,
    deployRole: target.deployment?.deployRole,
    cfnExecutionRole: target.deployment?.cfnExecutionRole,
    externalId: resolvedExternalId,
    complianceLogBucketName: complianceLogging?.bucketName,
    complianceLogBucketAccount: complianceLogging?.account,
    complianceLogBucketRegion: complianceLogging?.region,
  };
  if (target.env.regions.length === 0) {
    return [base];
  }
  return target.env.regions.map((region) => ({ ...base, region }));
}

/** Minimal result contract shared by sequential and parallel regional invocations. */
export interface RegionalInvocationResult {
  readonly code: number;
}

/**
 * Invoke one operation per region. Parallel mode launches every operation immediately but preserves
 * input ordering in the returned results; sequential mode awaits each operation and stops on failure.
 */
export async function runRegionalInvocations<T, R extends RegionalInvocationResult>(
  items: readonly T[],
  regionOrder: string,
  invoke: (item: T, index: number) => R | Promise<R>,
): Promise<R[]> {
  if (regionOrder === 'parallel' && items.length > 1) {
    return Promise.all(items.map((item, index) => invoke(item, index)));
  }

  const results: R[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const result = await invoke(items[index], index);
    results.push(result);
    if (result.code !== 0) {
      break;
    }
  }
  return results;
}

/** Result from one docker process. */
export interface DockerSpawnResult {
  readonly status: number | null;
  readonly error?: Error;
}

/** Per-process environment used to pass a resolved ExternalId to `docker run -e NAME` by name. */
export interface DockerSpawnOptions {
  readonly env?: NodeJS.ProcessEnv;
}

/** Spawner seam so tests can assert the docker argv without a docker daemon. */
export type DockerSpawn = (
  args: string[],
  options?: DockerSpawnOptions,
) => DockerSpawnResult | Promise<DockerSpawnResult>;
const spawnDocker: DockerSpawn = (args, options) =>
  new Promise((resolve) => {
    try {
      const child = spawnProcess('docker', args, { stdio: 'inherit', env: options?.env });
      child.once('error', (error) => resolve({ status: null, error }));
      child.once('close', (status) => resolve({ status }));
    } catch (error) {
      resolve({ status: null, error: error instanceof Error ? error : new Error(String(error)) });
    }
  });

/**
 * Run the pinned image against every target/region in the deployment config. A gated target (manual
 * approval) is refused unless `yes` is set -- the same fail-closed contract as `deploy --stage`, since
 * the direct CLI has no approval action to wait on. Targets remain ordered; a parallel target waits for
 * all of its launched regions, then propagates the first failure in configured region order.
 */
export async function runFromImage(
  config: ResolvedDeploymentConfig,
  options: {
    yes: boolean;
    network?: string;
    target?: string;
    cwd?: string;
    readVersion?: VersionReader;
    spawn?: DockerSpawn;
    resolveExternalId?: (value?: string) => Promise<string | undefined>;
  },
): Promise<number> {
  const spawn = options.spawn ?? spawnDocker;
  const resolveTargetExternalId = options.resolveExternalId ?? resolveExternalId;
  const cwd = options.cwd ?? process.cwd();

  // `target` deploys just that one stage (its own image version) -- how a CD pipeline runs one action per
  // target, so bumping a stage's image in deploy.config and committing deploys only that stage.
  const targets =
    options.target !== undefined ? config.targets.filter((t) => t.stage === options.target) : config.targets;
  if (options.target !== undefined && targets.length === 0) {
    logger.error(`cdk-cicd deploy --from-image: no target '${options.target}' in deploy.config`);
    return 1;
  }

  const bucketCoordinates = new Map<string, string>();
  for (const target of targets) {
    if (target.manualApproval && !options.yes) {
      logger.error(
        `cdk-cicd deploy --from-image: target '${target.stage}' requires manual approval -- re-run with --yes`,
      );
      return 1;
    }

    let complianceLogging: ComplianceLoggingCoordinates | undefined;
    try {
      complianceLogging = complianceLoggingForTarget(config, target);
      if (complianceLogging !== undefined) {
        const coordinates = `${complianceLogging.account}/${complianceLogging.region}`;
        const previous = bucketCoordinates.get(complianceLogging.bucketName);
        if (previous !== undefined && previous !== coordinates) {
          throw new Error(
            `cdk-cicd deploy --from-image: compliance bucket '${complianceLogging.bucketName}' is ` +
              `assigned to both ${previous} and ${coordinates}.`,
          );
        }
        bucketCoordinates.set(complianceLogging.bucketName, coordinates);
      }
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      return 1;
    }

    // Each target runs its OWN version: base repo (target/config image) + the `version` from
    // config/<stage>.json in this (CD) repo. Bump that file, commit, and only this stage redeploys.
    let image: string | undefined;
    try {
      image = resolveTargetImage(target, config, cwd, options.readVersion);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      return 1;
    }
    if (image === undefined) {
      logger.error(
        `cdk-cicd deploy --from-image: target '${target.stage}' has no image -- set the config-level (or target) image, plus a version in config/${target.stage}.json`,
      );
      return 1;
    }

    let externalId: string | undefined;
    if ((target.deployment?.deployRole ?? '').trim().length > 0) {
      try {
        externalId = await resolveTargetExternalId(target.deployment?.externalId);
      } catch (error) {
        logger.error(
          `cdk-cicd deploy --from-image: could not resolve the deploy-role ExternalId for target ` +
            `'${target.stage}': ${error instanceof Error ? error.message : String(error)}`,
        );
        return 1;
      }
    }

    const runs = targetRuns(target, externalId, complianceLogging);
    const results = await runRegionalInvocations(runs, target.env.regionOrder, async (run) => {
      logger.info(`cdk-cicd deploy --from-image: ${run.stage} -> ${run.region ?? 'ambient region'} (${image})`);
      try {
        const result = await spawn(dockerRunArgs(image, run, { network: options.network }), {
          env:
            run.externalId === undefined
              ? process.env
              : { ...process.env, [DEPLOY_ROLE_EXTERNAL_ID_FLAG]: run.externalId },
        });
        return {
          code: result.error !== undefined ? 1 : (result.status ?? 1),
          error: result.error,
        };
      } catch (error) {
        return {
          code: 1,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    });

    let firstFailure: number | undefined;
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      if (result.code === 0) {
        continue;
      }
      const run = runs[index];
      if (result.error !== undefined) {
        logger.error(`cdk-cicd deploy --from-image: could not run docker for ${run.stage}: ${result.error.message}`);
      } else {
        logger.error(`cdk-cicd deploy --from-image: ${run.stage} -> ${run.region ?? 'ambient region'} failed`);
      }
      if (firstFailure === undefined) {
        firstFailure = result.code;
      }
    }
    if (firstFailure !== undefined) {
      return firstFailure;
    }
  }
  return 0;
}
