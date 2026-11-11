// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// `cdk-cicd pipeline plan|fingerprint` -- the steps the Repo 2 CD pipeline's CodeBuild projects run
// between `npm ci` and the deploy. They are part of the CLI (typed, unit-tested, pinned by the deploy
// repository's lockfile) rather than code generated into the buildspec, so a build log shows one short
// command line and the pipeline configuration they need stays in the project environment.
//
//   plan         after Source: decides for every deployment stage whether it has anything to deploy and
//                writes `CDK_CICD_RUN_<n>=true|false`, which the stages' entry conditions check.
//   fingerprint  inside a deploy action: the target's current fingerprint, compared against the stored
//                one right before deploying and recorded after a successful deploy.

import { writeFileSync } from 'fs';
import * as yargs from 'yargs';
import { loadDeployment } from './CicdConfig';
import {
  assertPipelineShape,
  parseStagePlans,
  pipelineTarget,
  planOutput,
  planStages,
  readPipelineContext,
  targetFingerprint,
} from './DeploymentFingerprint';
import { logger } from '../../utils/Logging';

function loadOrFail(cwd: string) {
  const config = loadDeployment(cwd);
  if (config === undefined) {
    throw new Error('cdk-cicd pipeline: no deploy.config.ts or deploy.config.js found');
  }
  return config;
}

function fail(error: unknown): never {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const plan: yargs.CommandModule = {
  command: 'plan',
  describe: 'Decide which CD pipeline stages have changes to deploy (writes CDK_CICD_RUN_<n>=true|false)',
  builder: (args: yargs.Argv) =>
    args.option('out', { type: 'string', demandOption: true, describe: 'File to write the stage decisions to' }),
  handler: (args: yargs.Arguments) => {
    try {
      const cwd = process.cwd();
      const config = loadOrFail(cwd);
      // A stale pipeline fails Plan itself: its stages and permissions no longer match deploy.config.
      assertPipelineShape(config, readPipelineContext(process.env));
      const decisions = planStages(config, parseStagePlans(process.env.CDK_CICD_PLAN), cwd);
      for (const decision of decisions) {
        logger.info(
          `cdk-cicd pipeline plan: ${decision.stage} ${decision.run ? 'runs' : 'is skipped'} -- ` +
            decision.reasons.join('; '),
        );
      }
      writeFileSync(args.out as string, planOutput(decisions));
    } catch (error) {
      fail(error);
    }
  },
};

const fingerprint: yargs.CommandModule = {
  command: 'fingerprint',
  describe: "Compute a deployment target's fingerprint inside the CD pipeline",
  builder: (args: yargs.Argv) =>
    args
      .option('target', { type: 'string', demandOption: true, describe: 'The deploy.config target' })
      .option('region', { type: 'string', describe: 'The Region of a parallel multi-region target' })
      .option('out', { type: 'string', demandOption: true, describe: 'File to write the fingerprint to' }),
  handler: (args: yargs.Arguments) => {
    try {
      const cwd = process.cwd();
      const config = loadOrFail(cwd);
      assertPipelineShape(config, readPipelineContext(process.env));
      const region = args.region as string | undefined;
      const target = pipelineTarget(config, args.target as string, region);
      writeFileSync(args.out as string, targetFingerprint(config, target, region, cwd));
    } catch (error) {
      fail(error);
    }
  },
};

class Command implements yargs.CommandModule {
  public command = 'pipeline <command>';
  public describe = 'Steps the container-mode CD pipeline runs (plan, fingerprint)';

  public builder(args: yargs.Argv) {
    return args.command(plan).command(fingerprint).demandCommand(1);
  }

  public handler() {
    // Subcommands handle everything.
  }
}

export default new Command();
