// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// `cdk-cicd pipeline-app` -- synthesize the app that contains the pipeline itself. It exists so that
// `deploy-ci` has something to hand `cdk --app`, which is what keeps pipeline provisioning zero-touch:
// the user's repository needs no `bin/pipeline.ts` and no wrapper import. It is a thin shim on
// purpose -- it reads `cicd.config.ts` and delegates to `PipelineApp` in the constructs package, where
// the whole construct tree stays on the single copy of aws-cdk-lib the user's project already has.

import * as yargs from 'yargs';
import { load as loadCicdConfig } from './CicdConfig';
import { logger } from '../../utils/Logging';

class Command implements yargs.CommandModule {
  public command = 'pipeline-app';
  public describe = 'Synthesize the pipeline app (what deploy-ci passes to cdk --app)';

  public builder(args: yargs.Argv) {
    return args.option('disposable', {
      type: 'boolean',
      default: false,
      describe: "Delete the pipeline's artifact bucket and key with the stack (for throwaway pipelines)",
    });
  }

  public async handler(args: yargs.Arguments) {
    const config = loadCicdConfig(process.cwd());
    if (config === undefined) {
      logger.error('cdk-cicd pipeline-app: no cicd.config.ts found next to cdk.json');
      process.exit(1);
    }

    // Imported here rather than at module load: this is the only command that needs aws-cdk-lib, and
    // an eager import would put its load time on every `cdk-cicd` invocation, checks included.
    const { PipelineApp } = await import('@cdklabs/cdk-cicd-wrapper');
    new PipelineApp({ config, disposable: args.disposable as boolean }).synth();
  }
}

export default new Command();
