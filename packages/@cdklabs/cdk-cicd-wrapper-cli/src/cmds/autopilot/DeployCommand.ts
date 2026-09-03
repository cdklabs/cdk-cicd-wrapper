// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// `cdk-cicd deploy --stage <name>` -- the deploy-time half of the model: for each region of the
// stage, synth the assembly, run the drift check against the account we will actually deploy into,
// and (only if drift is clean) `cdk deploy` that assembly. The promoted unit is code + deps, so the
// synth happens here at deploy, not from a prebuilt assembly.

import { spawn, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import * as path from 'path';
import { specializeDefaultSynthesizerRoleArn } from '@cdklabs/cdk-cicd-wrapper';
import * as yargs from 'yargs';
import { load as loadCicdConfig, loadDeployment, stageByName } from './CicdConfig';
import { RegionalInvocationResult, runFromImage, runRegionalInvocations } from './DeployFromImage';
import { checkAssembly, ManifestReader, parseEnvironment, stacksFromAssembly } from './DriftCheck';
import { buildContextJson, CFN_EXEC_ROLE_FLAG, DEPLOY_ROLE_FLAG } from './ExecCommand';
import { synthTargets } from './SynthCommand';
import { logger } from '../../utils/Logging';

/**
 * The `cdk` argv to deploy one already-synthesized assembly.
 *
 * With `changeSetName` it PREPARES instead of deploying: `--no-execute` publishes the assets and creates
 * the change sets, then returns immediately. That is what lets the Lambda deploy driver own the
 * CloudFormation wait -- the expensive part -- rather than a build container (D-deploy-wait).
 *
 * Deployment and CloudFormation execution roles are deliberately absent from this argv. They are
 * synthesized into the cloud assembly as `assumeRoleArn` and `cloudFormationExecutionRoleArn`.
 * CDK's `--role-arn` means the latter, so passing a deployment role there would override the assembly's
 * execution role and collapse two distinct IAM contracts.
 */
export function deployArgs(outDir: string, changeSetName?: string, express = false): string[] {
  // The installed CDK CLI maps `--all` to the main cloud assembly only. A glob selector is matched
  // against every stack's hierarchical id, so `**` includes stacks synthesized below cdk.Stage too.
  // spawn() passes this as a literal argv item; no shell expands it.
  const args = ['cdk', 'deploy', '--app', outDir, '**', '--require-approval', 'never'];
  if (changeSetName !== undefined) {
    args.push('--no-execute', '--change-set-name', changeSetName);
  } else if (express) {
    // CloudFormation express mode: report completion without waiting for resource stabilization.
    // NOTE: express runs with rollback DISABLED, and pairing it with `--rollback` conflicts with the
    // change-set path for nested stacks ("DisableRollback ... conflicts with the value the ChangeSet was
    // created with"), so we do NOT force `--rollback`. A failed express deploy is left in a failed state
    // for inspection -- which is why express is for fast iterative dev deploys, not production.
    args.push('--express');
  }
  return args;
}

/**
 * Apply a command-line deployment-role override to the process that synthesizes the assembly.
 *
 * Presence is authoritative, including an empty value supplied by Repo 2 to clear a role baked into
 * the image's cicd.config. With no CLI override the ambient environment is returned unchanged, so those
 * presence-sensitive Repo 2 flags survive into `cdk synth`.
 */
export function deploymentEnvironment(ambient: NodeJS.ProcessEnv, deployRoleOverride?: string): NodeJS.ProcessEnv {
  return deployRoleOverride === undefined ? ambient : { ...ambient, [DEPLOY_ROLE_FLAG]: deployRoleOverride };
}

/**
 * Resolve the exact role identity the synth child should embed.
 *
 * An environment variable's presence is authoritative, including an empty value that clears the
 * stage configuration. Trimming mirrors the runtime synthesizer's env parsing.
 */
export function expectedSynthesizedRole(
  environment: NodeJS.ProcessEnv,
  flag: string,
  configuredRole?: string,
  target?: {
    readonly qualifier: string;
    readonly account: string;
    readonly region: string;
  },
  source: 'synthesis' | 'promoted-assembly' = 'synthesis',
): string | undefined {
  const selected =
    source === 'promoted-assembly'
      ? configuredRole
      : Object.prototype.hasOwnProperty.call(environment, flag)
        ? environment[flag]
        : configuredRole;
  const trimmed = selected?.trim();
  if (trimmed === undefined || trimmed.length === 0) return undefined;
  return target === undefined
    ? trimmed
    : specializeDefaultSynthesizerRoleArn(trimmed, {
        ...target,
      });
}

const BOOTSTRAP_QUALIFIER_CONTEXT = '@aws-cdk/core:bootstrapQualifier';
const DEFAULT_BOOTSTRAP_QUALIFIER = 'hnb659fds';

/**
 * Resolve the qualifier used by the application synthesizer with CDK's precedence:
 * explicit wrapper config, merged CDK context, then the standard bootstrap default.
 *
 * A promoted assembly is validated only against repository context. Ambient `CDK_CONTEXT_JSON` may
 * contain caller- or CDK-CLI-injected values that did not participate in the promoted synthesis and
 * therefore cannot authorize a different bootstrap role contract.
 */
export function effectiveBootstrapQualifier(
  configuredQualifier: string | undefined,
  cwd: string,
  environment: NodeJS.ProcessEnv,
  source: 'synthesis' | 'promoted-assembly' = 'synthesis',
): string {
  const contextEnvironment = source === 'promoted-assembly' ? {} : environment;
  const context = JSON.parse(buildContextJson({}, {}, contextEnvironment, cwd)) as { [key: string]: unknown };
  const selected = configuredQualifier ?? context[BOOTSTRAP_QUALIFIER_CONTEXT] ?? DEFAULT_BOOTSTRAP_QUALIFIER;
  if (typeof selected !== 'string' || !/^[A-Za-z0-9_-]{1,10}$/.test(selected)) {
    throw new Error(
      `cdk-cicd deploy: bootstrap qualifier from '${BOOTSTRAP_QUALIFIER_CONTEXT}' must match ` +
        '`[A-Za-z0-9_-]{1,10}`',
    );
  }
  return selected;
}

/**
 * Prefer the configured target account; ambient credentials are authoritative only for an agnostic
 * target. If neither is known, fail closed: accepting a concrete assembly account in that state would
 * let a hard-coded foreign account bypass drift validation.
 */
export function driftAccountForTarget(
  configuredAccount: string | undefined,
  ambientAccount: string | undefined,
): string {
  const account = configuredAccount ?? ambientAccount;
  if (account === undefined) {
    throw new Error('cdk-cicd deploy: cannot validate an account-agnostic target without an ambient STS account');
  }
  return account;
}

/**
 * A promoted assembly already contains its deployment and CloudFormation execution roles. Replacing
 * either role at deploy time would reinterpret the synthesized security contract.
 */
export function assertDeployRoleOverrideAllowed(fromAssembly: boolean, deployRole: string | undefined): void {
  if (fromAssembly && deployRole !== undefined) {
    throw new Error(
      'cdk-cicd deploy: --deploy-role cannot be used with --from-assembly because deployment roles ' +
        'are already embedded in the promoted cloud assembly',
    );
  }
}

/** Reject option combinations whose flags would otherwise be silently ignored by the selected mode. */
export function assertDeploymentModeOptions(options: {
  readonly fromImage: boolean;
  readonly fromAssembly: boolean;
  readonly deployRole?: string;
  readonly stage?: string;
  readonly region?: string;
  readonly prepareOnly: boolean;
  readonly planParameter?: string;
  readonly target?: string;
  readonly dockerNetwork?: string;
}): void {
  if (options.fromImage) {
    const incompatible = [
      options.fromAssembly ? '--from-assembly' : undefined,
      options.deployRole !== undefined ? '--deploy-role' : undefined,
      options.stage !== undefined ? '--stage' : undefined,
      options.region !== undefined ? '--region' : undefined,
      options.prepareOnly ? '--prepare-only' : undefined,
      options.planParameter !== undefined ? '--plan-parameter' : undefined,
    ].filter((flag): flag is string => flag !== undefined);
    if (incompatible.length > 0) {
      throw new Error(`cdk-cicd deploy: --from-image cannot be combined with ${incompatible.join(', ')}`);
    }
    return;
  }

  assertDeployRoleOverrideAllowed(options.fromAssembly, options.deployRole);
  if (options.target !== undefined || options.dockerNetwork !== undefined) {
    throw new Error('cdk-cicd deploy: --target and --docker-network require --from-image');
  }
  if (!options.prepareOnly && options.planParameter !== undefined) {
    throw new Error('cdk-cicd deploy: --plan-parameter requires --prepare-only');
  }
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
 * The stacks of a synthesized assembly at `outDir`, in **dependency order**, as change-set entries for
 * the Lambda deploy driver to execute one at a time.
 *
 * Recurses into `cdk:cloud-assembly` artifacts. That is not optional: a `cdk.Stage` (mainstream CDK)
 * synthesizes its stacks into a NESTED assembly, and `cdk deploy '**' --no-execute` creates change sets
 * for those nested stacks. A flat, top-level-only scan would miss them -- the driver would then execute
 * nothing (or only the top-level stacks) and the pipeline action would still go GREEN, deploying part or
 * none of the app. The shared assembly walker follows the installed schema's `properties.directoryName`.
 *
 * Order matters and is not decorative: a stack that consumes another's export must be executed after it,
 * which is ordering `cdk deploy` normally does for us.
 */
export function planFromAssembly(
  outDir: string,
  fallbackRegion: string,
  changeSetName: string,
  readManifest?: ManifestReader,
): PlanEntry[] {
  return stacksFromAssembly(outDir, readManifest).map((stack) => {
    const artifactRegion = stack.environment === undefined ? undefined : parseEnvironment(stack.environment).region;
    return {
      stackName: stack.stackName,
      changeSetName,
      region:
        artifactRegion === undefined || artifactRegion.length === 0 || artifactRegion === 'unknown-region'
          ? fallbackRegion
          : artifactRegion,
    };
  });
}

/** Result of one region's complete synth/drift/deploy workflow. */
export interface RegionalDeploymentResult extends RegionalInvocationResult {
  readonly plan: PlanEntry[];
}

/**
 * Run one complete deployment workflow per region and collect plans in configured region order.
 * Parallel completion order never changes either the selected failure code or the serialized plan.
 */
export async function runRegionalDeployments<T, R extends RegionalDeploymentResult>(
  targets: readonly T[],
  regionOrder: string,
  deploy: (target: T, index: number) => R | Promise<R>,
): Promise<{ readonly code: number; readonly plan: PlanEntry[]; readonly results: R[] }> {
  const results = await runRegionalInvocations(targets, regionOrder, deploy);
  const failure = results.find((result) => result.code !== 0);
  return {
    code: failure?.code ?? 0,
    plan: results.flatMap((result) => result.plan),
    results,
  };
}

/** Resolve the ambient account used only when the configured deployment target is account-agnostic. */
function resolveDeployAccount(): string | undefined {
  const result = spawnSync('aws', ['sts', 'get-caller-identity', '--query', 'Account', '--output', 'text'], {
    encoding: 'utf-8',
  });
  const account = result.status === 0 ? (result.stdout ?? '').trim() : '';
  return /^[0-9]{12}$/.test(account) ? account : undefined;
}

interface InheritedProcessResult {
  readonly status: number | null;
  readonly error?: Error;
}

/** Spawn a command with inherited output without blocking other regional invocations. */
function spawnInherited(
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
): Promise<InheritedProcessResult> {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { stdio: 'inherit', cwd: options.cwd, env: options.env });
      child.once('error', (error) => resolve({ status: null, error }));
      child.once('close', (status) => resolve({ status }));
    } catch (error) {
      resolve({ status: null, error: error instanceof Error ? error : new Error(String(error)) });
    }
  });
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
          describe: 'Deployment role override synthesized into the assembly for every region of this run',
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
    const fromImage = args.fromImage as boolean;
    const fromAssembly = args.fromAssembly as boolean;
    try {
      assertDeploymentModeOptions({
        fromImage,
        fromAssembly,
        deployRole: args.deployRole as string | undefined,
        stage: args.stage as string | undefined,
        region: args.region as string | undefined,
        prepareOnly: args.prepareOnly as boolean,
        planParameter: args.planParameter as string | undefined,
        target: args.target as string | undefined,
        dockerNetwork: args.dockerNetwork as string | undefined,
      });
    } catch (error) {
      logger.error((error as Error).message);
      process.exit(1);
    }

    if (fromImage) {
      // Container mode (Repo 2): the topology comes from deploy.config's targets, not a single stage.
      const deployment = loadDeployment(cwd);
      if (deployment === undefined) {
        logger.error('cdk-cicd deploy --from-image: no deploy.config.ts found next to cdk.json');
        process.exit(1);
      }
      const code = await runFromImage(deployment, {
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

    const regionOverride = args.region as string | undefined;
    // process.env carries the Repo 2 account override and the ambient-region fallback used by bare
    // stages. Passing it explicitly makes those deployment inputs authoritative over the image config.
    const targets = synthTargets(config, stageName, regionOverride, process.env);
    if (targets.length === 0) {
      logger.error(
        `cdk-cicd deploy: stage '${stageName}' has no configured or ambient region; ` +
          'configure a region or set CDK_DEFAULT_REGION/AWS_REGION',
      );
      process.exit(1);
    }

    // An explicit stage/Repo 2 target is authoritative even when the caller currently holds credentials
    // in a different pipeline account: CDK reaches the target by assuming the assembly's deployment role.
    // Ambient STS identity is consulted only for a genuinely account-agnostic target.
    const needsAmbientDeployAccount = targets.some((target) => target.account === undefined);
    const ambientDeployAccount = needsAmbientDeployAccount ? resolveDeployAccount() : undefined;
    if (needsAmbientDeployAccount && ambientDeployAccount === undefined) {
      logger.error(
        'cdk-cicd deploy: could not resolve the ambient deploy account via STS; refusing to deploy ' +
          'an account-agnostic target without account drift validation',
      );
      process.exit(1);
    }

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
    const deployProcessEnv = deploymentEnvironment(process.env, args.deployRole as string | undefined);
    let bootstrapQualifier: string;
    try {
      bootstrapQualifier = effectiveBootstrapQualifier(
        config.qualifier,
        cwd,
        process.env,
        fromAssembly ? 'promoted-assembly' : 'synthesis',
      );
    } catch (error) {
      logger.error((error as Error).message);
      process.exit(1);
    }
    type DeployLog = { readonly level: 'info' | 'warn' | 'error'; readonly message: string };
    type CommandRegionalDeploymentResult = RegionalDeploymentResult & { readonly logs: DeployLog[] };

    const regionalDeployment = await runRegionalDeployments(
      targets,
      stage.env.regionOrder,
      async (target): Promise<CommandRegionalDeploymentResult> => {
        logger.info(`cdk-cicd deploy: ${target.stage} -> ${target.region}`);
        const logs: DeployLog[] = [];
        const log = (level: DeployLog['level'], message: string): void => {
          logs.push({ level, message });
        };
        const fail = (code: number, message: string): CommandRegionalDeploymentResult => {
          log('error', message);
          return { code, plan: [], logs };
        };

        try {
          const driftAccount = driftAccountForTarget(target.account, ambientDeployAccount);
          const roleTarget = {
            qualifier: bootstrapQualifier,
            account: driftAccount,
            region: target.region,
          };
          const expectedDeployRoleArn = expectedSynthesizedRole(
            deployProcessEnv,
            DEPLOY_ROLE_FLAG,
            stage.deployment?.deployRole,
            roleTarget,
            fromAssembly ? 'promoted-assembly' : 'synthesis',
          );
          const expectedCloudFormationExecutionRoleArn = expectedSynthesizedRole(
            deployProcessEnv,
            CFN_EXEC_ROLE_FLAG,
            stage.deployment?.cfnExecutionRole,
            roleTarget,
            fromAssembly ? 'promoted-assembly' : 'synthesis',
          );

          if (fromAssembly) {
            // The promoted-assembly model: Build already synthed this stage, so deploying is all that is
            // left. Costs one synth per pipeline run instead of one per stage.
            assertPromotedAssembly(target.outDir);
            log('info', `cdk-cicd deploy: using the promoted assembly at ${target.outDir} (no synth)`);
          } else {
            const synth = await spawnInherited('npx', ['cdk', 'synth', '--output', target.outDir], {
              cwd,
              env: { ...deployProcessEnv, ...target.env },
            });
            if (synth.error !== undefined) {
              return fail(
                1,
                `cdk-cicd deploy: could not run cdk synth for ${target.stage}/${target.region}: ${synth.error.message}`,
              );
            }
            if (synth.status !== 0) {
              return fail(synth.status ?? 1, `cdk-cicd deploy: synth failed for ${target.stage}/${target.region}`);
            }
          }

          const drift = checkAssembly(target.outDir, {
            account: driftAccount,
            region: target.region,
            qualifier: bootstrapQualifier,
            deployRoleArn: expectedDeployRoleArn,
            cloudFormationExecutionRoleArn: expectedCloudFormationExecutionRoleArn,
          });
          drift.warnings.forEach((warning) => log('warn', warning));
          drift.errors.forEach((error) => log('error', error));
          if (!drift.ok) {
            return fail(1, `cdk-cicd deploy: drift refuses ${target.stage}/${target.region} -- aborting the stage`);
          }

          const deploy = await spawnInherited(
            'npx',
            deployArgs(target.outDir, prepareOnly ? changeSetName : undefined, config.express),
            {
              cwd,
              env: { ...deployProcessEnv, ...target.env },
            },
          );
          if (deploy.error !== undefined) {
            return fail(
              1,
              `cdk-cicd deploy: could not run cdk deploy for ${target.stage}/${target.region}: ${deploy.error.message}`,
            );
          }
          if (deploy.status !== 0) {
            return fail(deploy.status ?? 1, `cdk-cicd deploy: deploy failed for ${target.stage}/${target.region}`);
          }

          return {
            code: 0,
            plan: prepareOnly ? planFromAssembly(target.outDir, target.region, changeSetName) : [],
            logs,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return fail(1, `cdk-cicd deploy: ${target.stage}/${target.region} failed: ${message}`);
        }
      },
    );

    // Promise.all preserves target order, so logs, failure selection, and prepare plans remain stable
    // even when parallel regions complete in a different order.
    for (const result of regionalDeployment.results) {
      for (const entry of result.logs) {
        if (entry.level === 'info') {
          logger.info(entry.message);
        } else if (entry.level === 'warn') {
          logger.warn(entry.message);
        } else {
          logger.error(entry.message);
        }
      }
    }
    if (regionalDeployment.code !== 0) {
      process.exit(regionalDeployment.code);
    }
    const plan = regionalDeployment.plan;

    if (prepareOnly) {
      // A deploy stage always has at least one stack, so an empty plan is never legitimate here -- it
      // means the assembly parse missed every stack. Writing it would let the driver "successfully"
      // deploy nothing and go green, so fail loudly at prepare instead.
      if (plan.length === 0) {
        logger.error(
          `cdk-cicd deploy: --prepare-only produced an empty plan for '${stageName}' -- no stacks to ` +
            'deploy. A stage that deploys must resolve at least one stack x region.',
        );
        process.exit(1);
      }
      // The synthesized assembly keeps deployment-role assumption separate from the CloudFormation
      // execution role. Preparing the change set bakes the latter into its RoleARN; the driver then
      // executes the prepared change set under its own identity and must not reinterpret either role.
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
