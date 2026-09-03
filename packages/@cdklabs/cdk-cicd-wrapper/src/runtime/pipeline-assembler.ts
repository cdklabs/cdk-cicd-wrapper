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

import { readFileSync } from 'fs';
import * as path from 'path';
import { App, AppProps, DefaultStackSynthesizer, Environment, Stack, Stage } from 'aws-cdk-lib';
import {
  applyWrapper,
  appExportTargets,
  assertAppModuleLayout,
  CFN_EXEC_ROLE_FLAG,
  DEPLOY_ROLE_EXTERNAL_ID_FLAG,
  DEPLOY_ROLE_FLAG,
  patchAppExports,
  resolveSynthesizer,
  restoreAppExports,
  wrapperApplied,
  wrapperRuntimeConfig,
  WRAPPER_CONFIG_CONTEXT_KEY,
} from './inject';
import { AppConfig } from '../appconfig/accessor';
import { ConfigErrorKind } from '../appconfig/error';
import { EngineType, ResolvedCicdConfig, SynthesizerType } from '../config/types';
import {
  CdkPipelinesEngine,
  CdkPipelinesStageContext,
  IStageProvider,
} from '../engine/cdkpipelines/CdkPipelinesEngine';
import { GitHubActionsEngine } from '../engine/github/GitHubActionsEngine';

/** Name used when the config names no application (mirrors PipelineApp). */
const DEFAULT_APPLICATION = 'cdk-cicd';
const SECRET_REF_PREFIX = 'resolve:secretsmanager:';

interface ReplayCdkBindings {
  /** Every export object whose `App` property must point at the replay stand-in. */
  readonly appExportTargets: object[];
  /** One private default-synthesizer context key per distinct aws-cdk-lib copy. */
  readonly synthesizerContextKeys: string[];
}

/**
 * Every distinct aws-cdk-lib copy reachable from the ENTRY, this module, and the cwd. For each copy,
 * collect both the App export targets and that copy's randomized private default-synthesizer context
 * key. A monorepo can load Stack from one copy and Stage from another; setting every key on the replay
 * Stage makes each Stack constructor observe the same stage-specific synthesizer.
 */
function replayCdkBindings(entryResolved: string): ReplayCdkBindings {
  const seen = new Set<string>();
  const targets: object[] = [];
  const synthesizerContextKeys: string[] = [];
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
    const cdkVersion = (JSON.parse(readFileSync(pkgJson, 'utf8')) as { version?: unknown }).version;
    assertAppModuleLayout(mod, String(cdkVersion));
    for (const target of appExportTargets(root, mod)) {
      if (!targets.includes(target)) targets.push(target);
    }
    // App stores its default synthesizer under a deliberately randomized private context key. Read the
    // key from this exact aws-cdk-lib copy so a Stack imported from it can find our replay override.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const privateContext = require(path.join(root, 'core', 'lib', 'private', 'private-context.js')) as {
      PRIVATE_CONTEXT_DEFAULT_STACK_SYNTHESIZER?: unknown;
    };
    if (typeof privateContext.PRIVATE_CONTEXT_DEFAULT_STACK_SYNTHESIZER !== 'string') {
      throw new Error(
        `cdk-cicd: aws-cdk-lib ${String(cdkVersion)} no longer exposes the private ` +
          'default-stack-synthesizer context key required for self-mutating replay.',
      );
    }
    synthesizerContextKeys.push(privateContext.PRIVATE_CONTEXT_DEFAULT_STACK_SYNTHESIZER);
  }
  return { appExportTargets: targets, synthesizerContextKeys };
}

/**
 * Forced-role environment for one replayed stage. The register preload uses the same variables for
 * flat-engine application synthesis; replay sets them while constructing this stage's stacks and
 * installs the resulting synthesizer in the replay Stage's context.
 */
export function replayForcedRoleEnv(config: ResolvedCicdConfig, stageName: string): Record<string, string> {
  const stage = config.stages.find((candidate) => candidate.name === stageName);
  const deployment = stage?.deployment;
  const env: Record<string, string> = {};
  if (deployment?.deployRole !== undefined && deployment.deployRole.trim().length > 0) {
    env[DEPLOY_ROLE_FLAG] = deployment.deployRole;
  }
  if (deployment?.cfnExecutionRole !== undefined && deployment.cfnExecutionRole.trim().length > 0) {
    env[CFN_EXEC_ROLE_FLAG] = deployment.cfnExecutionRole;
  }

  // An ExternalId has semantics only for a forced deploy-role assumption. Secret references are
  // resolved by `cdk-cicd exec` before it invokes the synchronous assembler; a direct assembler call
  // must fail rather than passing the reference string to STS as though it were the ExternalId.
  if (env[DEPLOY_ROLE_FLAG] !== undefined) {
    const externalId = deployment?.externalId ?? config.deployRoleExternalId;
    if (externalId?.startsWith(SECRET_REF_PREFIX)) {
      throw new Error(
        `cdk-cicd: stage '${stageName}' has an unresolved Secrets Manager externalId reference. ` +
          'Render the pipeline through `cdk-cicd exec` so the reference is resolved before replay.',
      );
    }
    if (externalId !== undefined && externalId.trim().length > 0) {
      env[DEPLOY_ROLE_EXTERNAL_ID_FLAG] = externalId;
    }
  }
  return env;
}

function setOrDeleteEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

/**
 * Stack construction reads a private context key created independently by each aws-cdk-lib copy.
 * Install this stage's synthesizer under every discovered key before the entry creates children.
 * Explicit per-Stack synthesizers still win, while ordinary stacks carry this stage's forced roles.
 */
function installReplaySynthesizer(stage: Stage, config: ResolvedCicdConfig, synthesizerContextKeys: string[]): void {
  if (stage.node.children.length > 0) {
    throw new Error(
      `cdk-cicd: replay stage '${stage.node.id}' already has children, so its stage-specific ` +
        'synthesizer cannot be installed before stack construction.',
    );
  }
  const synthesizer = resolveSynthesizer(wrapperRuntimeConfig(config as unknown as Record<string, unknown>));
  for (const key of synthesizerContextKeys) {
    stage.node.setContext(key, synthesizer);
  }
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
function replayEntryInto(
  entry: string,
  stage: Stage,
  context: CdkPipelinesStageContext,
  config: ResolvedCicdConfig,
): void {
  const resolved = require.resolve(entry);
  const bindings = replayCdkBindings(resolved);
  if (bindings.appExportTargets.length === 0) {
    throw new Error(`cdk-cicd: cannot resolve aws-cdk-lib from '${entry}' to replay it into the pipeline stage.`);
  }

  const prevStage = process.env.CDK_STAGE;
  const prevAccount = process.env.CDK_DEFAULT_ACCOUNT;
  const prevRegion = process.env.CDK_DEFAULT_REGION;
  const prevDeployRole = process.env[DEPLOY_ROLE_FLAG];
  const prevCfnExecRole = process.env[CFN_EXEC_ROLE_FLAG];
  const prevExternalId = process.env[DEPLOY_ROLE_EXTERNAL_ID_FLAG];
  const forcedRoleEnv = replayForcedRoleEnv(config, context.stageName);

  // `new cdk.App()` in the entry yields this stage. A NON-derived class may return an object from its
  // constructor with no super() (TS forbids that in a derived constructor -- TS2377), so no throwaway App
  // is built. `synth()` is stubbed to a no-op for the rare bin that calls `app.synth()` explicitly -- the
  // pipeline synthesizes the stage.
  const hadOwnSynth = Object.prototype.hasOwnProperty.call(stage, 'synth');
  const originalSynth = Reflect.get(stage, 'synth');
  const ReplayApp = class {
    public constructor(_props?: AppProps) {
      return stage;
    }
  };
  // Inherit `App`'s statics -- above all `App.of`. `ReplayApp` replaces the exported `App` on every
  // target below, so any aws-cdk-lib code that reaches for a static through the export slot resolves it
  // on `ReplayApp`, not the real `App`. The construct-synth warning path does exactly that: emitting a
  // warning (e.g. a NodejsFunction bundling notice, or any `Annotations.of(scope).addWarningV2(...)`)
  // runs `Acknowledgements.of(scope)` -> `App.of(scope)`, which on some aws-cdk-lib versions (confirmed
  // on 2.195.0 and 2.255.0) reads `App` from a patched slot and calls `.of` on it. A bare `ReplayApp`
  // has no statics, so that throws `App.of is not a function` and aborts the replay. Setting `App` as
  // its prototype makes `ReplayApp.of` (and every other `App` static) delegate to the real `App`.
  // Instances are unaffected: the constructor still returns `stage`.
  Object.setPrototypeOf(ReplayApp, App);
  // Object.defineProperty, not a plain assignment: on newer aws-cdk-lib, the `aws-cdk-lib`/
  // `aws-cdk-lib/core` re-exports self-memoize into a non-writable value on first read (see
  // appExportTargets), and a plain assignment silently no-ops against that -- the entry's
  // `new cdk.App()` would then build a real, unpatched App instead of landing in `stage`.
  let originals: Map<object, PropertyDescriptor | undefined> | undefined;

  try {
    process.env.CDK_STAGE = context.stageName;
    // An omitted account/region is environment-agnostic and must retain the ambient credential
    // target, matching the pre-replay behaviour. Concrete stage values override it for this replay.
    if (context.env.account !== undefined) process.env.CDK_DEFAULT_ACCOUNT = context.env.account;
    if (context.env.region !== undefined) process.env.CDK_DEFAULT_REGION = context.env.region;
    setOrDeleteEnv(DEPLOY_ROLE_FLAG, forcedRoleEnv[DEPLOY_ROLE_FLAG]);
    setOrDeleteEnv(CFN_EXEC_ROLE_FLAG, forcedRoleEnv[CFN_EXEC_ROLE_FLAG]);
    setOrDeleteEnv(DEPLOY_ROLE_EXTERNAL_ID_FLAG, forcedRoleEnv[DEPLOY_ROLE_EXTERNAL_ID_FLAG]);
    installReplaySynthesizer(stage, config, bindings.synthesizerContextKeys);
    Reflect.set(stage, 'synth', () => undefined);
    originals = patchAppExports(bindings.appExportTargets, ReplayApp);
    delete require.cache[resolved];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require(resolved);
  } finally {
    if (originals !== undefined) restoreAppExports(originals);
    if (hadOwnSynth) Reflect.set(stage, 'synth', originalSynth);
    else Reflect.deleteProperty(stage, 'synth');
    restoreEnv('CDK_STAGE', prevStage);
    restoreEnv('CDK_DEFAULT_ACCOUNT', prevAccount);
    restoreEnv('CDK_DEFAULT_REGION', prevRegion);
    restoreEnv(DEPLOY_ROLE_FLAG, prevDeployRole);
    restoreEnv(CFN_EXEC_ROLE_FLAG, prevCfnExecRole);
    restoreEnv(DEPLOY_ROLE_EXTERNAL_ID_FLAG, prevExternalId);
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
export function replayStageProvider(entry: string, config: ResolvedCicdConfig): IStageProvider {
  return {
    stacks(stage: Stage, context: CdkPipelinesStageContext): void {
      replayEntryInto(entry, stage, context, config);
    },
  };
}

/** Load the same per-stage application config as `cdk-cicd exec`, tolerating a missing file as `{}`. */
function stageApplicationConfig(stageName: string): Record<string, unknown> {
  try {
    return AppConfig.load({ stage: stageName }) as Record<string, unknown>;
  } catch (error) {
    if ((error as { kind?: string }).kind === ConfigErrorKind.MISSING_FILE) {
      return {};
    }
    throw error;
  }
}

/**
 * Build the self-mutating app: one pipeline stack whose stages are filled by `provider`. Split from
 * `assemblePipelineApp` so the pipeline structure is unit-testable with a stub provider (the replay
 * itself is a subprocess/real-node concern -- jest's module registry does not honour `require.cache`).
 * Both self-mutating engines share this replay mechanism (every stage needs its stacks built as a
 * `cdk.Stage` inside one synth); `config.engine` picks which one renders the stages `provider` builds.
 */
export function buildPipelineApp(config: ResolvedCicdConfig, provider: IStageProvider): App {
  if (config.synthesizer.type === SynthesizerType.APP_STAGING) {
    throw new Error(
      'cdk-cicd: SynthesizerType.APP_STAGING is not supported by the CDK_PIPELINES or ' +
        'GITHUB_ACTIONS engines in the pinned alpha module. Use the default CODEPIPELINE engine or ' +
        'SynthesizerType.DEFAULT.',
    );
  }
  const runtimeConfig = wrapperRuntimeConfig(config as unknown as Record<string, unknown>);
  // The pipeline stack itself always uses the standard bootstrap roles. The configured application
  // synthesizer is installed on each replay Stage; APP_STAGING is rejected above because the pinned
  // alpha explicitly does not support CDK Pipelines.
  const app = new App({
    defaultStackSynthesizer: new DefaultStackSynthesizer({ qualifier: config.qualifier }),
  });
  const wrappedProvider: IStageProvider = {
    stacks(stage: Stage, context: CdkPipelinesStageContext): void {
      const appConfig = stageApplicationConfig(context.stageName);
      // Set both contexts before the provider creates children: user code can call AppConfig.of()
      // during construction, while attach()/the wrapper see pipeline-owned controls separately.
      stage.node.setContext(AppConfig.CONTEXT_KEY, appConfig);
      stage.node.setContext(WRAPPER_CONFIG_CONTEXT_KEY, runtimeConfig);
      provider.stacks(stage, context);
      // A bundled/explicit entry may already have called CdkCicd.attach(stage). Avoid applying the
      // same custom plugins twice; normal replay reaches this branch and receives stage-specific tags
      // and plugin configuration.
      if (!wrapperApplied(stage)) {
        applyWrapper(stage, appConfig);
      }
    },
  };
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
    new GitHubActionsEngine(stack, 'Cd', { config, pipelineName: constructId, stages: wrappedProvider });
  } else {
    new CdkPipelinesEngine(stack, 'Cd', { config, pipelineName: constructId, stages: wrappedProvider });
  }
  // Apply the same configured/default wrapper plugin set as the flat-engine preload, after replay has
  // populated every stage (and registered any custom plugins on its App stand-in).
  applyWrapper(app, runtimeConfig, { skipAppliedDescendants: true });
  return app;
}

/**
 * Assemble the whole self-mutating app: one pipeline stack whose stages are the user's plain entry
 * replayed per configured stage. Run by `cdk-cicd exec` when engine === CDK_PIPELINES or
 * GITHUB_ACTIONS; the entry path comes from the `CDK_CICD_ENTRY` env var the CLI sets.
 */
export function assemblePipelineApp(config: ResolvedCicdConfig, entry: string): App {
  return buildPipelineApp(config, replayStageProvider(entry, config));
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
