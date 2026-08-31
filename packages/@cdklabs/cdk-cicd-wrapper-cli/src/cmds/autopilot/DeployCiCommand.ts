// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// `cdk-cicd deploy-ci` -- provision the pipeline itself into the hub/RES account, from nothing but
// `cicd.config.ts`. It is the one command a user runs by hand; everything after it is the pipeline
// deploying the application. The account and region are whichever the ambient credentials point at,
// which is also how the pipeline stack gets its environment (see PipelineApp).
//
// Note this is NOT `cdk-cicd deploy --stage`: that deploys the *application* for one stage and drift-
// checks it first. Here the assembly is ours, generated from the config seconds earlier, so there is
// nothing to drift against.

import { spawnSync } from 'child_process';
import type { EngineType } from '@cdklabs/cdk-cicd-wrapper';
import * as yargs from 'yargs';
import { load as loadCicdConfig, loadDeployment } from './CicdConfig';
import { logger } from '../../utils/Logging';

/**
 * The `cdk` argv that deploys the pipeline stack. There is NO `--app` override: `cdk.json`'s single
 * `app` command (`cdk-cicd exec <entry>`) renders the pipeline when `CDK_CICD_MODE=pipeline` is in the
 * environment (set below), and the application stacks otherwise. So provisioning the pipeline uses the
 * exact same entry point as a plain synth, differing only by the inherited mode signal.
 *
 * `cdk` is invoked as `npm run cdk` (never `npx`) so the project's pinned aws-cdk is used, matching the
 * in-pipeline synth step. `_kind`/`_engine` are retained for the handler's logging and back-compat.
 */
export function deployCiArgs(_kind: 'ci' | 'cd' = 'ci', _engine?: EngineType): string[] {
  // `--require-approval never` because the only stack here is the pipeline and its own support
  // resources; the approval that matters to a user is the one inside the pipeline, not this one.
  return ['run', 'cdk', 'deploy', '--all', '--require-approval', 'never'];
}

/** The environment `deploy-ci` exports so `cdk-cicd exec` renders the pipeline, not the app stacks. */
export function deployCiEnv(disposable: boolean): { [key: string]: string } {
  const out: { [key: string]: string } = { CDK_CICD_MODE: 'pipeline' };
  if (disposable) {
    out.CDK_CICD_DISPOSABLE = '1';
  }
  return out;
}

class Command implements yargs.CommandModule {
  public command = 'deploy-ci';
  public describe = 'Deploy the pipeline itself from cicd.config.ts';

  public builder(args: yargs.Argv) {
    return args.option('disposable', {
      type: 'boolean',
      default: false,
      describe: "Delete the pipeline's artifact bucket and key with the stack (for throwaway pipelines)",
    });
  }

  public async handler(args: yargs.Arguments) {
    const cwd = process.cwd();
    // Route by which config the repo carries: a `cicd.config.ts` provisions the CI pipeline; a
    // `deploy.config.ts` (Repo 2, config-only) provisions the CD pipeline. cicd.config wins if both exist.
    // Loaded here to fail fast with our own message rather than a wrapped child-process error.
    let kind: 'ci' | 'cd';
    let engine: EngineType | undefined;
    const cicd = loadCicdConfig(cwd);
    if (cicd !== undefined) {
      kind = 'ci';
      engine = cicd.engine;
    } else if (loadDeployment(cwd) !== undefined) {
      kind = 'cd';
    } else {
      logger.error('cdk-cicd deploy-ci: no cicd.config.ts or deploy.config.ts found next to cdk.json');
      process.exit(1);
    }

    const disposable = args.disposable as boolean;
    logger.info(
      `cdk-cicd deploy-ci: provisioning the ${kind === 'cd' ? 'CD (deploy.config)' : `CI (cicd.config, engine=${engine})`} pipeline`,
    );
    const deploy = spawnSync('npm', deployCiArgs(kind, engine), {
      stdio: 'inherit',
      cwd,
      env: { ...process.env, ...deployCiEnv(disposable) },
    });
    if (deploy.error) {
      logger.error(`cdk-cicd deploy-ci: could not run cdk deploy: ${deploy.error.message}`);
      process.exit(1);
    }
    if (deploy.status !== 0) {
      logger.error('cdk-cicd deploy-ci: deploying the pipeline failed');
      process.exit(deploy.status ?? 1);
    }
  }
}

export default new Command();
