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
 *   3. merge app and wrapper config into separate CDK_CONTEXT_JSON keys WITHOUT clobbering user context,
 *   4. spawn the user entry under the register preload so App is subclassed at construction.
 *
 * The account/region export, context key, and diagnostic-arming flag are a contract with the
 * constructs package's runtime hook (see the CDK_CICD_EXEC note below).
 */

/** The wrapper's config context key. Mirrors AppConfig.CONTEXT_KEY. */
const CONFIG_CONTEXT_KEY = 'cicd:config';
/** Wrapper-owned runtime context, kept separate so AppConfig.of() returns only stage application data. */
const WRAPPER_CONFIG_CONTEXT_KEY = 'cicd:wrapper';
/** Repo 2 container target account; authoritative over every account baked into the deployer image. */
const ACCOUNT_OVERRIDE_FLAG = 'CDK_CICD_ACCOUNT_OVERRIDE';
/** Repo 2 container target region; authoritative over every region baked into the deployer image. */
const REGION_OVERRIDE_FLAG = 'CDK_CICD_REGION_OVERRIDE';

// Arms the bundled-app diagnostic in the register preload. This literal is the runtime contract with
// the constructs package's inject.ts EXEC_FLAG; kept in sync by the test asserting they match, and
// tracked as finding code-review-exec-flag-cross-package-literal until it has a shared home.
const EXEC_FLAG = 'CDK_CICD_EXEC';

// The forced-role env vars the preload's resolveSynthesizer reads (same cross-package literal contract
// as EXEC_FLAG; the constructs package exports these as DEPLOY_ROLE_FLAG / CFN_EXEC_ROLE_FLAG /
// DEPLOY_ROLE_EXTERNAL_ID_FLAG).
export const DEPLOY_ROLE_FLAG = 'CDK_CICD_DEPLOY_ROLE_ARN';
export const CFN_EXEC_ROLE_FLAG = 'CDK_CICD_CFN_EXEC_ROLE_ARN';
export const DEPLOY_ROLE_EXTERNAL_ID_FLAG = 'CDK_CICD_DEPLOY_ROLE_EXTERNAL_ID';

/** Prefix marking a config value as a Secrets Manager reference to resolve at exec time. */
const SECRET_REF_PREFIX = 'resolve:secretsmanager:';

/**
 * Resolve a deploy-role ExternalId value: a literal is returned as-is; a `resolve:secretsmanager:<arn>`
 * reference is fetched from Secrets Manager (the `SecretString`) at exec time. Undefined/blank -> undefined.
 *
 * Secret references use the AWS CLI already required by the wrapper's deployment workflows. Arguments
 * are passed without a shell, the full JSON response is parsed, and failures name the referenced secret
 * without ever logging its value. A reader can be injected for deterministic unit tests.
 */
export async function resolveExternalId(
  value?: string,
  readSecret: (secretId: string) => string | Promise<string> = readSecretStringFromAwsCli,
): Promise<string | undefined> {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) return undefined;
  if (!trimmed.startsWith(SECRET_REF_PREFIX)) return trimmed;
  const secretId = trimmed.slice(SECRET_REF_PREFIX.length);
  if (secretId.length === 0) {
    throw new Error('cdk-cicd exec: resolve:secretsmanager: externalId reference is missing a secret id');
  }
  const secret = await readSecret(secretId);
  if (secret.length === 0) {
    throw new Error(`cdk-cicd exec: secret '${secretId}' for the deploy-role externalId has no SecretString`);
  }
  return secret;
}

/**
 * Read a Secrets Manager `SecretString` through AWS CLI v2/v1. Kept synchronous because exec must
 * finish resolving the role contract before it starts the child CDK process.
 */
