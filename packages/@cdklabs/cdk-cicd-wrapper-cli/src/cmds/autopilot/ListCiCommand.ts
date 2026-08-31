// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// `cdk-cicd list-ci` -- list the stacks (and a resource-type breakdown) of the PIPELINE app that
// `deploy-ci` would provision, without leaving a cloud assembly behind. The quick pre-flight inventory:
// "what stacks/resources does my pipeline actually contain?" answered from the same `pipeline-app`
// renderer `deploy-ci` uses, so the list matches what would be deployed.
//
// It synthesizes into a throwaway temp directory (an App must synth to read its templates) and removes
// it afterwards, so a bare `list-ci` never clobbers the working tree's `cdk.out`.

import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import * as yargs from 'yargs';
import { renderPipelineApp } from './PipelineAppCommand';
import { logger } from '../../utils/Logging';

/** A per-stack resource-type -> count breakdown, for a glanceable inventory of what will be deployed. */
export function resourceCounts(template: { Resources?: { [id: string]: { Type?: string } } }): {
  [type: string]: number;
} {
  const counts: { [type: string]: number } = {};
  for (const res of Object.values(template.Resources ?? {})) {
    const type = res.Type ?? '(unknown)';
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
}

class Command implements yargs.CommandModule {
  public command = 'list-ci';
  public describe = 'List the pipeline app stacks and resource types (pre-flight inventory for deploy-ci)';

  public builder(args: yargs.Argv) {
    return args
      .option('entry', {
        type: 'string',
        describe:
          'The app entry to replay for a self-mutating engine (defaults to cdk.json app `cdk-cicd exec <entry>`)',
      })
      .option('resources', {
        type: 'boolean',
        default: false,
        describe: 'Also print a per-stack resource-type breakdown',
      });
  }

  public async handler(args: yargs.Arguments) {
    const cwd = process.cwd();
    // Synth into a throwaway dir so a bare `list-ci` never touches the working tree's cdk.out.
    const outdir = mkdtempSync(path.join(tmpdir(), 'cdk-cicd-list-ci-'));
    const prev = process.env.CDK_OUTDIR;
    process.env.CDK_OUTDIR = outdir;
    try {
      const app = await renderPipelineApp(cwd, { entry: args.entry as string | undefined });
      const assembly = app.synth();
      logger.info(`cdk-cicd list-ci: the pipeline app contains ${assembly.stacks.length} stack(s):`);
      for (const stack of assembly.stacks) {
        const total = Object.keys((stack.template as { Resources?: object }).Resources ?? {}).length;
        logger.info(`  - ${stack.stackName} (${total} resource(s))`);
        if (args.resources) {
          const counts = resourceCounts(stack.template as { Resources?: { [id: string]: { Type?: string } } });
          for (const type of Object.keys(counts).sort()) {
            logger.info(`      ${counts[type]}x ${type}`);
          }
        }
      }
    } catch (error) {
      logger.error(`cdk-cicd list-ci: ${(error as Error).message}`);
      process.exit(1);
    } finally {
      if (prev === undefined) delete process.env.CDK_OUTDIR;
      else process.env.CDK_OUTDIR = prev;
      rmSync(outdir, { recursive: true, force: true });
    }
  }
}

export default new Command();
