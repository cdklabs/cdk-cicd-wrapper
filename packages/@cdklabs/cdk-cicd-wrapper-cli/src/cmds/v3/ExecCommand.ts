// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { AppConfig, ConfigErrorKind } from '@cdklabs/cdk-cicd-wrapper';
import * as yargs from 'yargs';
import { load as loadCicdConfig, stageByName } from './CicdConfig';
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
// as EXEC_FLAG; the constructs package exports these as DEPLOY_ROLE_FLAG / CFN_EXEC_ROLE_FLAG).
const DEPLOY_ROLE_FLAG = 'CDK_CICD_DEPLOY_ROLE_ARN';
const CFN_EXEC_ROLE_FLAG = 'CDK_CICD_CFN_EXEC_ROLE_ARN';

/** Env vars carrying the active stage's forced deploy/CFN-exec roles, if it configured any. */
export function forcedRoleEnv(cicdStage?: { deployment?: { deployRole?: string; cfnExecutionRole?: string } }): {
  [key: string]: string;
} {
  const out: { [key: string]: string } = {};
  const deployment = cicdStage?.deployment;
  if (deployment?.deployRole) {
    out[DEPLOY_ROLE_FLAG] = deployment.deployRole;
  }
  if (deployment?.cfnExecutionRole) {
    out[CFN_EXEC_ROLE_FLAG] = deployment.cfnExecutionRole;
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
 * Resolve the deploy target's account/region by precedence: an already-set `CDK_DEFAULT_*` wins,
 * then the matching cicd.config stage, then the app-config `aws.*`. The already-set case is what lets
 * `cdk-cicd synth`/`deploy` FIX a per-region target and have it survive exec -- exec fills a missing
 * target but never overrides one the caller pinned (required for multi-region). An absent value stays
 * absent, so an env-agnostic app stays agnostic.
 */
export function resolveEnvTarget(
  envIn: NodeJS.ProcessEnv,
  appConfig: { [key: string]: any },
  cicdStage?: CicdStageEnv,
): { account?: string; region?: string } {
  const aws = appConfig?.aws ?? {};
  return {
    account: firstNonEmpty(envIn.CDK_DEFAULT_ACCOUNT, cicdStage?.env?.account, aws.accountId),
    region: firstNonEmpty(envIn.CDK_DEFAULT_REGION, cicdStage?.env?.regions?.[0], aws.region),
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
function loadConfig(stage: string): { [key: string]: any } {
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
    const config = loadConfig(stage);
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
    const target = resolveEnvTarget(process.env, config, cicdStage);

    const registerPath = require.resolve('@cdklabs/cdk-cicd-wrapper/lib/v3/runtime/register.js');
    const nodeArgs = [...preloadArgs(entry, registerPath), entry];

    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...stageEnv(stage, target),
      ...forcedRoleEnv(cicdStage),
      CDK_CONTEXT_JSON: buildContextJson(config, process.env, cwd),
      [EXEC_FLAG]: '1',
    };

    logger.info(`cdk-cicd exec: stage='${stage}', running ${entry} under the injection hook`);
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
