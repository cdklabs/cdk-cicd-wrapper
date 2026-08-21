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
import * as yargs from 'yargs';
import { load as loadCicdConfig, loadDeployment } from './CicdConfig';
import { logger } from '../../utils/Logging';

/**
 * The `--app` value: the CDK CLI shells this out and reads the assembly it writes. `pipeline-app` renders
 * the CI pipeline from `cicd.config.ts`; `deployment-app` renders the CD pipeline from `deploy.config.ts`.
 */
export function pipelineAppCommand(disposable: boolean, kind: 'ci' | 'cd' = 'ci'): string {
  const cmd = kind === 'cd' ? 'deployment-app' : 'pipeline-app';
  return `npx cdk-cicd ${cmd}${disposable ? ' --disposable' : ''}`;
}

/** The `cdk` argv that deploys the pipeline stack (CI from cicd.config, or CD from deploy.config). */
export function deployCiArgs(disposable: boolean, kind: 'ci' | 'cd' = 'ci'): string[] {
  // `--require-approval never` because the only stack here is the pipeline and its own support
  // resources; the approval that matters to a user is the one inside the pipeline, not this one.
  return ['cdk', 'deploy', '--app', pipelineAppCommand(disposable, kind), '--all', '--require-approval', 'never'];
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
    if (loadCicdConfig(cwd) !== undefined) {
      kind = 'ci';
    } else if (loadDeployment(cwd) !== undefined) {
      kind = 'cd';
    } else {
      logger.error('cdk-cicd deploy-ci: no cicd.config.ts or deploy.config.ts found next to cdk.json');
      process.exit(1);
    }

    const disposable = args.disposable as boolean;
    logger.info(`cdk-cicd deploy-ci: provisioning the ${kind === 'cd' ? 'CD (deploy.config)' : 'CI (cicd.config)'} pipeline`);
    const deploy = spawnSync('npx', deployCiArgs(disposable, kind), { stdio: 'inherit', cwd });
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
