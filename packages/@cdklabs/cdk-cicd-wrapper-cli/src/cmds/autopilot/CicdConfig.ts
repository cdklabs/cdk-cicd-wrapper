// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Discovery + loading of the pipeline config file (cicd.config.ts) that a user authors with
// defineCICD. This is the CICD-config layer -- the pipeline's stages/repo/roles -- consumed by the
// Autopilot CLI commands (synth/deploy). It is independent of the app-config layer (config/<stage>.json)
// that AppConfig injects into the construct tree.
//
// A missing file is not an error: it means Level 0 (a plain app with no pipeline), so callers get
// `undefined` and behave as if no wrapper pipeline was configured.

import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import type { ResolvedCicdConfig, ResolvedDeploymentConfig, ResolvedStage } from '@cdklabs/cdk-cicd-wrapper';

// Probe order. TypeScript is the primary authoring path (D-config-authoring); .js supports an
// already-compiled config. YAML pipeline config is a later addition (it needs a Repository
// reconstruction step and a yaml dep in the CLI) -- app-config YAML is separate and unaffected.
const CANDIDATES = ['cicd.config.ts', 'cicd.config.js'];

// Container mode (Repo 2): the deploy-side config `defineDeployment` produces, consumed by
// `deploy --from-image`. Same probe order as the pipeline config, a sibling file next to `cdk.json`.
const DEPLOYMENT_CANDIDATES = ['deploy.config.ts', 'deploy.config.js'];

/** The first of `candidates` that exists in `cwd`, as an absolute path, or undefined. */
function discoverIn(cwd: string, candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    // resolve, not join: a relative cwd must still yield an absolute path, or the later `require`
    // would treat a bare 'cicd.config.ts' as a node_modules module specifier rather than a file.
    const candidatePath = path.resolve(cwd, candidate);
    if (existsSync(candidatePath)) {
      return candidatePath;
    }
  }
  return undefined;
}

/** The path to the pipeline config next to `cdk.json`, or undefined when there is none (Level 0). */
export function discover(cwd: string): string | undefined {
  return discoverIn(cwd, CANDIDATES);
}

let tsNodeRegistered = false;

/**
 * ts-node compiler options for every `.ts` file the CLI loads -- the config here, and the app entry in
 * `cdk-cicd exec`. `module: commonjs` is NOT a preference, it is required: both are loaded with
 * `require()`, so ESM output throws "Cannot use import statement outside a module". Without this the
 * transpiled module kind comes from the project's tsconfig (or, with no tsconfig, from TypeScript's
 * target-derived default, which is ESM) and the config only loads on Node >= 22, where `require()` can
 * detect module syntax. CodeBuild's standard image runs Node 18, so an M4 pipeline failed here.
 *
 * Measured with ts-node loading the file: it works for a commonjs tsconfig (the older `cdk init`). It fails
 * one whose `module` is node16/nodenext (a current `cdk init` app) with TS5110 on TypeScript 5.9, so
 * `tsNodeCompilerOptions` leaves such a project's own `module` alone. It also fails a
 * `moduleResolution: bundler` tsconfig with TS5095, as it always has -- finding
 * `qa-ts-node-commonjs-override-breaks-bundler`. A project with `"type": "module"` cannot load a `.ts`
 * config either way -- see finding `qa-esm-project-cannot-load-ts-cicd-config`.
 */
export const TS_NODE_COMPILER_OPTIONS = { module: 'commonjs' };

/**
 * The ts-node compiler options for the project in `projectDir`, read with `compiler` (a TypeScript the
 * CLI can drive, see `typeScriptCompiler`). `TS_NODE_COMPILER_OPTIONS`, unchanged, for every project it
 * works for. No override for a project whose tsconfig sets `module` to node16/nodenext: those emit
 * CommonJS in a package without `"type": "module"` already, and `module: commonjs` next to their
 * NodeNext resolution is an error. An unreadable tsconfig keeps the long-standing override.
 */
