// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// `cdk-cicd synth` -- the deploy model's per-(stage × region) synth. For each target it fixes the
// stage/account/region in the environment and runs `cdk synth` into cdk.out/<stage>/<region>. The
// app command in cdk.json is still `cdk-cicd exec`, so the register preload injects the wrapper for
// each region; exec fills a MISSING target but never overrides the region synth pins here, which is
// what makes multi-region-from-one-invocation work.

import { spawnSync } from 'child_process';
import * as path from 'path';
import type { RegionOrder, ResolvedCicdConfig, ResolvedStage } from '@cdklabs/cdk-cicd-wrapper';
import * as yargs from 'yargs';
import { load as loadCicdConfig, stageByName } from './CicdConfig';
import { ACCOUNT_OVERRIDE_FLAG, REGION_OVERRIDE_FLAG, stageEnv } from './ExecCommand';
import { logger } from '../../utils/Logging';

/** One synth target: a single (stage, region), its output dir and the environment overrides it needs. */
export interface SynthTarget {
  readonly stage: string;
  readonly region: string;
  readonly account?: string;
  readonly outDir: string;
  readonly env: { [key: string]: string };
}

/** Ambient values that can complete or override a target resolved from cicd.config. */
export type SynthTargetEnvironment = NodeJS.ProcessEnv;

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.map((value) => value?.trim()).find((value): value is string => value !== undefined && value.length > 0);
}

/**
 * Enumerate the (stage × region) synth targets. `stageName` undefined selects every stage (the
 * CI-validation `--all` case); a name selects that one stage's region list. Order follows the config.
 *
 * `regionOverride` pins every selected stage to exactly that one region, ignoring the stage's own region
 * list. That is how container mode (Repo 2) deploys one target/region per image run: the `deploy.config`
 * target's env is authoritative for where to deploy, so a single-region run must be able to override
 * whatever region set the image's own `cicd.config` happens to carry -- including an env-agnostic stage
 * with no regions, which then still yields one target rather than nothing.
 *
 * A stage with no configured regions falls back to the ambient CDK/AWS region. Container mode also
 * supplies wrapper-owned overrides; a present empty override clears image configuration and is resolved
 * against the ambient process before entering the CDK CLI. Every resulting target then carries explicit
 * wrapper override flags so later CDK CLI rewrites of `CDK_DEFAULT_*` cannot change its authority.
 */
export function synthTargets(
  config: ResolvedCicdConfig,
  stageName?: string,
  regionOverride?: string,
  ambient: SynthTargetEnvironment = process.env,
): SynthTarget[] {
  const stages = stageName !== undefined ? config.stages.filter((s) => s.name === stageName) : config.stages;
  const targets: SynthTarget[] = [];
  for (const stage of stages) {
    const hasRegionOverride = Object.prototype.hasOwnProperty.call(ambient, REGION_OVERRIDE_FLAG);
    const ambientRegion = firstNonEmpty(
      ambient[REGION_OVERRIDE_FLAG],
      ambient.CDK_DEFAULT_REGION,
      ambient.AWS_REGION,
      ambient.AWS_DEFAULT_REGION,
    );
    const regions =
      regionOverride !== undefined
        ? [regionOverride]
        : hasRegionOverride
          ? ambientRegion !== undefined
            ? [ambientRegion]
            : []
          : stage.env.regions.length > 0
            ? stage.env.regions
            : ambientRegion !== undefined
              ? [ambientRegion]
              : [];
    const hasAccountOverride = Object.prototype.hasOwnProperty.call(ambient, ACCOUNT_OVERRIDE_FLAG);
    const account = hasAccountOverride
      ? firstNonEmpty(ambient[ACCOUNT_OVERRIDE_FLAG], ambient.CDK_DEFAULT_ACCOUNT)
      : stage.env.account;
    for (const region of regions) {
      targets.push({
        stage: stage.name,
        region,
        account,
        outDir: path.join('cdk.out', stage.name, region),
        // AWS_REGION/AWS_DEFAULT_REGION as well as the CDK_* pair: the CDK CLI re-derives the app's
        // CDK_DEFAULT_REGION from AWS_REGION/profile before running the app command, so setting only
        // CDK_DEFAULT_REGION would be silently overridden -- the per-region synth has to steer the
        // CLI's own region resolution.
        env: {
          ...stageEnv(stage.name, { account, region }),
          [ACCOUNT_OVERRIDE_FLAG]: account ?? '',
          [REGION_OVERRIDE_FLAG]: region,
          AWS_REGION: region,
          AWS_DEFAULT_REGION: region,
        },
      });
    }
  }
  return targets;
}

