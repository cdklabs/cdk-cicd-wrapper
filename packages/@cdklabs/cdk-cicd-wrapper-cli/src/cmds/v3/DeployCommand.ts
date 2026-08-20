// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// `cdk-cicd deploy --stage <name>` -- the deploy-time half of the model: for each region of the
// stage, synth the assembly, run the drift check against the account we will actually deploy into,
// and (only if drift is clean) `cdk deploy` that assembly. The promoted unit is code + deps, so the
// synth happens here at deploy, not from a prebuilt assembly.

import { spawnSync } from 'child_process';
import * as yargs from 'yargs';
import { load as loadCicdConfig, stageByName } from './CicdConfig';
import { checkAssembly } from './DriftCheck';
import { synthTargets } from './SynthCommand';
import { logger } from '../../utils/Logging';

/** The `cdk` argv to deploy one already-synthesized assembly, optionally under a forced deploy role. */
export function deployArgs(outDir: string, deployRole?: string): string[] {
  const args = ['cdk', 'deploy', '--app', outDir, '--all', '--require-approval', 'never'];
  if (deployRole !== undefined && deployRole.length > 0) {
    // cdk assumes this role to perform the deployment (the forced deployer role).
    args.push('--role-arn', deployRole);
  }
  return args;
}

/** The account the deploy will actually run against (the ambient creds), for the drift check. */
function resolveDeployAccount(): string | undefined {
  const result = spawnSync('aws', ['sts', 'get-caller-identity', '--query', 'Account', '--output', 'text'], {
    encoding: 'utf-8',
  });
  const account = result.status === 0 ? (result.stdout ?? '').trim() : '';
  return /^[0-9]{12}$/.test(account) ? account : undefined;
}

class Command implements yargs.CommandModule {
  public command = 'deploy';
  public describe = 'Synth, drift-check and deploy a stage across its regions';

  public builder(args: yargs.Argv) {
    return args
      .option('stage', { type: 'string', demandOption: true, describe: 'The stage to deploy' })
      .option('yes', { type: 'boolean', default: false, describe: 'Proceed even when the stage requires manual approval' });
  }

  public async handler(args: yargs.Arguments) {
    const cwd = process.cwd();
    const config = loadCicdConfig(cwd);
    if (config === undefined) {
      logger.error('cdk-cicd deploy: no cicd.config.ts found next to cdk.json');
      process.exit(1);
    }

    const stageName = args.stage as string;
    const stage = stageByName(config, stageName);
    if (stage === undefined) {
      logger.error(`cdk-cicd deploy: no stage '${stageName}' in cicd.config`);
      process.exit(1);
    }
    if (stage.manualApproval && !args.yes) {
      // Real approval gates are the M4 pipeline; the direct CLI honours the flag by requiring --yes.
      logger.error(`cdk-cicd deploy: stage '${stageName}' requires manual approval -- re-run with --yes`);
      process.exit(1);
    }

    // The account we will deploy into (ambient creds), NOT the stage config account -- so a manifest
    // synthesized for a foreign/hardcoded account is caught by drift even when the stage omitted one.
    const deployAccount = resolveDeployAccount();
    if (deployAccount === undefined) {
      logger.warn('cdk-cicd deploy: could not resolve the deploy account via STS; drift will not check the account');
    }

    const targets = synthTargets(config, stageName);
    if (targets.length === 0) {
      logger.warn(`cdk-cicd deploy: stage '${stageName}' has no regions -- nothing to deploy`);
      return;
    }

    for (const target of targets) {
      logger.info(`cdk-cicd deploy: ${target.stage} -> ${target.region}`);

      const synth = spawnSync('npx', ['cdk', 'synth', '--output', target.outDir], {
        stdio: 'inherit',
        cwd,
        env: { ...process.env, ...target.env },
      });
      if (synth.error) {
        logger.error(`cdk-cicd deploy: could not run cdk synth for ${target.stage}/${target.region}: ${synth.error.message}`);
        process.exit(1);
      }
      if (synth.status !== 0) {
        logger.error(`cdk-cicd deploy: synth failed for ${target.stage}/${target.region}`);
        process.exit(synth.status ?? 1);
      }

      const drift = checkAssembly(target.outDir, { account: deployAccount, region: target.region });
      drift.warnings.forEach((w) => logger.warn(w));
      if (!drift.ok) {
        drift.errors.forEach((e) => logger.error(e));
        logger.error(`cdk-cicd deploy: drift refuses ${target.stage}/${target.region} -- aborting the stage`);
        process.exit(1);
      }

      const deploy = spawnSync('npx', deployArgs(target.outDir, stage.deployment?.deployRole), {
        stdio: 'inherit',
        cwd,
        env: { ...process.env, ...target.env },
      });
      if (deploy.error) {
        logger.error(`cdk-cicd deploy: could not run cdk deploy for ${target.stage}/${target.region}: ${deploy.error.message}`);
        process.exit(1);
      }
      if (deploy.status !== 0) {
        logger.error(`cdk-cicd deploy: deploy failed for ${target.stage}/${target.region}`);
        process.exit(deploy.status ?? 1);
      }
    }
  }
}

export default new Command();