export function tsNodeCompilerOptions(projectDir: string, compiler: string): { [option: string]: string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ts = require(compiler);
    const configFile: string | undefined = ts.findConfigFile(projectDir, ts.sys.fileExists, 'tsconfig.json');
    if (configFile !== undefined) {
      const read = ts.readConfigFile(configFile, ts.sys.readFile);
      const parsed = ts.parseJsonConfigFileContent(read.config ?? {}, ts.sys, path.dirname(configFile));
      const module: number | undefined = parsed.options.module;
      if (module !== undefined && module >= ts.ModuleKind.Node16 && module <= ts.ModuleKind.NodeNext) return {};
    }
  } catch {
    // Fall through to the long-standing override.
  }
  return { ...TS_NODE_COMPILER_OPTIONS };
}

/**
 * The ts-node preload for a project's `.ts` app entry: the project's own ts-node, as before, or the
 * CLI's when the project has none (a current `cdk init` app runs on `tsx` and does not install it).
 */
export function tsNodeRegister(projectDir: string): string {
  try {
    return require.resolve('ts-node/register', { paths: [projectDir] });
  } catch {
    return require.resolve('ts-node/register');
  }
}

/**
 * The TypeScript compiler ts-node uses for a project's `.ts` files: the project's own when ts-node can
 * drive it, else the CLI's. ts-node needs the classic compiler API, which TypeScript 7 no longer ships
 * ("Cannot read properties of undefined (reading 'fileExists')"), and a current `cdk init` app installs
 * TypeScript 7. The project's own stays preferred because the CLI's TypeScript 6 no longer includes
 * `@types/*` unless a tsconfig lists `types`, which older templates do not.
 */
export function typeScriptCompiler(projectDir: string): string {
  try {
    const manifest = require.resolve('typescript/package.json', { paths: [projectDir] });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const major = Number(String(require(manifest).version).split('.')[0]);
    if (major < 7) return require.resolve('typescript', { paths: [projectDir] });
  } catch {
    // No TypeScript in the project: use the CLI's.
  }
  return require.resolve('typescript');
}

/**
 * Register ts-node once (for a `.ts` config) and `require` `file`, returning its `default` export. The
 * file is loaded in-process via ts-node (the same transpiler the app entry uses), so the user writes
 * exactly one config file with no build step. Shared by the pipeline config and the deployment config.
 */