/**
 * True when the process runs under the container-mode (Repo 2) target contract: `deploy --from-image`
 * always sets BOTH wrapper override flags (possibly empty, for an environment-agnostic target).
 */
export function isContainerTargetRun(env: NodeJS.ProcessEnv): boolean {
  return (
    Object.prototype.hasOwnProperty.call(env, ACCOUNT_OVERRIDE_FLAG) &&
    Object.prototype.hasOwnProperty.call(env, REGION_OVERRIDE_FLAG)
  );
}

/**
 * Resolve the config to run `stageName` against.
 *
 * A stage declared in the image's cicd.config is used as-is. Under the container-mode target contract
 * an UNDECLARED stage is accepted too: Repo 2's `deploy.config.ts` target is the stage definition, so
 * the deployer image need not pre-declare every environment. The ad-hoc stage carries only a name;
 * account/region come from the override flags (synthTargets), roles from the role flags (exec), and the
 * manual-approval gate is owned by the Repo 2 pipeline / `deploy --from-image --yes` contract.
 *
 * Returns undefined when the stage is neither declared nor a container-mode target.
 */
export function configForStage(
  config: ResolvedCicdConfig,
  stageName: string,
  env: NodeJS.ProcessEnv = process.env,
): { readonly config: ResolvedCicdConfig; readonly stage: ResolvedStage; readonly adHoc: boolean } | undefined {
  const declared = stageByName(config, stageName);
  if (declared !== undefined) {
    return { config, stage: declared, adHoc: false };
  }
  if (!isContainerTargetRun(env)) {
    return undefined;
  }
  const stage: ResolvedStage = {
    name: stageName,
    // Literal rather than RegionOrder.SEQUENTIAL: this module only type-imports the wrapper so booting
    // the CLI never loads it. Each container run pins exactly one region anyway.
    env: { regions: [], regionOrder: 'sequential' as RegionOrder },
    manualApproval: false,
  };
  return { config: { ...config, stages: [...config.stages, stage] }, stage, adHoc: true };
}

class Command implements yargs.CommandModule {
  public command = 'synth';
  public describe = 'Synthesize each stage x region into cdk.out/<stage>/<region> (deploy-time synth)';

  public builder(args: yargs.Argv) {
    return args
      .option('stage', { type: 'string', describe: 'Synthesize only this stage (else all stages)' })
      .option('all', { type: 'boolean', default: false, describe: 'Synthesize every stage x region (CI validation)' })
      .option('region', {
        type: 'string',
        describe: 'With --stage: synthesize only this one region (used by container-mode validation)',
      });
  }

  public async handler(args: yargs.Arguments) {
    const cwd = process.cwd();
    const loaded = loadCicdConfig(cwd);
    if (loaded === undefined) {
      logger.error('cdk-cicd synth: no cicd.config.ts found next to cdk.json -- nothing to synthesize');
      process.exit(1);
    }
    let config: ResolvedCicdConfig = loaded;

    const stageName = args.stage as string | undefined;
    if (stageName === undefined && !args.all) {
      logger.error('cdk-cicd synth: pass --stage <name> or --all');
      process.exit(1);
    }
    const regionOverride = args.region as string | undefined;
    if (regionOverride !== undefined && stageName === undefined) {
      logger.error('cdk-cicd synth: --region requires --stage');
      process.exit(1);
    }
    if (stageName !== undefined) {
      const selected = configForStage(config, stageName, process.env);
      if (selected === undefined) {
        logger.error(`cdk-cicd synth: no stage '${stageName}' in cicd.config`);
        process.exit(1);
      }
      if (selected.adHoc) {
        logger.info(`cdk-cicd synth: stage '${stageName}' is defined by the deploy repository target`);
      }
      config = selected.config;
    }

    const targets = synthTargets(config, stageName, regionOverride, process.env);
    if (targets.length === 0) {
      logger.error(
        `cdk-cicd synth: ${stageName ?? 'all stages'} produced no stage x region targets; ` +
          'configure a region or set CDK_DEFAULT_REGION/AWS_REGION',
      );
      process.exit(1);
    }
    for (const target of targets) {
      logger.info(`cdk-cicd synth: ${target.stage} -> ${target.region} (${target.outDir})`);
      const result = spawnSync('npx', ['cdk', 'synth', '--output', target.outDir], {
        stdio: 'inherit',
        cwd,
        env: { ...process.env, ...target.env },
      });
      if (result.error) {
        logger.error(`cdk-cicd synth: could not run cdk for ${target.stage}/${target.region}: ${result.error.message}`);
        process.exit(1);
      }
      if (result.status !== 0) {
        process.exit(result.status ?? 1);
      }
    }
  }
}

export default new Command();
