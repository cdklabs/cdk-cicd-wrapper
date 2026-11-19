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
import type { ResolvedDeploymentConfig } from '@cdklabs/cdk-cicd-wrapper';
import * as yargs from 'yargs';
import { loadDeployment } from './CicdConfig';
import {
  assertPipelineShape,
  FingerprintDependencies,
  parseStagePlans,
  PipelineContext,
  pipelineTarget,
  planOutput,
  planStages,
  readPipelineContext,
  StageDecision,
  StateReader,
  targetFingerprint,
} from './DeploymentFingerprint';
import { logger } from '../../utils/Logging';

/**
 * The deployment, plus the targets whose `config/<stage>.json` account or Region is invalid. Those are set
 * aside instead of failing the command, so one target's file cannot stop every other target.
 */
function loadOrFail(cwd: string) {
  const stageFileErrors = new Map<string, Error>();
  const config = loadDeployment(cwd, (stage, error) => stageFileErrors.set(stage, error));
  if (config === undefined) {
    throw new Error('cdk-cicd pipeline: no deploy.config.ts or deploy.config.js found');
  }
  return { config, stageFileErrors };
}

/**
 * Check the pipeline shape with each set-aside target at the account and Regions the pipeline was built
 * for. The shape covers the environment that `deploy-ci` resolved from the file; without its valid file,
 * the target would look reshaped and fail every target with "re-run deploy-ci" instead of its own error.
 */
function assertShapeAside(
  config: ResolvedDeploymentConfig,
  context: PipelineContext,
  stageFileErrors: ReadonlyMap<string, Error>,
): void {
  const targets = config.targets.map((target) => {
    const recorded = stageFileErrors.has(target.stage) ? context.targetEnvironments[target.stage] : undefined;
    return recorded === undefined
      ? target
      : { ...target, env: { ...target.env, account: recorded.account, regions: recorded.regions } };
  });
  assertPipelineShape({ ...config, targets }, context);
}

/** `pipeline plan`: the decision for every deployment stage of the checked-out deploy repository. */
export function planDecisions(
  cwd: string,
  env: NodeJS.ProcessEnv,
  readState?: StateReader,
  dependencies?: FingerprintDependencies,
): StageDecision[] {
  const { config, stageFileErrors } = loadOrFail(cwd);
  // A stale pipeline fails Plan itself: its stages and permissions no longer match deploy.config.
  assertShapeAside(config, readPipelineContext(env), stageFileErrors);
  return planStages(config, parseStagePlans(env.CDK_CICD_PLAN), cwd, readState, dependencies, stageFileErrors);
}

/** `pipeline fingerprint`: one deployment unit's fingerprint; fails on that target's own invalid file. */
export function unitFingerprint(
  cwd: string,
  env: NodeJS.ProcessEnv,
  stage: string,
  region: string | undefined,
  dependencies?: FingerprintDependencies,
): string {
  const { config, stageFileErrors } = loadOrFail(cwd);
  const stageFileError = stageFileErrors.get(stage);
  if (stageFileError !== undefined) throw stageFileError;
  assertShapeAside(config, readPipelineContext(env), stageFileErrors);
  return targetFingerprint(config, pipelineTarget(config, stage, region), region, cwd, dependencies);
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
      const decisions = planDecisions(process.cwd(), process.env);
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
      const region = args.region as string | undefined;
      writeFileSync(args.out as string, unitFingerprint(process.cwd(), process.env, args.target as string, region));
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
