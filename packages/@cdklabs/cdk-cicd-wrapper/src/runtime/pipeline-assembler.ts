// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Assembles the self-mutating pipeline (CDK Pipelines, or its GitHub Actions sibling) from a PLAIN user
// entry, with no wrapper code in that entry. This is the self-mutating half of the single-entry
// principle: `cdk-cicd exec bin/app.ts` reads `engine` from cicd.config and, when it is CDK_PIPELINES or
// GITHUB_ACTIONS, runs THIS module instead of the entry directly. The same run happens at `deploy-ci`
// provision time and inside the pipeline's own self-mutation `cdk synth`, so the pipeline reproduces itself.
//
// The mechanism: both engines need every stage built as a `cdk.Stage` inside one synth, but a plain
// `cdk init` bin builds only the ambient stage. So we REPLAY that bin once per configured stage --
// patch `new cdk.App()` to return the current `cdk.Stage`, pin the stage's env, bust the module cache,
// re-`require` the entry -- the same App-construction seam register.ts owns for the flat engine. Not
// jsii-exported: it uses dynamic require and module-level state, like register.ts.

import * as path from 'path';
import { App, Aspects, AppProps, Environment, Stack, Stage } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { appExportTargets, assertAppModuleLayout, patchAppExports, restoreAppExports } from './inject';
import { EngineType, ResolvedCicdConfig } from '../config/types';
import {
  CdkPipelinesEngine,
  CdkPipelinesStageContext,
  IStageProvider,
} from '../engine/cdkpipelines/CdkPipelinesEngine';
import { GitHubActionsEngine } from '../engine/github/GitHubActionsEngine';

/** Name used when the config names no application (mirrors PipelineApp). */
const DEFAULT_APPLICATION = 'cdk-cicd';

/**
 * Every place `App` is exported from every distinct aws-cdk-lib copy reachable from the ENTRY, this
 * module, and the cwd (leaf module + every re-export -- see `appExportTargets`). We must patch the
 * copy the ENTRY actually loads -- a monorepo/workspace can have a nested aws-cdk-lib next to the
 * entry AND one next to the wrapper, and Node caches by resolved path, so patching only one would
 * silently miss the entry's copy (its `new cdk.App()` would build a throwaway App and leave the stage
 * empty). Same strategy as register.ts's distinctCdkCopies. Direct file path bypasses the package
 * `exports` map (ERR_PACKAGE_PATH_NOT_EXPORTED).
 */
function appLeafModules(entryResolved: string): object[] {
  const seen = new Set<string>();
  const targets: object[] = [];
  for (const from of [path.dirname(entryResolved), __dirname, process.cwd()]) {
    let pkgJson: string;
    try {
      pkgJson = require.resolve('aws-cdk-lib/package.json', { paths: [from] });
    } catch {
      continue;
    }
    const root = path.dirname(pkgJson);
    if (seen.has(root)) continue;
    seen.add(root);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(path.join(root, 'core', 'lib', 'app.js')) as { App: new (props?: AppProps) => App };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    assertAppModuleLayout(mod, require(pkgJson).version);
    for (const target of appExportTargets(root, mod)) {
      if (!targets.includes(target)) targets.push(target);
    }
  }
  return targets;
}

/**
 * Build the user's stacks for one stage by replaying the plain entry into `stage`. While the entry runs,
 * `new cdk.App()` returns `stage` (a valid construct scope), so `new MyStack(app, …)` lands in the stage;
 * the entry's module cache is busted first so its top-level code runs again for this stage. The stage's
 * account/region are pinned on the environment so the entry's stock `env: { account:
 * process.env.CDK_DEFAULT_ACCOUNT, … }` line resolves this stage's target.
 *
 * LIMITATIONS a plain bin must respect: build your stacks at the TOP LEVEL of the entry (or in a function
 * the entry CALLS) -- construction in the top level of a *separately required* module runs only once
 * (Node caches transitive requires), so it lands in the first stage only. And inline `new cdk.App(props)`
 * props (context/synthesizer) are NOT honoured on replay -- pass context via cdk.json / CDK_CONTEXT_JSON
 * (which flows through the pipeline App and is inherited by every stage) instead. Both are enforced/eased
 * elsewhere: an empty stage throws a clear error below; cdk.json context is inherited.
 */
