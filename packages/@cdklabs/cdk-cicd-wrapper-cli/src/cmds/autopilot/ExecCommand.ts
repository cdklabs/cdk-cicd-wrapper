// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import type { EngineType, ResolvedCicdConfig } from '@cdklabs/cdk-cicd-wrapper';
import * as yargs from 'yargs';
import { TS_NODE_COMPILER_OPTIONS, load as loadCicdConfig, loadDeployment, stageByName } from './CicdConfig';
import { logger } from '../../utils/Logging';

/**
 * The wrapper-owned `cdk.json` `app` command: `npx cdk-cicd exec bin/app.ts`. It is the thing that
 * turns an untouched `cdk init` app into a wrapped one with zero edits to bin/:
 *   1. resolve the active stage's config (the app-config layer),
 *   2. export the stage's account/region so the stock `env: { account: process.env.CDK_DEFAULT_ACCOUNT, ... }`
 *      line resolves the right target -- no `cfg.aws.*` reference in the user's code,
 *   3. merge the config into CDK_CONTEXT_JSON as `cicd:config` WITHOUT clobbering user context,
 *   4. spawn the user entry under the register preload so App is subclassed at construction.
 *
 * The account/region export, context key, and diagnostic-arming flag are a contract with the
 * constructs package's runtime hook (see the CDK_CICD_EXEC note below).
 */

/** The wrapper's config context key. Mirrors AppConfig.CONTEXT_KEY. */
const CONFIG_CONTEXT_KEY = 'cicd:config';

// Arms the bundled-app diagnostic in the register preload. This literal is the runtime contract with
// the constructs package's inject.ts EXEC_FLAG; kept in sync by the test asserting they match, and
// tracked as finding code-review-exec-flag-cross-package-literal until it has a shared home.
const EXEC_FLAG = 'CDK_CICD_EXEC';

// The forced-role env vars the preload's resolveSynthesizer reads (same cross-package literal contract
// as EXEC_FLAG; the constructs package exports these as DEPLOY_ROLE_FLAG / CFN_EXEC_ROLE_FLAG /
// DEPLOY_ROLE_EXTERNAL_ID_FLAG).
const DEPLOY_ROLE_FLAG = 'CDK_CICD_DEPLOY_ROLE_ARN';
const CFN_EXEC_ROLE_FLAG = 'CDK_CICD_CFN_EXEC_ROLE_ARN';
const DEPLOY_ROLE_EXTERNAL_ID_FLAG = 'CDK_CICD_DEPLOY_ROLE_EXTERNAL_ID';

/** Prefix marking a config value as a Secrets Manager reference to resolve at exec time. */
const SECRET_REF_PREFIX = 'resolve:secretsmanager:';

/**
 * Resolve a deploy-role ExternalId value: a literal is returned as-is; a `resolve:secretsmanager:<arn>`
 * reference is fetched from Secrets Manager (the `SecretString`) at exec time. Undefined/blank -> undefined.
 *
 * The `@aws-sdk/client-secrets-manager` client is loaded through an UNTYPED dynamic import on purpose: it
 * is not a declared build dependency (adding it drags a nested `@smithy/*` that conflicts with the CLI's
 * hoisted copy and breaks `tsc --build`). The AWS SDK v3 is ambient in the pipeline/CI runtime where a
 * `resolve:secretsmanager:` reference is actually used; a literal externalId needs no SDK at all. Kept
 * async and isolated so the import is only paid for when a secret reference is present.
 */
