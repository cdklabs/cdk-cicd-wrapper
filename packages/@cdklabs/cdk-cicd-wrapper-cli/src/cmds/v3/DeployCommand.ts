// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// `cdk-cicd deploy --stage <name>` -- the deploy-time half of the model: for each region of the
// stage, synth the assembly, run the drift check against the account we will actually deploy into,
// and (only if drift is clean) `cdk deploy` that assembly. The promoted unit is code + deps, so the
// synth happens here at deploy, not from a prebuilt assembly.

import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import * as yargs from 'yargs';
import { load as loadCicdConfig, stageByName } from './CicdConfig';
import { checkAssembly } from './DriftCheck';
import { synthTargets } from './SynthCommand';
import { logger } from '../../utils/Logging';

/**
 * The `cdk` argv to deploy one already-synthesized assembly, optionally under a forced deploy role.
 *
 * With `changeSetName` it PREPARES instead of deploying: `--no-execute` publishes the assets and creates
 * the change sets, then returns immediately. That is what lets the Lambda deploy driver own the
 * CloudFormation wait -- the expensive part -- rather than a build container (D-deploy-wait).
 */
export function deployArgs(outDir: string, deployRole?: string, changeSetName?: string): string[] {
  const args = ['cdk', 'deploy', '--app', outDir, '--all', '--require-approval', 'never'];
  if (changeSetName !== undefined) {
    args.push('--no-execute', '--change-set-name', changeSetName);
  }
  if (deployRole !== undefined && deployRole.length > 0) {
    // cdk assumes this role to perform the deployment (the forced deployer role).
    args.push('--role-arn', deployRole);
  }
  return args;
}

/**
 * Assert `outDir` already holds a synthesized cloud assembly -- the promoted-artifact deploy model,
 * where the Build stage synthed every stage once and published `cdk.out` as the deploy input.
 *
 * Checks for `manifest.json` rather than the directory: CodePipeline materializes the input artifact as
 * a tree, so an empty (or wrong-stage) `cdk.out/<stage>/<region>` exists but holds nothing, and the
 * failure would surface much later from inside `cdk deploy`. Falling back to synthesizing here would be
 * worse still -- it would quietly re-introduce the deploy-time synth this mode exists to avoid, so a
 * broken artifact wiring would look like a slow success instead of a failure.
 */
export function assertPromotedAssembly(outDir: string, exists: (p: string) => boolean = existsSync): void {
  if (!exists(path.join(outDir, 'manifest.json'))) {
    throw new Error(
      `cdk-cicd deploy: --from-assembly was given but ${outDir} holds no synthesized assembly ` +
        "(no manifest.json) -- the Build stage must publish cdk.out as this action's input artifact",
    );
  }
}

/** One prepared change set for the deploy driver to execute. */
export interface PlanEntry {
  readonly stackName: string;
  readonly changeSetName: string;
  readonly region: string;
}

/**
 * The stacks of a synthesized assembly, in **dependency order**, as change-set entries for the Lambda
 * deploy driver to execute one at a time.
 *
 * Order matters and is not decorative: a stack that consumes another's export must be executed after it,
 * which is ordering `cdk deploy` normally does for us. `dependencies` in the manifest reference artifact
 * ids, so this is a topological sort over those, with the manifest's own order as the tie-break so the
 * result is deterministic for a given assembly.
 */
