// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// `cdk-cicd synth-ci` -- synthesize the PIPELINE the way `deploy-ci` would provision it, WITHOUT
// deploying. The safe pre-flight for `deploy-ci`: it runs the SAME single entry point (`cdk.json`'s
// `cdk-cicd exec`) with `CDK_CICD_MODE=pipeline` set, so it renders exactly what `deploy-ci` will
// provision -- no `--app` override, no separate renderer command. The templates land in the CDK
// output directory so you can inspect the assembly or `cdk diff` it before the irreversible provision.
//
// Distinct from `cdk-cicd synth`, which synthesizes the deploy-time APPLICATION stacks per (stage x
// region). `synth-ci` is the pipeline side.

import { spawnSync } from 'child_process';
import * as yargs from 'yargs';
import { logger } from '../../utils/Logging';

class Command implements yargs.CommandModule {
  public command = 'synth-ci';
  public describe = 'Synthesize the pipeline (dry-run of deploy-ci, no deploy)';

  public builder(args: yargs.Argv) {
    return args
      .option('output', {
        type: 'string',
        describe: 'Directory to write the pipeline cloud assembly to (defaults to cdk.out)',
      })
      .option('disposable', {
        type: 'boolean',
        default: false,
        describe: 'Render the pipeline as disposable (matches `deploy-ci --disposable`)',
      });
  }

  public async handler(args: yargs.Arguments) {
    const cwd = process.cwd();
    const output = args.output as string | undefined;
    // Same entry point and mode signal as deploy-ci, but `cdk synth` (no deploy). `npm run cdk`, never
    // npx, so the project's pinned aws-cdk is used.
    const cdkArgs = ['run', 'cdk', 'synth', '--all'];
    if (output !== undefined && output.length > 0) {
      cdkArgs.push('--output', output);
    }
    const env: { [key: string]: string } = { ...process.env, CDK_CICD_MODE: 'pipeline' } as { [key: string]: string };
    if (args.disposable as boolean) {
      env.CDK_CICD_DISPOSABLE = '1';
    }
    const result = spawnSync('npm', cdkArgs, { stdio: 'inherit', cwd, env });
    if (result.error) {
      logger.error(`cdk-cicd synth-ci: could not run cdk synth: ${result.error.message}`);
      process.exit(1);
    }
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
    logger.info('cdk-cicd synth-ci: review the assembly above, then run `cdk-cicd deploy-ci` to provision it');
  }
}

export default new Command();