export async function resolveExternalId(value?: string): Promise<string | undefined> {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) return undefined;
  if (!trimmed.startsWith(SECRET_REF_PREFIX)) return trimmed;
  const secretId = trimmed.slice(SECRET_REF_PREFIX.length);
  const moduleName = '@aws-sdk/client-secrets-manager';
  // Untyped import (see the doc comment): tsc must not load this client's .d.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdk: any = await import(moduleName).catch(() => {
    throw new Error(
      `cdk-cicd exec: resolving '${trimmed}' needs @aws-sdk/client-secrets-manager, which is not available ` +
        'in this environment. Provide the deploy-role externalId as a literal, or run where the AWS SDK v3 is present.',
    );
  });
  const client = new sdk.SecretsManager({});
  const res = await client.getSecretValue({ SecretId: secretId });
  const secret: string | undefined = res.SecretString;
  if (secret === undefined || secret.length === 0) {
    throw new Error(`cdk-cicd exec: secret '${secretId}' for the deploy-role externalId has no SecretString`);
  }
  return secret;
}

/**
 * Env vars carrying the active stage's forced deploy/CFN-exec roles and deploy-role ExternalId, if any.
 * The ExternalId is the stage's own `deployment.externalId` when set, else the pipeline-level
 * `deployRoleExternalId` default; either may be a literal or a `resolve:secretsmanager:<arn>` reference.
 */
export async function forcedRoleEnv(
  cicdStage?: { deployment?: { deployRole?: string; cfnExecutionRole?: string; externalId?: string } },
  pipelineDeployRoleExternalId?: string,
): Promise<{ [key: string]: string }> {
  const out: { [key: string]: string } = {};
  const deployment = cicdStage?.deployment;
  if (deployment?.deployRole) {
    out[DEPLOY_ROLE_FLAG] = deployment.deployRole;
  }
  if (deployment?.cfnExecutionRole) {
    out[CFN_EXEC_ROLE_FLAG] = deployment.cfnExecutionRole;
  }
  // Per-stage externalId overrides the pipeline-level default. Only meaningful with a forced deployRole,
  // but resolved whenever configured -- an externalId without a deployRole is a harmless no-op downstream.
  const externalId = await resolveExternalId(deployment?.externalId ?? pipelineDeployRoleExternalId);
  if (externalId !== undefined) {
    out[DEPLOY_ROLE_EXTERNAL_ID_FLAG] = externalId;
  }
  return out;
}

/** The active stage: `CDK_STAGE` when set and non-blank, else the plain-`cdk deploy` `local` stage. */
export function resolveStage(env: NodeJS.ProcessEnv): string {
  return (env.CDK_STAGE ?? '').trim() || 'local';
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.length > 0) {
      return v;
    }
  }
  return undefined;
}

/** A stage's target environment, from whichever cicd.config stage matched (region list flattened). */
export interface CicdStageEnv {
  readonly env?: { readonly account?: string; readonly regions?: string[] };
}

/**
 * Resolve the inner-loop deploy target's account/region by precedence (highest first):
 *
 *   1. the chosen app-config file's `aws.accountId` / `aws.region`
 *   2. the matching `cicd.config` stage's `env.account` / `env.regions[0]`
 *   3. the per-stage `ACCOUNT_<STAGE>` / `REGION_<STAGE>` env vars (populated from SSM by the synth
 *      step's warming commands, or set by hand)
 *   4. the ambient `CDK_DEFAULT_ACCOUNT` / `CDK_DEFAULT_REGION`
 *
 * This is the INNER-LOOP resolution only (a plain `cdk deploy`/`synth` running one target). The
 * self-mutating pipeline REPLAY path does not come through here: the assembler
 * (`runtime/pipeline-assembler`) pins `CDK_DEFAULT_*` per stage in its own process and re-runs the
 * entry, so a replayed stage's target is fixed by the assembler and never resolved by this function --
 * which is why moving `CDK_DEFAULT_*` to the bottom here is safe for multi-region pipelines.
 *
 * `<STAGE>` is the resolved stage name uppercased (`resolveStage`). An absent value at every rung stays
 * absent, so an env-agnostic app stays agnostic.
 */