export function planFromAssembly(manifest: any, region: string, changeSetName: string): PlanEntry[] {
  const artifacts: { [id: string]: any } = manifest?.artifacts ?? {};
  const stackIds = Object.keys(artifacts).filter((id) => artifacts[id]?.type === 'aws:cloudformation:stack');

  const ordered: string[] = [];
  const visiting = new Set<string>();
  const visit = (id: string): void => {
    if (ordered.includes(id) || visiting.has(id)) return; // already placed, or a cycle we refuse to chase
    visiting.add(id);
    for (const dep of (artifacts[id]?.dependencies ?? []) as string[]) {
      if (stackIds.includes(dep)) visit(dep);
    }
    visiting.delete(id);
    ordered.push(id);
  };
  stackIds.forEach(visit);

  return ordered.map((id) => ({
    stackName: (artifacts[id]?.properties?.stackName as string) ?? id,
    changeSetName,
    region,
  }));
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
      .option('yes', {
        type: 'boolean',
        default: false,
        describe: 'Proceed even when the stage requires manual approval',
      })
      .option('from-assembly', {
        type: 'boolean',
        default: false,
        describe: 'Deploy the already-synthesized cdk.out/<stage>/<region> instead of synthesizing now',
      })
      .option('prepare-only', {
        type: 'boolean',
        default: false,
        describe: 'Create change sets without executing them, and record a plan for the deploy driver',
      })
      .option('plan-parameter', {
        type: 'string',
        describe: 'SSM parameter to write the deploy plan to (required with --prepare-only)',
      });
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

    const fromAssembly = args.fromAssembly as boolean;
    const prepareOnly = args.prepareOnly as boolean;
    const planParameter = args.planParameter as string | undefined;
    if (prepareOnly && (planParameter === undefined || planParameter.length === 0)) {
      logger.error('cdk-cicd deploy: --prepare-only requires --plan-parameter <ssm parameter name>');
      process.exit(1);
    }
    // One change-set name for every stack of this run, so the plan needs to carry only the name once.
    // Unique per execution: reusing a name across runs collides with the change set still sitting on the
    // stack from the previous one.
    const changeSetName = `cdk-cicd-${process.env.CODEBUILD_BUILD_NUMBER ?? Date.now()}`;
    const plan: PlanEntry[] = [];

    for (const target of targets) {
      logger.info(`cdk-cicd deploy: ${target.stage} -> ${target.region}`);

      if (fromAssembly) {
        // The promoted-assembly model: Build already synthed this stage, so deploying is all that is
        // left. Costs one synth per pipeline run instead of one per stage.
        try {
          assertPromotedAssembly(target.outDir);
        } catch (error) {
          logger.error((error as Error).message);
          process.exit(1);
        }
        logger.info(`cdk-cicd deploy: using the promoted assembly at ${target.outDir} (no synth)`);
      } else {
        const synth = spawnSync('npx', ['cdk', 'synth', '--output', target.outDir], {
          stdio: 'inherit',
          cwd,
          env: { ...process.env, ...target.env },
        });
        if (synth.error) {
          logger.error(
            `cdk-cicd deploy: could not run cdk synth for ${target.stage}/${target.region}: ${synth.error.message}`,
          );
          process.exit(1);
        }
        if (synth.status !== 0) {
          logger.error(`cdk-cicd deploy: synth failed for ${target.stage}/${target.region}`);
          process.exit(synth.status ?? 1);
        }
      }

      const drift = checkAssembly(target.outDir, { account: deployAccount, region: target.region });
      drift.warnings.forEach((w) => logger.warn(w));
      if (!drift.ok) {
        drift.errors.forEach((e) => logger.error(e));
        logger.error(`cdk-cicd deploy: drift refuses ${target.stage}/${target.region} -- aborting the stage`);
        process.exit(1);
      }

      const deploy = spawnSync(
        'npx',
        deployArgs(target.outDir, stage.deployment?.deployRole, prepareOnly ? changeSetName : undefined),
        {
          stdio: 'inherit',
          cwd,
          env: { ...process.env, ...target.env },
        },
      );
      if (deploy.error) {
        logger.error(
          `cdk-cicd deploy: could not run cdk deploy for ${target.stage}/${target.region}: ${deploy.error.message}`,
        );
        process.exit(1);
      }
      if (deploy.status !== 0) {
        logger.error(`cdk-cicd deploy: deploy failed for ${target.stage}/${target.region}`);
        process.exit(deploy.status ?? 1);
      }

      if (prepareOnly) {
        // Record what the driver must execute. Written per target, so a multi-region stage accumulates
        // every region's change sets into one plan the Lambda walks in order.
        plan.push(
          ...planFromAssembly(
            JSON.parse(readFileSync(path.join(target.outDir, 'manifest.json'), 'utf-8')),
            target.region,
            changeSetName,
          ),
        );
      }
    }

    if (prepareOnly) {
      const document = JSON.stringify({ stacks: plan, assumeRoleArn: stage.deployment?.deployRole });
      const put = spawnSync(
        'aws',
        ['ssm', 'put-parameter', '--name', planParameter!, '--type', 'String', '--overwrite', '--value', document],
        { stdio: 'inherit', cwd },
      );
      if (put.error || put.status !== 0) {
        // Failing here rather than exiting 0 matters: the driver action that follows would otherwise read
        // a stale plan from the previous run and "successfully" await the wrong change sets.
        logger.error(`cdk-cicd deploy: could not write the deploy plan to ${planParameter}`);
        process.exit(put.status ?? 1);
      }
      logger.info(
        `cdk-cicd deploy: prepared ${plan.length} change set(s) for '${stageName}'; the deploy driver will execute them`,
      );
    }
  }
}

export default new Command();
