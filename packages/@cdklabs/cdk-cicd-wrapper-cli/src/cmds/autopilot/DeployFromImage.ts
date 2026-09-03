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
import { CFN_EXEC_ROLE_FLAG, DEPLOY_ROLE_EXTERNAL_ID_FLAG, DEPLOY_ROLE_FLAG, resolveExternalId } from './ExecCommand';
import { logger } from '../../utils/Logging';

/** Reads the deployed `version` (hash or semver) for a stage from `config/<stage>.json`. Injectable for tests. */
export type VersionReader = (cwd: string, stage: string) => string | undefined;
const readVersionFromConfig: VersionReader = (cwd, stage) => {
  const file = path.join(cwd, 'config', `${stage}.json`);
  if (!existsSync(file)) return undefined;
  try {
    const value = JSON.parse(readFileSync(file, 'utf-8')).version;
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The full deployer image to run for a target. The base repo comes from the target's `image` (override) or
 * the config-level `image`; the VERSION (tag) comes from the CD repo's `config/<stage>.json` `version`
 * field (a hash or semver) -- so bumping a stage's version file and committing redeploys just that stage.
 * If a version is present it replaces any tag on the base (`repo[:oldtag]` -> `repo:<version>`); with no
 * version file the base is used as-is. A digest-pinned base is preserved as-is, but cannot be combined
 * with a separate version because that would discard its immutable identity. Returns undefined when
 * there is no base image at all.
 */
export function resolveTargetImage(
  target: ResolvedDeploymentTarget,
  config: ResolvedDeploymentConfig,
  cwd: string,
  readVersion: VersionReader = readVersionFromConfig,
): string | undefined {
  const base = target.image ?? config.image;
  if (base === undefined) return undefined;
  const version = readVersion(cwd, target.stage);
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
  /** Forced deploy role for this target, passed through to the inner synth and deploy. */
  readonly deployRole?: string;
  /** Forced CloudFormation execution role for this target, passed through to the inner synth. */
  readonly cfnExecutionRole?: string;
  /** Resolved ExternalId for the forced deploy role. Never a `resolve:secretsmanager:` reference. */
  readonly externalId?: string;
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
  // Creds inherited from the caller (who assumed the target account, for cross-account deploys).
  ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'].forEach(passEnv);

  const inner = ['cdk-cicd', 'deploy', '--stage', target.stage, '--yes'];
  if (target.region !== undefined) {
    inner.push('--region', target.region);
  }
  if (target.deployRole !== undefined) {
    inner.push('--deploy-role', target.deployRole);
  }

  // `--network` lets the caller pick the container's network mode. The default docker bridge is right for
  // most runners; `host` (or a named network) is what a constrained/air-gapped runner needs so the deploy
  // can reach the AWS endpoints from inside the container.
  const net = options.network !== undefined ? ['--network', options.network] : [];
  return ['run', '--rm', ...net, ...env, image, ...inner];
}

/** The (target x region) runs for one target: one per region, or a single region-agnostic run. */
export function targetRuns(target: ResolvedDeploymentTarget, resolvedExternalId?: string): DockerTarget[] {
  const base = {
    stage: target.stage,
    account: target.env.account,
    deployRole: target.deployment?.deployRole,
    cfnExecutionRole: target.deployment?.cfnExecutionRole,
    externalId: resolvedExternalId,
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

  for (const target of targets) {
    if (target.manualApproval && !options.yes) {
      logger.error(
        `cdk-cicd deploy --from-image: target '${target.stage}' requires manual approval -- re-run with --yes`,
      );
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

    const runs = targetRuns(target, externalId);
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
