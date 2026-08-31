// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The default CI build commands, shared by every engine so all three render the SAME default build
// phase. When a project configures no `ci.steps`, CI runs the project's own checks -- audit, build,
// test -- in order. Each is run only when the project actually provides it; a missing check prints a
// warning that points at our recommended checks and CONTINUES (it never fails the build). This keeps
// the checks as encouraged guidance -- discoverable and local==CI -- without enforcing them on a
// project that has opted out.
//
// Two language paths share this shape, selected by `CiLanguage`:
//   * NODE   -- `npm ci`, then `npm run audit|build|test` when each script exists in package.json.
//   * PYTHON -- install deps, then `pip-audit`/`mypy`/`pytest` (pip tier) or their `uv run` equivalents
//               (uv tier when a `uv.lock`/`pyproject.toml` marks the project uv-managed). Each tool
//               runs only when it is on PATH; otherwise the same warn-and-continue line fires. No
//               `package.json` is required for a Python project.
//
// The moment a project sets its own `ci.steps`, this default is replaced wholesale (the engines own
// that replacement): a project that customizes CI owns its build phase, warnings included.

import * as fs from 'fs';
import * as path from 'path';
import { CiLanguage } from '../config/types';

/** The npm scripts CI runs by default for a Node project, in order. */
const DEFAULT_SCRIPTS = ['audit', 'build', 'test'] as const;

/** Where the recommended-checks guidance lives, cited by the missing-check warning. */
const CHECKS_DOCS_URL = 'https://cdklabs.github.io/cdk-cicd-wrapper/developer_guides/audit/';

/**
 * A single shell line that runs `command` when the presence `test` passes, else prints a warning
 * pointing at our recommended checks -- without failing the build. `label` names the check in the
 * warning; `test` is a `[ ... ]`/`sh`-safe condition (without the surrounding `if`). One `sh -c`-safe
 * line, so it drops straight into a CodeBuild `commands` array or a CDK Pipelines step.
 *
 * The script name is double-quoted INSIDE the message because the message is wrapped in single quotes
 * for the echo; an embedded single quote would close that quote in /bin/sh rather than print.
 */
function runToolOrWarn(label: string, test: string, command: string): string {
  const warning =
    `WARNING: no "${label}" check available -- skipping. ` +
    `The cdk-cicd-wrapper recommends a "${label}" check for your CI checks; see ${CHECKS_DOCS_URL}`;
  return `if ${test}; then ${command}; else echo '${warning}'; fi`;
}

/**
 * Run `npm run <script>` when the project defines it, else warn. `npm pkg get scripts.<name>` prints
 * `{}` when the script is absent, so the presence check needs no `jq` and no hand-parsing of
 * `package.json`.
 */
function runScriptOrWarn(script: string): string {
  return runToolOrWarn(script, `[ "$(npm pkg get scripts.${script})" != "{}" ]`, `npm run ${script}`);
}

/** The Node default: `npm ci`, then each default script (run-or-warn), in order. */
function defaultNodeCiCommands(): string[] {
  return ['npm ci', ...DEFAULT_SCRIPTS.map(runScriptOrWarn)];
}

/**
 * The Python default. The `uv` tier (a `uv.lock`/`pyproject.toml` project) installs with `uv sync` and
 * runs every tool through `uv run`; the basic pip tier installs from `requirements.txt` and runs the
 * tools directly. Install is unconditional (parity with `npm ci`); audit/build/test are run-or-warn,
 * gated on the tool being on PATH so a project that has not adopted `pip-audit`/`mypy`/`pytest` gets a
 * warning rather than a failure. `bandit` is deliberately absent -- it is SAST, owned by the security
 * scanner, not the dependency-audit phase.
 */