export function resolveEnvTarget(
  envIn: NodeJS.ProcessEnv,
  appConfig: { [key: string]: any },
  cicdStage?: CicdStageEnv,
  stage?: string,
): { account?: string; region?: string } {
  const aws = appConfig?.aws ?? {};
  const stageKey = (stage ?? '').trim().toUpperCase();
  const accountEnv = stageKey.length > 0 ? envIn[`ACCOUNT_${stageKey}`] : undefined;
  const regionEnv = stageKey.length > 0 ? envIn[`REGION_${stageKey}`] : undefined;
  return {
    account: firstNonEmpty(aws.accountId, cicdStage?.env?.account, accountEnv, envIn.CDK_DEFAULT_ACCOUNT),
    region: firstNonEmpty(aws.region, cicdStage?.env?.regions?.[0], regionEnv, envIn.CDK_DEFAULT_REGION),
  };
}

/**
 * The environment exec exports. `CDK_STAGE` always; the resolved account/region go into both the
 * `CDK_DEFAULT_*` pair (what the stock `cdk init` env line reads) and the `CDK_DEPLOY_*` pair. Absent
 * values are not exported.
 */
export function stageEnv(stage: string, target: { account?: string; region?: string }): { [key: string]: string } {
  const out: { [key: string]: string } = { CDK_STAGE: stage };
  if (target.account !== undefined) {
    out.CDK_DEFAULT_ACCOUNT = target.account;
    out.CDK_DEPLOY_ACCOUNT = target.account;
  }
  if (target.region !== undefined) {
    out.CDK_DEFAULT_REGION = target.region;
    out.CDK_DEPLOY_REGION = target.region;
  }
  return out;
}

/**
 * Build the `CDK_CONTEXT_JSON` value the spawned app will read. Starts from whatever context already
 * exists -- the CLI sets `CDK_CONTEXT_JSON` from `cdk.json` + `cdk.context.json` + `--context` when it
 * invokes the app command; when exec is run standalone, fall back to reading those files ourselves --
 * then adds `cicd:config`. A user-set `cicd:config` is never clobbered, and no other user context key
 * is touched.
 */
export function buildContextJson(config: { [key: string]: any }, env: NodeJS.ProcessEnv, cwd: string): string {
  let base: { [key: string]: any } = {};

  const existing = env.CDK_CONTEXT_JSON;
  if (existing !== undefined && existing.length > 0) {
    base = safeParseObject(existing);
  } else {
    // Replicate the CLI's merge order: cdk.json `context` first, then cdk.context.json overrides it.
    base = {
      ...readJsonObject(path.join(cwd, 'cdk.json')).context,
      ...readJsonObject(path.join(cwd, 'cdk.context.json')),
    };
  }

  if (!(CONFIG_CONTEXT_KEY in base)) {
    base[CONFIG_CONTEXT_KEY] = config;
  }
  return JSON.stringify(base);
}

