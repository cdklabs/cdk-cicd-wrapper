// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Discovery + loading of the pipeline config file (cicd.config.ts) that a user authors with
// defineCICD. This is the CICD-config layer -- the pipeline's stages/repo/roles -- consumed by the
// v3 CLI commands (synth/deploy). It is independent of the app-config layer (config/<stage>.json)
// that AppConfig injects into the construct tree.
//
// A missing file is not an error: it means Level 0 (a plain app with no pipeline), so callers get
// `undefined` and behave as if no wrapper pipeline was configured.

import { existsSync } from 'fs';
import * as path from 'path';
import { ResolvedCicdConfig, ResolvedStage } from '@cdklabs/cdk-cicd-wrapper';

// Probe order. TypeScript is the primary authoring path (D-config-authoring); .js supports an
// already-compiled config. YAML pipeline config is a later addition (it needs a Repository
// reconstruction step and a yaml dep in the CLI) -- app-config YAML is separate and unaffected.
const CANDIDATES = ['cicd.config.ts', 'cicd.config.js'];

/** The path to the pipeline config next to `cdk.json`, or undefined when there is none (Level 0). */
export function discover(cwd: string): string | undefined {
  for (const candidate of CANDIDATES) {
    // resolve, not join: a relative cwd must still yield an absolute path, or the later `require`
    // would treat a bare 'cicd.config.ts' as a node_modules module specifier rather than a file.
    const candidatePath = path.resolve(cwd, candidate);
    if (existsSync(candidatePath)) {
      return candidatePath;
    }
  }
  return undefined;
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
 * Measured: this override does NOT break `NodeNext` or `moduleResolution: bundler` tsconfigs. A project
 * with `"type": "module"` cannot load a `.ts` config either way -- see finding
 * `qa-esm-project-cannot-load-ts-cicd-config`.
 */
export const TS_NODE_COMPILER_OPTIONS = { module: 'commonjs' };

/**
 * Load and return the resolved pipeline config, or undefined when there is no config file. A `.ts`
 * file is loaded in-process via ts-node (the same transpiler the app entry uses), so the user writes
 * exactly one config file with no build step. The file's `default` export is the `defineCICD(...)`
 * result -- already normalized to `ResolvedCicdConfig`.
 */
export function load(cwd: string): ResolvedCicdConfig | undefined {
  const file = discover(cwd);
  if (file === undefined) {
    return undefined;
  }

  if (file.endsWith('.ts') && !tsNodeRegistered) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('ts-node').register({ compilerOptions: TS_NODE_COMPILER_OPTIONS });
    } catch (error) {
      // ts-node is resolved from the CLI's location; a global CLI install without ts-node in the
      // user's project would otherwise surface a bare "Cannot find module" here.
      throw new Error(
        `cdk-cicd: loading a TypeScript ${path.basename(file)} needs ts-node, which could not be ` +
          `resolved (${(error as Error).message}). Install ts-node in your project, or compile the ` +
          'config to cicd.config.js.',
      );
    }
    tsNodeRegistered = true;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const loaded = require(file);
  const config = (loaded?.default ?? loaded) as ResolvedCicdConfig;
  return config;
}

/** The stage with the given name, or undefined. */
export function stageByName(config: ResolvedCicdConfig, name: string): ResolvedStage | undefined {
  return config.stages.find((stage) => stage.name === name);
}