function requireConfigFile<T>(file: string): T {
  if (file.endsWith('.ts') && !tsNodeRegistered) {
    try {
      // Transpile only. Type-checking a config file builds a full TypeScript program over aws-cdk-lib's
      // declarations, which costs ~1 GB per process; `synth` and `exec` each load the config and stay
      // resident while their children run, so on a 3 GB CodeBuild instance the app process was being
      // OOM-killed. defineCICD/defineDeployment validate the values at runtime, and the app entry itself
      // is still type-checked by its own `-r ts-node/register` preload.
      const compiler = typeScriptCompiler(path.dirname(file));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('ts-node').register({
        compiler,
        compilerOptions: tsNodeCompilerOptions(path.dirname(file), compiler),
        transpileOnly: true,
      });
    } catch (error) {
      // ts-node is resolved from the CLI's location; a global CLI install without ts-node in the
      // user's project would otherwise surface a bare "Cannot find module" here.
      const missing = (error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND';
      throw new Error(
        missing
          ? `cdk-cicd: loading a TypeScript ${path.basename(file)} needs ts-node, which could not be ` +
              `resolved (${(error as Error).message}). Install ts-node in your project, or compile the ` +
              'config to JavaScript.'
          : `cdk-cicd: ts-node could not load ${path.basename(file)}: ${(error as Error).message}`,
      );
    }
    tsNodeRegistered = true;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const loaded = require(file);
  return (loaded?.default ?? loaded) as T;
}

/**
 * Load and return the resolved pipeline config, or undefined when there is no config file. The file's
 * `default` export is the `defineCICD(...)` result -- already normalized to `ResolvedCicdConfig`.
 * Errors from an existing file deliberately propagate; only an absent file means "not configured".
 */
export function load(cwd: string): ResolvedCicdConfig | undefined {
  const file = discover(cwd);
  if (file === undefined) {
    return undefined;
  }
  return requireConfigFile<ResolvedCicdConfig>(file);
}

/**
 * Load the container-mode deployment config (Repo 2), or undefined when there is no `deploy.config`.
 * The `default` export is the `defineDeployment(...)` result -- already normalized to
 * `ResolvedDeploymentConfig`. Consumed by `deploy --from-image`.
 */
export function loadDeployment(cwd: string): ResolvedDeploymentConfig | undefined {
  const file = discoverIn(cwd, DEPLOYMENT_CANDIDATES);
  if (file === undefined) {
    return undefined;
  }
  return withStageFileEnvironments(requireConfigFile<ResolvedDeploymentConfig>(file), cwd);
}

const AWS_ACCOUNT_ID = /^\d{12}$/;
const AWS_REGION = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+-\d+$/;

/**
 * Let a target's `config/<stage>.json` supply its account and Region (`aws.accountId`, `aws.region`), so
 * they are written once. A target's `env` in deploy.config.ts still wins where it is set, and a config
 * file that disagrees with it fails instead of being ignored: the deployer container always deploys to
 * the target's account and Region, so a different value in the file would never take effect.
 *
 * Every consumer -- the pipeline synth, `deploy --from-image`, `pipeline plan|fingerprint` -- loads the
 * deployment through here, so they resolve the same targets. A file that cannot be read as a JSON
 * object contributes nothing; the deploy itself reports it.
 */
export function withStageFileEnvironments(config: ResolvedDeploymentConfig, cwd: string): ResolvedDeploymentConfig {
  const targets = config.targets.map((target) => {
    const file = path.join(cwd, 'config', `${target.stage}.json`);
    if (!existsSync(file)) return target;
    let document: unknown;
    try {
      document = JSON.parse(readFileSync(file, 'utf-8'));
    } catch {
      return target;
    }
    const aws = (document as { aws?: unknown } | null)?.aws;
    if (aws === null || typeof aws !== 'object' || Array.isArray(aws)) return target;
    const { accountId, region } = aws as { accountId?: unknown; region?: unknown };
    const source = `config/${target.stage}.json`;

    let account = target.env?.account;
    if (accountId !== undefined) {
      if (typeof accountId !== 'string' || !AWS_ACCOUNT_ID.test(accountId)) {
        throw new Error(`cdk-cicd: ${source} aws.accountId must be a 12-digit AWS account id`);
      }
      if (account !== undefined && account !== accountId) {
        throw new Error(
          `cdk-cicd: ${source} sets aws.accountId ${accountId}, but deploy.config target '${target.stage}' ` +
            `deploys to ${account}. Set the account in one place, or make them match.`,
        );
      }
      account = accountId;
    }
    let regions = target.env?.regions ?? [];
    if (region !== undefined) {
      if (typeof region !== 'string' || !AWS_REGION.test(region)) {
        throw new Error(`cdk-cicd: ${source} aws.region must be an AWS Region such as eu-west-1`);
      }
      if (regions.length === 0) {
        regions = [region];
      } else if (regions.length !== 1 || regions[0] !== region) {
        throw new Error(
          `cdk-cicd: ${source} sets aws.region ${region}, but deploy.config target '${target.stage}' deploys ` +
            `to ${regions.join(', ')}. Set the Region in one place, or make them match.`,
        );
      }
    }
    if (account === target.env?.account && regions === target.env?.regions) return target;
    return { ...target, env: { ...target.env, account, regions } };
  });
  // A compliance-logging target that took its account or Region from its file gets its bucket coordinates
  // only now; defineDeployment, which never sees the files, left them unset. Required lazily: the CLI boots
  // without loading the wrapper, and a deploy.config has already loaded it by the time it gets here.
  const { resolveDeploymentCompliance } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@cdklabs/cdk-cicd-wrapper') as typeof import('@cdklabs/cdk-cicd-wrapper');
  return resolveDeploymentCompliance({ ...config, targets });
}

/** The stage with the given name, or undefined. */
export function stageByName(config: ResolvedCicdConfig, name: string): ResolvedStage | undefined {
  return config.stages.find((stage) => stage.name === name);
}