function replayEntryInto(entry: string, stage: Stage, context: CdkPipelinesStageContext): void {
  const resolved = require.resolve(entry);
  const targets = appLeafModules(resolved);
  if (targets.length === 0) {
    throw new Error(`cdk-cicd: cannot resolve aws-cdk-lib from '${entry}' to replay it into the pipeline stage.`);
  }

  const prevStage = process.env.CDK_STAGE;
  const prevAccount = process.env.CDK_DEFAULT_ACCOUNT;
  const prevRegion = process.env.CDK_DEFAULT_REGION;
  process.env.CDK_STAGE = context.stageName;
  if (context.env.account !== undefined) process.env.CDK_DEFAULT_ACCOUNT = context.env.account;
  if (context.env.region !== undefined) process.env.CDK_DEFAULT_REGION = context.env.region;

  // `new cdk.App()` in the entry yields this stage. A NON-derived class may return an object from its
  // constructor with no super() (TS forbids that in a derived constructor -- TS2377), so no throwaway App
  // is built. `synth()` is stubbed to a no-op for the rare bin that calls `app.synth()` explicitly -- the
  // pipeline synthesizes the stage.
  const hadOwnSynth = Object.prototype.hasOwnProperty.call(stage, 'synth');
  const originalSynth = Reflect.get(stage, 'synth');
  Reflect.set(stage, 'synth', () => undefined);
  const ReplayApp = class {
    public constructor(_props?: AppProps) {
      return stage;
    }
  };
  // Object.defineProperty, not a plain assignment: on newer aws-cdk-lib, the `aws-cdk-lib`/
  // `aws-cdk-lib/core` re-exports self-memoize into a non-writable value on first read (see
  // appExportTargets), and a plain assignment silently no-ops against that -- the entry's
  // `new cdk.App()` would then build a real, unpatched App instead of landing in `stage`.
  const originals = patchAppExports(targets, ReplayApp);

  try {
    delete require.cache[resolved];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require(resolved);
  } finally {
    restoreAppExports(originals);
    if (hadOwnSynth) Reflect.set(stage, 'synth', originalSynth);
    else Reflect.deleteProperty(stage, 'synth');
    restoreEnv('CDK_STAGE', prevStage);
    restoreEnv('CDK_DEFAULT_ACCOUNT', prevAccount);
    restoreEnv('CDK_DEFAULT_REGION', prevRegion);
  }

  // A stage with no stacks means the entry built nothing into it -- almost always because construction
  // lives in the top level of a transitively-required module (cached, runs once). Fail with a clear
  // pointer instead of CDK Pipelines' generic "stage should contain at least one Stack".
  if (stage.node.findAll().filter((c): c is Stack => c instanceof Stack).length === 0) {
    throw new Error(
      `cdk-cicd: replaying '${entry}' into stage '${context.stageName}' produced no stacks. Build your ` +
        'stacks at the top level of the entry, or in a function the entry calls -- not in the top level of ' +
        'a separately-required module (Node caches transitive requires, so that code runs only once).',
    );
  }
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

/** An IStageProvider that fills each pipeline stage by replaying the plain entry into it. */
export function replayStageProvider(entry: string): IStageProvider {
  return {
    stacks(stage: Stage, context: CdkPipelinesStageContext): void {
      replayEntryInto(entry, stage, context);
    },
  };
}

/**
 * Build the self-mutating app: one pipeline stack whose stages are filled by `provider`. Split from
 * `assemblePipelineApp` so the pipeline structure is unit-testable with a stub provider (the replay
 * itself is a subprocess/real-node concern -- jest's module registry does not honour `require.cache`).
 * Both self-mutating engines share this replay mechanism (every stage needs its stacks built as a
 * `cdk.Stage` inside one synth); `config.engine` picks which one renders the stages `provider` builds.
 */
export function buildPipelineApp(config: ResolvedCicdConfig, provider: IStageProvider): App {
  const app = new App();
  // The construct id stays `${application}-pipeline` regardless of any stack-name override: the
  // pipeline's child logical IDs derive from the construct node path (`<id>/Cd/Pipeline/…`), so
  // changing the id would churn every child logical ID. `pipelineStackName` overrides ONLY the
  // CloudFormation stackName, which is what lets an already-deployed self-mutating pipeline update in
  // place (its `SelfMutate` runs `cdk deploy <stackName>`) without a rename cutover.
  const constructId = `${config.application ?? DEFAULT_APPLICATION}-pipeline`;
  const stackName = config.pipelineStackName ?? constructId;
  // Ambient credentials win when present (a real `deploy-ci` run, or any locally-authenticated synth).
  // Falling back to the first stage's env keeps the pipeline stack's account/region reproducible when
  // no credentials are active -- e.g. the GitHub Actions engine's own self-mutation "Synthesize" job,
  // which runs `cdk synth` before assuming any role, and must render the SAME literal account each time
  // to pass cdk-pipelines-github's "commit the updated workflow file" check (a token there is never
  // stable across runs).
  const firstStage = config.stages[0];
  const stack = new Stack(app, constructId, {
    stackName,
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT ?? firstStage?.env.account,
      region: process.env.CDK_DEFAULT_REGION ?? firstStage?.env.regions[0],
    } as Environment,
  });
  // `pipelineName` is the construct id, not the (possibly overridden) stackName: the GitHub Actions
  // engine embeds it as a stable literal the "commit the updated workflow file" self-mutation check
  // compares across runs, so it must not vary with a CloudFormation stack-name override.
  if (config.engine === EngineType.GITHUB_ACTIONS) {
    new GitHubActionsEngine(stack, 'Cd', { config, pipelineName: constructId, stages: provider });
  } else {
    new CdkPipelinesEngine(stack, 'Cd', { config, pipelineName: constructId, stages: provider });
  }
  Aspects.of(app).add(new AwsSolutionsChecks({ verbose: false }));
  return app;
}

