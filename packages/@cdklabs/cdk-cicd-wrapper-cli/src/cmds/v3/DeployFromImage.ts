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

import { spawnSync, SpawnSyncReturns } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { ResolvedDeploymentConfig, ResolvedDeploymentTarget } from '@cdklabs/cdk-cicd-wrapper';
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
 * version file the base is used as-is. Returns undefined when there is no base image at all.
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
  // Strip a trailing `:tag` (a tag has no `/`) before appending the version; leaves a bare repo untouched.
  return version !== undefined ? `${base.replace(/:[^/]+$/, '')}:${version}` : base;
}

/** One concrete (target x region) run: the stage/account/region/role the container deploys. */
export interface DockerTarget {
  readonly stage: string;
  /** Undefined for an environment-agnostic target (deploy against the container's ambient region). */
  readonly region?: string;
  readonly account?: string;
  /** Forced deploy (CloudFormation service) role for this target, passed through to the inner deploy. */
  readonly deployRole?: string;
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
  if (target.account !== undefined) {
    setEnv('CDK_DEFAULT_ACCOUNT', target.account);
    setEnv('CDK_DEPLOY_ACCOUNT', target.account);
  }
  if (target.region !== undefined) {
    setEnv('CDK_DEFAULT_REGION', target.region);
    setEnv('CDK_DEPLOY_REGION', target.region);
    // The CDK CLI re-derives its region from AWS_REGION/profile before running the app; pin both.
    setEnv('AWS_REGION', target.region);
    setEnv('AWS_DEFAULT_REGION', target.region);
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
export function targetRuns(target: ResolvedDeploymentTarget): DockerTarget[] {
  const base = { stage: target.stage, account: target.env.account, deployRole: target.deployment?.deployRole };
  if (target.env.regions.length === 0) {
    return [base];
  }
  return target.env.regions.map((region) => ({ ...base, region }));
}

/** Spawner seam so tests can assert the docker argv without a docker daemon. */
export type DockerSpawn = (args: string[]) => SpawnSyncReturns<Buffer>;
const spawnDocker: DockerSpawn = (args) => spawnSync('docker', args, { stdio: 'inherit' });

/**
 * Run the pinned image against every target/region in the deployment config. A gated target (manual
 * approval) is refused unless `yes` is set -- the same fail-closed contract as `deploy --stage`, since
 * the direct CLI has no approval action to wait on. Returns a non-zero exit code on the first failure.
 */
export function runFromImage(
  config: ResolvedDeploymentConfig,
  options: { yes: boolean; network?: string; target?: string; cwd?: string; readVersion?: VersionReader; spawn?: DockerSpawn },
): number {
  const spawn = options.spawn ?? spawnDocker;
  const cwd = options.cwd ?? process.cwd();

  // `target` deploys just that one stage (its own image version) -- how a CD pipeline runs one action per
  // target, so bumping a stage's image in deploy.config and committing deploys only that stage.
  const targets = options.target !== undefined ? config.targets.filter((t) => t.stage === options.target) : config.targets;
  if (options.target !== undefined && targets.length === 0) {
    logger.error(`cdk-cicd deploy --from-image: no target '${options.target}' in deploy.config`);
    return 1;
  }

  for (const target of targets) {
    if (target.manualApproval && !options.yes) {
      logger.error(`cdk-cicd deploy --from-image: target '${target.stage}' requires manual approval -- re-run with --yes`);
      return 1;
    }

    // Each target runs its OWN version: base repo (target/config image) + the `version` from
    // config/<stage>.json in this (CD) repo. Bump that file, commit, and only this stage redeploys.
    const image = resolveTargetImage(target, config, cwd, options.readVersion);
    if (image === undefined) {
      logger.error(`cdk-cicd deploy --from-image: target '${target.stage}' has no image -- set the config-level (or target) image, plus a version in config/${target.stage}.json`);
      return 1;
    }

    for (const run of targetRuns(target)) {
      logger.info(`cdk-cicd deploy --from-image: ${run.stage} -> ${run.region ?? 'ambient region'} (${image})`);
      const result = spawn(dockerRunArgs(image, run, { network: options.network }));
      if (result.error) {
        logger.error(`cdk-cicd deploy --from-image: could not run docker for ${run.stage}: ${result.error.message}`);
        return 1;
      }
      if (result.status !== 0) {
        logger.error(`cdk-cicd deploy --from-image: ${run.stage} -> ${run.region ?? 'ambient region'} failed`);
        return result.status ?? 1;
      }
    }
  }
  return 0;
}