export function readSecretStringFromAwsCli(secretId: string, runner: typeof spawnSync = spawnSync): string {
  const arnRegion = /^arn:[^:]+:secretsmanager:([^:]+):/.exec(secretId)?.[1];
  const args = ['secretsmanager', 'get-secret-value', '--secret-id', secretId, '--output', 'json'];
  if (arnRegion !== undefined) {
    args.push('--region', arnRegion);
  }
  const result = runner('aws', args, {
    encoding: 'utf-8',
    env: { ...process.env, AWS_PAGER: '' },
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error !== undefined) {
    throw new Error(
      `cdk-cicd exec: could not run AWS CLI to resolve Secrets Manager secret '${secretId}': ` +
        `${result.error.message}. Install/configure the AWS CLI or provide a literal externalId.`,
    );
  }
  if (result.status !== 0) {
    const detail = String(result.stderr ?? '').trim();
    throw new Error(
      `cdk-cicd exec: AWS CLI could not read Secrets Manager secret '${secretId}'` +
        (detail.length > 0 ? `: ${detail}` : ` (exit ${String(result.status)})`),
    );
  }

  let response: { SecretString?: unknown };
  try {
    response = JSON.parse(String(result.stdout ?? '')) as { SecretString?: unknown };
  } catch {
    throw new Error(`cdk-cicd exec: AWS CLI returned invalid JSON for Secrets Manager secret '${secretId}'`);
  }
  if (typeof response.SecretString !== 'string' || response.SecretString.length === 0) {
    throw new Error(`cdk-cicd exec: secret '${secretId}' for the deploy-role externalId has no SecretString`);
  }
  return response.SecretString;
}

/**
 * Env vars carrying the active stage's forced deploy/CFN-exec roles and deploy-role ExternalId, if any.
 * The ExternalId is the stage's own `deployment.externalId` when set, else the pipeline-level
 * `deployRoleExternalId` default; either may be a literal or a `resolve:secretsmanager:<arn>` reference.
 */
export async function forcedRoleEnv(
  cicdStage?: { deployment?: { deployRole?: string; cfnExecutionRole?: string; externalId?: string } },
  pipelineDeployRoleExternalId?: string,
  overrides: NodeJS.ProcessEnv = {},
): Promise<{ [key: string]: string }> {
  const out: { [key: string]: string } = {};
  const deployment = cicdStage?.deployment;
  const hasOverride = (name: string): boolean => Object.prototype.hasOwnProperty.call(overrides, name);
  const deployRole = hasOverride(DEPLOY_ROLE_FLAG)
    ? firstNonEmpty(overrides[DEPLOY_ROLE_FLAG])
    : firstNonEmpty(deployment?.deployRole);
  const cfnExecutionRole = hasOverride(CFN_EXEC_ROLE_FLAG)
    ? firstNonEmpty(overrides[CFN_EXEC_ROLE_FLAG])
    : firstNonEmpty(deployment?.cfnExecutionRole);

  if (deployRole !== undefined) {
    out[DEPLOY_ROLE_FLAG] = deployRole;
  }
  if (cfnExecutionRole !== undefined) {
    out[CFN_EXEC_ROLE_FLAG] = cfnExecutionRole;
  }

  // Repo 2 resolves ExternalId references before launching Docker and passes the resolved value in the
  // environment. Presence is authoritative, including an empty value that explicitly clears image-baked
  // configuration. Do not feed an override back through resolveExternalId: a secret's literal value may
  // itself begin with `resolve:secretsmanager:`.
  if (deployRole !== undefined) {
    const externalId = hasOverride(DEPLOY_ROLE_EXTERNAL_ID_FLAG)
      ? firstNonEmpty(overrides[DEPLOY_ROLE_EXTERNAL_ID_FLAG])
      : await resolveExternalId(deployment?.externalId ?? pipelineDeployRoleExternalId);
    if (externalId !== undefined) {
      out[DEPLOY_ROLE_EXTERNAL_ID_FLAG] = externalId;
    }
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
 *   1. `CDK_CICD_ACCOUNT_OVERRIDE` / `CDK_CICD_REGION_OVERRIDE` (Repo 2's authoritative target)
 *   2. the chosen app-config file's `aws.accountId` / `aws.region`
 *   3. the matching `cicd.config` stage's `env.account` / `env.regions[0]`
 *   4. the per-stage `ACCOUNT_<STAGE>` / `REGION_<STAGE>` env vars (populated from SSM by the synth
 *      step's warming commands, or set by hand)
 *   5. the ambient `CDK_DEFAULT_ACCOUNT` / `CDK_DEFAULT_REGION`
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
  const hasAccountOverride = Object.prototype.hasOwnProperty.call(envIn, ACCOUNT_OVERRIDE_FLAG);
  const hasRegionOverride = Object.prototype.hasOwnProperty.call(envIn, REGION_OVERRIDE_FLAG);
  return {
    account: hasAccountOverride
      ? firstNonEmpty(envIn[ACCOUNT_OVERRIDE_FLAG], envIn.CDK_DEFAULT_ACCOUNT)
      : firstNonEmpty(aws.accountId, cicdStage?.env?.account, accountEnv, envIn.CDK_DEFAULT_ACCOUNT),
    region: hasRegionOverride
      ? firstNonEmpty(envIn[REGION_OVERRIDE_FLAG], envIn.CDK_DEFAULT_REGION, envIn.AWS_REGION, envIn.AWS_DEFAULT_REGION)
      : firstNonEmpty(aws.region, cicdStage?.env?.regions?.[0], regionEnv, envIn.CDK_DEFAULT_REGION),
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
 * then adds the app config under `cicd:config` and the wrapper-owned config under `cicd:wrapper`.
 * User-set values at either key are never clobbered, and no other context key is touched.
 */
export function buildContextJson(
  config: { [key: string]: any },
  wrapperConfig: { [key: string]: any },
  env: NodeJS.ProcessEnv,
  cwd: string,
): string {
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
  if (Object.keys(wrapperConfig).length > 0 && !(WRAPPER_CONFIG_CONTEXT_KEY in base)) {
    base[WRAPPER_CONFIG_CONTEXT_KEY] = wrapperConfig;
  }
  return JSON.stringify(base);
}

/** Select only wrapper-owned cicd.config fields for the separate runtime context. */
export function wrapperRuntimeConfig(cicd?: ResolvedCicdConfig): { [key: string]: any } {
  if (cicd === undefined) return {};
  const config: { [key: string]: any } = {
    application: cicd.application,
    qualifier: cicd.qualifier,
    synthesizer: cicd.synthesizer,
    plugins: cicd.plugins,
  };
  return Object.fromEntries(Object.entries(config).filter(([, value]) => value !== undefined));
}

/**
 * Resolve stage ExternalIds before the synchronous self-mutating assembler replays the application.
 * Each stage receives an explicit resolved value, and the top-level fallback is cleared so replay can
 * never accidentally pass a `resolve:secretsmanager:` marker to STS as the literal ExternalId.
 */
export async function resolvePipelineExternalIds(
  cicd: ResolvedCicdConfig,
  resolver: (value?: string) => Promise<string | undefined> = resolveExternalId,
): Promise<ResolvedCicdConfig> {
  const cache = new Map<string, Promise<string | undefined>>();
  const resolveOnce = (value?: string): Promise<string | undefined> => {
    if (value === undefined) return Promise.resolve(undefined);
    const cached = cache.get(value);
    if (cached !== undefined) return cached;
    const pending = resolver(value);
    cache.set(value, pending);
    return pending;
  };

  const stages = await Promise.all(
    cicd.stages.map(async (stage) => {
      if (stage.deployment?.deployRole === undefined || stage.deployment.deployRole.trim().length === 0) {
        return stage;
      }
      const externalId = await resolveOnce(stage.deployment.externalId ?? cicd.deployRoleExternalId);
      return {
        ...stage,
        deployment: {
          ...stage.deployment,
          externalId,
        },
      };
    }),
  );
  return { ...cicd, stages, deployRoleExternalId: undefined };
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
    const resolvedCicd = await resolvePipelineExternalIds(cicd);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { assemblePipelineApp } = require('@cdklabs/cdk-cicd-wrapper/lib/runtime/pipeline-assembler');
    assemblePipelineApp(resolvedCicd, path.resolve(cwd, entry)).synth();
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
        process.env,
      )),
      CDK_CONTEXT_JSON: buildContextJson(config, wrapperRuntimeConfig(cicd), process.env, cwd),
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