function defaultPythonCiCommands(uv: boolean): string[] {
  if (uv) {
    return [
      'uv sync',
      runToolOrWarn('audit', 'uv run pip-audit --version', 'uv run pip-audit'),
      runToolOrWarn('build', 'uv run mypy --version', 'uv run mypy .'),
      runToolOrWarn('test', 'uv run pytest --version', 'uv run pytest'),
    ];
  }
  return [
    'pip install -r requirements.txt',
    runToolOrWarn('audit', 'command -v pip-audit', 'pip-audit -r requirements.txt'),
    runToolOrWarn('build', 'command -v mypy', 'mypy .'),
    runToolOrWarn('test', 'command -v pytest', 'python -m pytest'),
  ];
}

/**
 * Whether the Python project in `cwd` is uv-managed (modern tier). A `uv.lock`, or a `pyproject.toml`
 * carrying a `[tool.uv]` table, selects the uv tier; otherwise the basic pip tier. Non-throwing: any
 * read error falls back to the pip tier.
 */
export function isUvProject(cwd: string = process.cwd()): boolean {
  try {
    if (fs.existsSync(path.join(cwd, 'uv.lock'))) return true;
    const pyproject = path.join(cwd, 'pyproject.toml');
    if (fs.existsSync(pyproject)) {
      return fs.readFileSync(pyproject, 'utf-8').includes('[tool.uv]');
    }
  } catch {
    // fall through to pip tier
  }
  return false;
}

/**
 * Detect the CI language from `cdk.json`'s `app` command in `cwd`. A command that invokes Python
 * (`python`, `python3`, or `uv run python ...`, including after the single `cdk-cicd exec` entry
 * prefix) is `PYTHON`; anything else -- a `node`/`ts-node` app, an unrecognized command, a missing or
 * unparseable `cdk.json` -- is `NODE`. Non-throwing: a broken read must never fail synth, so it falls
 * back to `NODE`.
 */
export function detectCiLanguage(cwd: string = process.cwd()): CiLanguage {
  try {
    const cdkJsonPath = path.join(cwd, 'cdk.json');
    if (!fs.existsSync(cdkJsonPath)) return CiLanguage.NODE;
    const app = JSON.parse(fs.readFileSync(cdkJsonPath, 'utf-8'))?.app;
    if (typeof app !== 'string') return CiLanguage.NODE;
    // Match a python/uv-run-python interpreter anywhere in the app command (the single `cdk-cicd exec`
    // entry may prefix it, e.g. `npm run cdk-cicd exec python3 app.py`).
    if (/(^|\s)(python[0-9.]*\b|uv\s+run\s+python)/.test(app)) return CiLanguage.PYTHON;
    return CiLanguage.NODE;
  } catch {
    return CiLanguage.NODE;
  }
}

/** The resolved CI language: an explicit `ci.language` wins, otherwise auto-detect from `cdk.json`. */
export function languageOf(language: CiLanguage | undefined, cwd: string = process.cwd()): CiLanguage {
  return language ?? detectCiLanguage(cwd);
}

/**
 * The default CI build commands when `ci.steps` is empty, for the given language. The synth command is
 * appended by the engine, not here. Defaults to `NODE` so every existing call site compiles unchanged.
 */
export function defaultCiCommands(language: CiLanguage = CiLanguage.NODE, cwd: string = process.cwd()): string[] {
  if (language === CiLanguage.PYTHON) {
    return defaultPythonCiCommands(isUvProject(cwd));
  }
  return defaultNodeCiCommands();
}

/**
 * The engine-appended synth command for a language. A Node project runs `npm run cdk synth` (the
 * project's pinned `cdk` script). A Python project has no `package.json` script, so it runs the Node
 * `cdk` CLI directly as `cdk synth` (which reads `cdk.json`, whose `app` runs the Python entry) -- the
 * build host carries both runtimes. The mode (`CDK_CICD_MODE`) is inherited from the step env either
 * way, so the same command renders the pipeline in a self-mutating step and the app stacks otherwise.
 */
export function synthCommandFor(language: CiLanguage = CiLanguage.NODE): string {
  return language === CiLanguage.PYTHON ? 'cdk synth' : 'npm run cdk synth';
}
