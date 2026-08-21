// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// `cdk-cicd deployment-app` -- synthesize the app that contains the CD (deploy-side) pipeline of the
// container two-repo split. The deploy-side twin of `pipeline-app`: `deploy-ci` hands this to `cdk --app`
// when the repo is a Repo 2 config repo (`deploy.config.ts` with a `repository`). A thin shim that reads
// the deployment config and delegates to `DeploymentPipelineApp` in the constructs package.

import * as yargs from 'yargs';
import { loadDeployment } from './CicdConfig';
import { logger } from '../../utils/Logging';

class Command implements yargs.CommandModule {
  public command = 'deployment-app';
  public describe = 'Synthesize the CD pipeline app (what deploy-ci passes to cdk --app for a deploy.config.ts)';

  public builder(args: yargs.Argv) {
    return args.option('disposable', {
      type: 'boolean',
      default: false,
      describe: "Delete the CD pipeline's artifact bucket and key with the stack (for throwaway pipelines)",
    });
  }

  public async handler(args: yargs.Arguments) {
    const config = loadDeployment(process.cwd());
    if (config === undefined) {
      logger.error('cdk-cicd deployment-app: no deploy.config.ts found next to cdk.json');
      process.exit(1);
    }
    if (config.repository === undefined) {
      logger.error(
        'cdk-cicd deployment-app: deploy.config.ts needs a `repository` to provision a CD pipeline ' +
          '(the config-only source repo). Add it, or use `cdk-cicd deploy --from-image` to run locally.',
      );
      process.exit(1);
    }

    // Imported lazily -- only this command needs aws-cdk-lib; an eager import would tax every invocation.
    const { DeploymentPipelineApp } = await import('@cdklabs/cdk-cicd-wrapper');
    new DeploymentPipelineApp({ config, disposable: args.disposable as boolean }).synth();
  }
}

export default new Command();
