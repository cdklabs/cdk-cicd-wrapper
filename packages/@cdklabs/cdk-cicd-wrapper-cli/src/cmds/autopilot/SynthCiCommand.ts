// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// `cdk-cicd synth-ci` -- synthesize the PIPELINE app (the CI/CD pipeline itself) to a cloud assembly
// without deploying it. It is the safe pre-flight for `deploy-ci`: it renders exactly what `deploy-ci`
// would provision (same engine routing, same `pipeline-app` renderer) and writes the templates to a
// directory so you can inspect the assembly, diff it against what is live, or feed it to `cdk diff`
// before running the irreversible provision.
//
// Distinct from `cdk-cicd synth`, which synthesizes the deploy-time APPLICATION stacks per (stage x
// region). `synth-ci` is the pipeline side -- one stack (flat engine) or the self-mutating pipeline
// (cdk-pipelines/github-actions).

import * as path from 'path';
import * as yargs from 'yargs';
import { renderPipelineApp } from './PipelineAppCommand';
import { logger } from '../../utils/Logging';

class Command implements yargs.CommandModule {
  public command = 'synth-ci';
  public describe = 'Synthesize the pipeline app to a cloud assembly (dry-run of deploy-ci, no deploy)';

  public builder(args: yargs.Argv) {
    return args
      .option('output', {
        type: 'string',
        default: 'cdk.out',
        describe: 'Directory to write the pipeline cloud assembly to',
      })
      .option('disposable', {
        type: 'boolean',
        default: false,
        describe: 'Render the pipeline as disposable (matches `deploy-ci --disposable`)',
      })
      .option('entry', {
        type: 'string',
        describe:
          'The app entry to replay for a self-mutating engine (defaults to cdk.json app `cdk-cicd exec <entry>`)',
      });
  }

  public async handler(args: yargs.Arguments) {
    const cwd = process.cwd();
    const outdir = path.resolve(cwd, args.output as string);
    try {
      // Pin the output dir the same way the CDK CLI would, so `App.synth()` writes there. `renderPipelineApp`
      // constructs the App; setting the env before synth() (not construction) is enough since aws-cdk-lib
      // reads CDK_OUTDIR at synth time.
      const prev = process.env.CDK_OUTDIR;
      process.env.CDK_OUTDIR = outdir;
      try {
        const app = await renderPipelineApp(cwd, {
          disposable: args.disposable as boolean,
          entry: args.entry as string | undefined,
        });
        const assembly = app.synth();
        const stacks = assembly.stacks.map((s) => s.stackName);
        logger.info(`cdk-cicd synth-ci: wrote the pipeline assembly to ${outdir}`);
        logger.info(`cdk-cicd synth-ci: ${stacks.length} stack(s): ${stacks.join(', ')}`);
        logger.info('cdk-cicd synth-ci: review the assembly above, then run `cdk-cicd deploy-ci` to provision it');
      } finally {
        if (prev === undefined) delete process.env.CDK_OUTDIR;
        else process.env.CDK_OUTDIR = prev;
      }
    } catch (error) {
      logger.error(`cdk-cicd synth-ci: ${(error as Error).message}`);
      process.exit(1);
    }
  }
}

export default new Command();
