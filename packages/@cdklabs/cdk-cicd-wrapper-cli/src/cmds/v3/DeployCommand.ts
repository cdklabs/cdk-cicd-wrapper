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
import { load as loadCicdConfig, loadDeployment, stageByName } from './CicdConfig';
import { runFromImage } from './DeployFromImage';
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

/** Reads and parses the `manifest.json` of the assembly rooted at `dir`. Injectable for tests. */
export type ManifestReader = (dir: string) => any;
const readManifestFromDisk: ManifestReader = (dir) =>
  JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf-8'));

/**
 * The stacks of a synthesized assembly at `outDir`, in **dependency order**, as change-set entries for
 * the Lambda deploy driver to execute one at a time.
 *
 * Recurses into `aws:cloud-assembly` artifacts. That is not optional: a `cdk.Stage` (mainstream CDK)
 * synthesizes its stacks into a NESTED assembly, and `cdk deploy --all --no-execute` creates change sets
 * for those nested stacks. A flat, top-level-only scan would miss them -- the driver would then execute
 * nothing (or only the top-level stacks) and the pipeline action would still go GREEN, deploying part or
 * none of the app. So each nested assembly is read from its `directory` and its stacks folded in.
 *
 * Order matters and is not decorative: a stack that consumes another's export must be executed after it,
 * which is ordering `cdk deploy` normally does for us. `dependencies` reference artifact ids within a
 * manifest, so this topologically sorts within each manifest; a nested assembly is emitted where its
 * artifact sits in the parent order, after anything it depends on.
 */
export function planFromAssembly(
  outDir: string,
  region: string,
  changeSetName: string,
  readManifest: ManifestReader = readManifestFromDisk,
): PlanEntry[] {
  const collect = (dir: string): string[] => {
    const artifacts: { [id: string]: any } = readManifest(dir)?.artifacts ?? {};
    const ids = Object.keys(artifacts);
    const relevant = (id: string) =>
      artifacts[id]?.type === 'aws:cloudformation:stack' || artifacts[id]?.type === 'aws:cloud-assembly';

    const ordered: string[] = [];
    const visiting = new Set<string>();
    const visit = (id: string): void => {
      if (ordered.includes(id) || visiting.has(id) || !relevant(id)) return;
      visiting.add(id);
      for (const dep of (artifacts[id]?.dependencies ?? []) as string[]) {
        if (relevant(dep)) visit(dep);
      }
      visiting.delete(id);
      ordered.push(id);
    };
    ids.filter(relevant).forEach(visit);

    // Flatten in order: a stack emits its own name; a nested assembly emits its stacks, recursively.
    return ordered.flatMap((id) => {
      const a = artifacts[id];
      if (a.type === 'aws:cloud-assembly') {
        return collect(path.join(dir, a.properties.directory));
      }
      return [(a.properties?.stackName as string) ?? id];
    });
  };

  return collect(outDir).map((stackName) => ({ stackName, changeSetName, region }));
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
    return (
      args
        // Not demanded: `--from-image` reads deploy.config's targets instead of a single --stage. The
        // handler enforces that --stage is required in every other mode.
        .option('stage', { type: 'string', describe: 'The stage to deploy (required unless --from-image)' })
        .option('yes', {
          type: 'boolean',
          default: false,
          describe: 'Proceed even when the stage requires manual approval',
        })
        .option('region', {
          type: 'string',
          describe: 'Deploy only this one region, ignoring the stage config region list (used by container mode)',
        })
        .option('deploy-role', {
          type: 'string',
          describe:
            'Deploy role that overrides the stage config deployRole for every region of this run (used by container mode)',
        })
        .option('from-image', {
          type: 'boolean',
          default: false,
          describe: 'Run the pinned image in deploy.config against each target (container mode, Repo 2)',
        })
        .option('docker-network', {
          type: 'string',
          describe: 'Docker network for the deployer container (e.g. host) -- for constrained/air-gapped runners',
        })
        .option('target', {
          type: 'string',
          describe: 'With --from-image: deploy only this one deploy.config target (its own image version)',
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
        })
    );
  }

  public async handler(args: yargs.Arguments) {
    const cwd = process.cwd();

    if (args.fromImage as boolean) {
      // Container mode (Repo 2): the topology comes from deploy.config's targets, not a single stage.
      const deployment = loadDeployment(cwd);
      if (deployment === undefined) {
        logger.error('cdk-cicd deploy --from-image: no deploy.config.ts found next to cdk.json');
        process.exit(1);
      }
      const code = runFromImage(deployment, {
        yes: args.yes as boolean,
        network: args.dockerNetwork as string | undefined,
        target: args.target as string | undefined,
      });
      process.exit(code);
    }

    const config = loadCicdConfig(cwd);
    if (config === undefined) {
      logger.error('cdk-cicd deploy: no cicd.config.ts found next to cdk.json');
      process.exit(1);
    }

    const stageName = args.stage as string | undefined;
    if (stageName === undefined) {
      logger.error('cdk-cicd deploy: pass --stage <name> (or --from-image for container mode)');
      process.exit(1);
    }
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

    const regionOverride = args.region as string | undefined;
    const targets = synthTargets(config, stageName, regionOverride);
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

      // A --deploy-role flag (container mode) overrides the stage config's forced role.
      const deployRole = (args.deployRole as string | undefined) ?? stage.deployment?.deployRole;
      const deploy = spawnSync('npx', deployArgs(target.outDir, deployRole, prepareOnly ? changeSetName : undefined), {
        stdio: 'inherit',
        cwd,
        env: { ...process.env, ...target.env },
      });
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
        // Record what the driver must execute -- recursing into nested assemblies. Written per target, so
        // a multi-region stage accumulates every region's change sets into one plan the Lambda walks.
        plan.push(...planFromAssembly(target.outDir, target.region, changeSetName));
      }
    }

    if (prepareOnly) {
      // A deploy stage always has at least one stack, so an empty plan is never legitimate here -- it
      // means `synthTargets` produced nothing (a region-less stage; see the deploy-time-synth caveat) or
      // the assembly parse missed every stack. Writing it would let the driver "successfully" deploy
      // nothing and go green, so fail loudly at prepare instead.
      if (plan.length === 0) {
        logger.error(
          `cdk-cicd deploy: --prepare-only produced an empty plan for '${stageName}' -- no stacks to ` +
            'deploy. A stage that deploys must resolve at least one stack x region.',
        );
        process.exit(1);
      }
      // No assumeRoleArn: a stage's `deployRole` is a CloudFormation SERVICE role (trusted by
      // cloudformation.amazonaws.com), passed to `cdk deploy` as --role-arn and baked into the change
      // set's RoleARN -- CloudFormation assumes it at execute time. The driver must NOT sts:AssumeRole it
      // (that role does not trust the Lambda); it executes the change set under its own identity and
      // CloudFormation uses the baked role. Cross-account is refused at render time (engine).
      const document = JSON.stringify({ stacks: plan });
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
