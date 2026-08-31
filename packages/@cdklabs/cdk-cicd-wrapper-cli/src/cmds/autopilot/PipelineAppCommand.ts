// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// `cdk-cicd pipeline-app` -- synthesize the app that contains the pipeline itself. It exists so that
// `deploy-ci` (and each self-mutating engine's in-pipeline self-mutation `synth` step) has something to
// hand `cdk --app`, which is what keeps pipeline provisioning zero-touch: the user's repository needs no
// `bin/pipeline.ts` and no wrapper import. It is a thin shim on purpose -- it reads `cicd.config.ts` and
// delegates to the constructs package, where the whole construct tree stays on the single copy of
// aws-cdk-lib the user's project already has.
//
// Engine routing: the flat CodePipeline engine renders through `PipelineApp` (the jsii-exported App
// subclass, also the documented `new PipelineApp({ config }).synth()` opt-in). The self-mutating engines
// (CDK Pipelines, GitHub Actions) render through the assembler, which REPLAYS the user's plain `bin`
// entry once per stage -- the app IS the pipeline. The assembler is a runtime-only module (dynamic
// require + require.cache manipulation), so it is reached via the compiled `lib/` deep path rather than
// the jsii-exported package entry, exactly as `cdk-cicd exec` reaches `register.js`.

import * as fs from 'fs';
import * as path from 'path';
import type { EngineType } from '@cdklabs/cdk-cicd-wrapper';
import * as yargs from 'yargs';
import { load as loadCicdConfig } from './CicdConfig';
import { logger } from '../../utils/Logging';

// The self-mutating engines, compared as plain strings so this file keeps a type-only wrapper import and
// does not load the enum object (which pulls in aws-cdk-lib) at CLI boot.
const SELF_MUTATING_ENGINES: string[] = ['cdk-pipelines', 'github-actions'];

/**
 * The user's plain `bin` entry to replay for a self-mutating pipeline. `cdk.json`'s `app` command is
 * `npx cdk-cicd exec <entry>`, so the entry is the last token after `exec`. `--entry` overrides it for
 * the rare app whose `cdk.json` names the command differently.
 */
export function resolveEntry(cwd: string, override?: string): string {
  if (override !== undefined && override.length > 0) {
    return override;
  }
  const cdkJson = path.join(cwd, 'cdk.json');
  if (fs.existsSync(cdkJson)) {
    try {
      const app = JSON.parse(fs.readFileSync(cdkJson, 'utf-8')).app as string | undefined;
      // Match `... cdk-cicd exec <entry> ...`; the entry is the token right after `exec`.
      const m = app?.match(/cdk-cicd\s+exec\s+(\S+)/);
      if (m) {
        return m[1];
      }
    } catch {
      // fall through to the error below
    }
  }
  throw new Error(
    "cdk-cicd pipeline-app: cannot determine the app entry to replay for a self-mutating engine. Ensure " +
      "cdk.json's `app` is `npx cdk-cicd exec <entry>`, or pass --entry <entry>.",
  );
}

class Command implements yargs.CommandModule {
  public command = 'pipeline-app';
  public describe = 'Synthesize the pipeline app (what deploy-ci passes to cdk --app)';

  public builder(args: yargs.Argv) {
    return args
      .option('disposable', {
        type: 'boolean',
        default: false,
        describe: "Delete the pipeline's artifact bucket and key with the stack (for throwaway pipelines)",
      })
      .option('entry', {
        type: 'string',
        describe: 'The app entry to replay for a self-mutating engine (defaults to cdk.json app `cdk-cicd exec <entry>`)',
      });
  }

  public async handler(args: yargs.Arguments) {
    const cwd = process.cwd();
    const config = loadCicdConfig(cwd);
    if (config === undefined) {
      logger.error('cdk-cicd pipeline-app: no cicd.config.ts found next to cdk.json');
      process.exit(1);
    }

    const engine = config.engine as EngineType | undefined;
    const engineValue = engine as string | undefined;

    if (engineValue !== undefined && SELF_MUTATING_ENGINES.includes(engineValue)) {
      // The app IS the pipeline: replay the user's bin per stage. Reached via the compiled runtime
      // module deep path (not the jsii-exported entry) because the assembler is runtime-only.
      const entry = resolveEntry(cwd, args.entry as string | undefined);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { assemblePipelineApp } = require('@cdklabs/cdk-cicd-wrapper/lib/runtime/pipeline-assembler');
      assemblePipelineApp(config, path.resolve(cwd, entry)).synth();
      return;
    }

    // The flat CodePipeline engine: one stack, rendered by the jsii-exported PipelineApp. Imported here
    // rather than at module load: this is the only path that needs aws-cdk-lib, and an eager import would
    // put its load time on every `cdk-cicd` invocation, checks included.
    const { PipelineApp } = await import('@cdklabs/cdk-cicd-wrapper');
    new PipelineApp({ config, disposable: args.disposable as boolean }).synth();
  }
}

export default new Command();