function safeParseObject(raw: string): { [key: string]: any } {
  try {
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readJsonObject(file: string): { [key: string]: any } {
  if (!existsSync(file)) {
    return {};
  }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8'));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Load and fully resolve the stage's config. A stage with no config file is tolerated: an empty
 * config is injected (so `AppConfig.of` returns `{}` rather than re-reading and throwing MISSING_FILE),
 * i.e. the app runs un-configured, not un-wrapped.
 */
async function loadConfig(stage: string): Promise<{ [key: string]: any }> {
  // Lazily import the wrapper only when a command that needs it actually runs, so booting the CLI
  // for a wrapper-free command (license, security-scan, check-dependencies, validate) never loads it.
  const { AppConfig, ConfigErrorKind } = await import('@cdklabs/cdk-cicd-wrapper');
  try {
    return AppConfig.load({ stage });
  } catch (error) {
    if ((error as { kind?: string }).kind === ConfigErrorKind.MISSING_FILE) {
      return {};
    }
    throw error;
  }
}

/** The require-preloads for the entry: the register hook always, ts-node first for a `.ts` entry. */
export function preloadArgs(entry: string, registerPath: string): string[] {
  const args: string[] = [];
  if (entry.endsWith('.ts')) {
    args.push('-r', 'ts-node/register');
  }
  args.push('-r', registerPath);
  return args;
}

/**
 * The node argv for the child. Every engine runs the plain user entry directly under the register
 * preload: in the default (application) mode, `cdk.json`'s single `app` command (`cdk-cicd exec`)
 * synthesizes the APPLICATION stacks for all three engines. The pipeline is synthesized by the SAME
 * `exec` entry point when `CDK_CICD_MODE=pipeline` is set in the environment (by `deploy-ci`, and by
 * each self-mutating engine's in-pipeline synth step) -- there is no `--app` override and no separate
 * renderer command. `exec` reads the mode in its handler and takes the pipeline-render path directly;
 * this function only builds the plain-bin (application) invocation.
 *
 * `engine` is retained in the signature because the caller resolves it from cicd.config anyway, and a
 * future engine could reintroduce a per-engine entry shape; today it is unused.
 */
export function execInvocation(
  entry: string,
  _engine: EngineType | undefined,
  paths: { registerPath: string },
): { nodeArgs: string[]; entryEnv?: string } {
  return { nodeArgs: [...preloadArgs(entry, paths.registerPath), entry] };
}

/**
 * The wrapper's synth-mode signal, inherited from the invoking command through the process
 * environment (the same channel CDK uses for `CDK_DEFAULT_*`). `deploy-ci` and each self-mutating
 * engine's in-pipeline synth step export `CDK_CICD_MODE=pipeline` before running `cdk`; a plain
 * `cdk synth`/`cdk deploy` leaves it unset and gets the application stacks. This is what keeps
 * `cdk.json` to a SINGLE `app` entry (`npm run cdk-cicd exec <entry>`) with no `--app` override.
 */
export const MODE_FLAG = 'CDK_CICD_MODE';
export const PIPELINE_MODE = 'pipeline';

/** True when the environment asks `exec` to render the pipeline itself rather than the app stacks. */
export function isPipelineMode(env: NodeJS.ProcessEnv): boolean {
  return (env[MODE_FLAG] ?? '').trim() === PIPELINE_MODE;
}

/**
 * Render the pipeline itself (CDK_CICD_MODE=pipeline). Same construct tree `deploy-ci` provisions.
 * Routes on which config the repo carries and, for CI, on the engine:
 *   - CI (cicd.config): flat CodePipeline engine -> the jsii-exported `PipelineApp`; the self-mutating
 *     engines -> the runtime assembler (reached via the compiled `lib/` deep path, since it is a
 *     dynamic-require/require.cache module not jsii-exported), replaying the SAME `entry` bin per stage.
 *   - CD (deploy.config, container two-repo mode): `DeploymentPipelineApp`.
 * Runs in this process (no spawn) so the assembly lands in the cwd the CDK CLI is reading.
 */
async function renderPipeline(entry: string, cicd: ResolvedCicdConfig | undefined, cwd: string): Promise<void> {
  const disposable = (process.env.CDK_CICD_DISPOSABLE ?? '').trim() === '1';

  if (cicd === undefined) {
    // No cicd.config -> a CD (deploy.config) config repo. Render the deployment pipeline.
    const deployment = loadDeployment(cwd);
    if (deployment === undefined) {
      throw new Error('no cicd.config.ts or deploy.config.ts found next to cdk.json');
    }
    const { DeploymentPipelineApp } = await import('@cdklabs/cdk-cicd-wrapper');
    new DeploymentPipelineApp({ config: deployment, disposable }).synth();
    return;
  }

  const engineValue = cicd.engine as string | undefined;
  if (engineValue === 'cdk-pipelines' || engineValue === 'github-actions') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { assemblePipelineApp } = require('@cdklabs/cdk-cicd-wrapper/lib/runtime/pipeline-assembler');
    assemblePipelineApp(cicd, path.resolve(cwd, entry)).synth();
    return;
  }
  const { PipelineApp } = await import('@cdklabs/cdk-cicd-wrapper');
  new PipelineApp({ config: cicd, disposable }).synth();
}

class Command implements yargs.CommandModule {
  public command = 'exec <app>';
  public describe = 'Run a CDK app under the cdk-cicd-wrapper injection hook (the cdk.json `app` command)';

  public builder(args: yargs.Argv) {
    return args.positional('app', {
      type: 'string',
      describe: 'The CDK app entry point to run, e.g. bin/app.ts',
      demandOption: true,
    });
  }

  public async handler(args: yargs.Arguments) {
    const entry = args.app as string;
    const cwd = process.cwd();
    const stage = resolveStage(process.env);

    // Two layers: app-config drives the injected cicd:config context (the app tree); the cicd.config
    // stage supplies the deploy target account/region when the caller has not already pinned one.
    const config = await loadConfig(stage);
    // A broken cicd.config must not take down the zero-touch path: exec runs on every `cdk deploy`,
    // and a single-region app may not depend on the pipeline config at all. Warn and fall through to
    // app-config resolution rather than aborting the app command.
    let cicd;
    try {
      cicd = loadCicdConfig(cwd);
    } catch (error) {
      logger.warn(
        `cdk-cicd exec: ignoring an unloadable cicd.config (${(error as Error).message}); ` +
          'resolving the deploy target from app-config only',
      );
    }
    const cicdStage = cicd ? stageByName(cicd, stage) : undefined;
    const target = resolveEnvTarget(process.env, config, cicdStage, stage);

    // Pipeline mode: `deploy-ci` (and each self-mutating engine's in-pipeline synth step) set
    // CDK_CICD_MODE=pipeline in the inherited environment. The SAME `exec` entry point then renders the
    // pipeline itself instead of the application stacks -- so `cdk.json` needs only one `app` command
    // and no `--app` override. Rendered in-process; the CDK CLI reads the resulting cdk.out.
    if (isPipelineMode(process.env)) {
      logger.info(`cdk-cicd exec: mode='pipeline', engine='${cicd?.engine ?? 'codepipeline'}', rendering the pipeline`);
      try {
        await renderPipeline(entry, cicd, cwd);
      } catch (error) {
        logger.error(`cdk-cicd exec: rendering the pipeline failed: ${(error as Error).message}`);
        process.exit(1);
      }
      return;
    }

    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...stageEnv(stage, target),
      ...(await forcedRoleEnv(
        cicdStage,
        (cicd as { deployRoleExternalId?: string } | undefined)?.deployRoleExternalId,
      )),
      CDK_CONTEXT_JSON: buildContextJson(config, process.env, cwd),
      // The `-r ts-node/register` preload takes no options, so the module kind has to come from the
      // environment. Same requirement as the config loader: the entry is `require`d, so it must
      // transpile to CommonJS or Node throws on the first `import` (see TS_NODE_COMPILER_OPTIONS).
      TS_NODE_COMPILER_OPTIONS: JSON.stringify(TS_NODE_COMPILER_OPTIONS),
      [EXEC_FLAG]: '1',
    };

    const invocation = execInvocation(entry, cicd?.engine, {
      registerPath: require.resolve('@cdklabs/cdk-cicd-wrapper/lib/runtime/register.js'),
    });
    const nodeArgs = invocation.nodeArgs;
    if (invocation.entryEnv !== undefined) {
      childEnv.CDK_CICD_ENTRY = invocation.entryEnv;
    }

    logger.info(`cdk-cicd exec: stage='${stage}', engine='${cicd?.engine ?? 'codepipeline'}', running ${entry}`);
    const result = spawnSync(process.execPath, nodeArgs, { stdio: 'inherit', env: childEnv, cwd });

    if (result.error) {
      throw result.error;
    }
    // Propagate the child's exit code verbatim -- the bundled-app diagnostic fails the child with a
    // non-zero code, and that must reach the CDK CLI.
    process.exit(result.status ?? 1);
  }
}

export default new Command();