/**
 * Assemble the whole self-mutating app: one pipeline stack whose stages are the user's plain entry
 * replayed per configured stage. Run by `cdk-cicd exec` when engine === CDK_PIPELINES or
 * GITHUB_ACTIONS; the entry path comes from the `CDK_CICD_ENTRY` env var the CLI sets.
 */
export function assemblePipelineApp(config: ResolvedCicdConfig, entry: string): App {
  return buildPipelineApp(config, replayStageProvider(entry));
}

/**
 * Module entry point: when this file is the process's main module (the CLI runs it via `node -r
 * ts-node/register <this>`), load cicd.config from the cwd and assemble the pipeline. The App auto-synths
 * on process exit, exactly as a normal CDK app entry does.
 */
export function main(): void {
  const entry = process.env.CDK_CICD_ENTRY;
  if (entry === undefined || entry.length === 0) {
    throw new Error(
      'cdk-cicd: the CDK Pipelines assembler needs CDK_CICD_ENTRY set to the app entry (set by `cdk-cicd exec`).',
    );
  }
  // Load the resolved pipeline config from the user's cicd.config in the cwd (defineCICD default export).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const loaded = require(path.resolve(process.cwd(), 'cicd.config'));
  const config: ResolvedCicdConfig = loaded.default ?? loaded;
  assemblePipelineApp(config, path.resolve(process.cwd(), entry));
}

if (require.main === module) {
  main();
}
