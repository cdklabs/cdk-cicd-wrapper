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
import type { ResolvedCicdConfig } from '@cdklabs/cdk-cicd-wrapper';
import * as yargs from 'yargs';
import { load as loadCicdConfig, stageByName } from './CicdConfig';
import { stageEnv } from './ExecCommand';
import { logger } from '../../utils/Logging';

/** One synth target: a single (stage, region), its output dir and the environment overrides it needs. */
export interface SynthTarget {
  readonly stage: string;
  readonly region: string;
  readonly account?: string;
  readonly outDir: string;
  readonly env: { [key: string]: string };
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
 */
export function synthTargets(config: ResolvedCicdConfig, stageName?: string, regionOverride?: string): SynthTarget[] {
  const stages = stageName !== undefined ? config.stages.filter((s) => s.name === stageName) : config.stages;
  const targets: SynthTarget[] = [];
  for (const stage of stages) {
    const regions = regionOverride !== undefined ? [regionOverride] : stage.env.regions;
    for (const region of regions) {
      targets.push({
        stage: stage.name,
        region,
        account: stage.env.account,
        outDir: path.join('cdk.out', stage.name, region),
        // AWS_REGION/AWS_DEFAULT_REGION as well as the CDK_* pair: the CDK CLI re-derives the app's
        // CDK_DEFAULT_REGION from AWS_REGION/profile before running the app command, so setting only
        // CDK_DEFAULT_REGION would be silently overridden -- the per-region synth has to steer the
        // CLI's own region resolution.
        env: {
          ...stageEnv(stage.name, { account: stage.env.account, region }),
          AWS_REGION: region,
          AWS_DEFAULT_REGION: region,
        },
      });
    }
  }
  return targets;
}

class Command implements yargs.CommandModule {
  public command = 'synth';
  public describe = 'Synthesize each stage x region into cdk.out/<stage>/<region> (deploy-time synth)';

  public builder(args: yargs.Argv) {
    return args
      .option('stage', { type: 'string', describe: 'Synthesize only this stage (else all stages)' })
      .option('all', { type: 'boolean', default: false, describe: 'Synthesize every stage x region (CI validation)' });
  }

  public async handler(args: yargs.Arguments) {
    const cwd = process.cwd();
    const config = loadCicdConfig(cwd);
    if (config === undefined) {
      logger.error('cdk-cicd synth: no cicd.config.ts found next to cdk.json -- nothing to synthesize');
      process.exit(1);
    }

    const stageName = args.stage as string | undefined;
    if (stageName === undefined && !args.all) {
      logger.error('cdk-cicd synth: pass --stage <name> or --all');
      process.exit(1);
    }
    if (stageName !== undefined && stageByName(config, stageName) === undefined) {
      logger.error(`cdk-cicd synth: no stage '${stageName}' in cicd.config`);
      process.exit(1);
    }

    const targets = synthTargets(config, stageName);
    if (targets.length === 0) {
      // A stage with no regions (env-agnostic) selects nothing -- say so rather than exiting 0 silently.
      logger.warn(
        `cdk-cicd synth: nothing to synthesize (${stageName ?? 'all stages'} produced no stage x region targets)`,
      );
      return;
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
