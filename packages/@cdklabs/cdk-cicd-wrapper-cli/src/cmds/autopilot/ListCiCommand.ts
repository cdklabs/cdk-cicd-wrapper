// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// `cdk-cicd list-ci` -- list the stacks (and a resource-type breakdown) of the PIPELINE that
// `deploy-ci` would provision, without leaving a cloud assembly behind. The quick pre-flight
// inventory, answered from the SAME single entry point (`cdk.json`'s `cdk-cicd exec`) run with
// `CDK_CICD_MODE=pipeline` -- so the list matches what would be deployed.
//
// It synthesizes into a throwaway temp directory (an assembly must exist to read its templates) and
// removes it afterwards, so a bare `list-ci` never clobbers the working tree's `cdk.out`.

import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import * as yargs from 'yargs';
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

/** The `*.template.json` files in a cloud assembly directory, as [stackName, template] pairs. */
function readAssemblyTemplates(outdir: string): Array<{ stackName: string; template: any }> {
  if (!existsSync(outdir)) {
    return [];
  }
  return readdirSync(outdir)
    .filter((f) => f.endsWith('.template.json'))
    .map((f) => ({
      stackName: f.replace(/\.template\.json$/, ''),
      template: JSON.parse(readFileSync(path.join(outdir, f), 'utf-8')),
    }));
}

class Command implements yargs.CommandModule {
  public command = 'list-ci';
  public describe = 'List the pipeline stacks and resource types (pre-flight inventory for deploy-ci)';

  public builder(args: yargs.Argv) {
    return args.option('resources', {
      type: 'boolean',
      default: false,
      describe: 'Also print a per-stack resource-type breakdown',
    });
  }

  public async handler(args: yargs.Arguments) {
    const cwd = process.cwd();
    // Synth into a throwaway dir so a bare `list-ci` never touches the working tree's cdk.out. Same
    // entry point + mode signal as deploy-ci; `npm run cdk`, never npx.
    const outdir = mkdtempSync(path.join(tmpdir(), 'cdk-cicd-list-ci-'));
    try {
      const result = spawnSync('npm', ['run', 'cdk', 'synth', '--all', '--output', outdir], {
        stdio: ['inherit', 'ignore', 'inherit'],
        cwd,
        env: { ...process.env, CDK_CICD_MODE: 'pipeline' },
      });
      if (result.error) {
        logger.error(`cdk-cicd list-ci: could not run cdk synth: ${result.error.message}`);
        process.exit(1);
      }
      if (result.status !== 0) {
        process.exit(result.status ?? 1);
      }

      const stacks = readAssemblyTemplates(outdir);
      logger.info(`cdk-cicd list-ci: the pipeline contains ${stacks.length} stack(s):`);
      for (const { stackName, template } of stacks) {
        const total = Object.keys((template as { Resources?: object }).Resources ?? {}).length;
        logger.info(`  - ${stackName} (${total} resource(s))`);
        if (args.resources) {
          const counts = resourceCounts(template as { Resources?: { [id: string]: { Type?: string } } });
          for (const type of Object.keys(counts).sort()) {
            logger.info(`      ${counts[type]}x ${type}`);
          }
        }
      }
    } finally {
      rmSync(outdir, { recursive: true, force: true });
    }
  }
}

export default new Command();
