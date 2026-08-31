// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// PENDING IMPLEMENTATION — Python CI support (see .python-support/04-adoption-notes.md).
// These tests define the SPEC for the Python default build phase and will fail to compile/run until the
// Python language branch is added to engine/ci-commands.ts. They are deliberately decoupled from the
// engine synth command (which the CDK_CICD_MODE redesign is rewriting): they assert ONLY the build-phase
// commands (install -> audit -> build -> test) and the warn-not-fail shape, never `cdk synth`/`pipeline-app`.
//
// Designed public surface under test (from .python-support/01-architecture.md, updated for CDK_CICD_MODE):
//   enum CiLanguage { NODE, PYTHON }          // exported from config/types
//   defaultCiCommands(language?: CiLanguage)  // engine/ci-commands — Node default when omitted
//   detectCiLanguage(cwd?)                    // reads cdk.json `app` command
//   languageOf(language?, cwd?)               // explicit wins, else detect
//   isUvProject(cwd?)                         // uv.lock or [tool.uv] in pyproject.toml

import { CiLanguage } from '../../src/config/types';
import { defaultCiCommands } from '../../src/engine/ci-commands';

/** Join the rendered command array so substring assertions read simply. */
const joined = (cmds: string[]): string => cmds.join('\n');

describe('defaultCiCommands — Node regression guard', () => {
  test('no argument still returns the Node npm default (npm ci + run-or-warn audit/build/test)', () => {
    const cmds = defaultCiCommands();
    expect(cmds[0]).toBe('npm ci');
    expect(joined(cmds)).toContain('npm run audit');
    expect(joined(cmds)).toContain('npm run build');
    expect(joined(cmds)).toContain('npm run test');
    // Node uses the `npm pkg get` presence probe; never a Python tool.
    expect(joined(cmds)).toContain('npm pkg get scripts.');
    expect(joined(cmds)).not.toContain('pip');
    expect(joined(cmds)).not.toContain('uv ');
  });

  test('explicit NODE equals the no-arg default', () => {
    expect(defaultCiCommands(CiLanguage.NODE)).toEqual(defaultCiCommands());
  });
});

describe('defaultCiCommands — Python pip tier', () => {
  // The pip tier is the default Python tier for a requirements.txt project (no uv.lock/[tool.uv]).
  // These assertions are cwd-sensitive only through isUvProject; a scratch dir with no uv markers
  // must resolve to the pip tier. The test runs in the repo root (no uv.lock at cwd), so PYTHON => pip.
  const cmds = () => defaultCiCommands(CiLanguage.PYTHON);

  test('installs from requirements.txt unconditionally (parity with npm ci)', () => {
    expect(joined(cmds())).toContain('pip install -r requirements.txt');
  });

  test('audit = pip-audit (dependency-CVE), NOT bandit (SAST stays in the security scanner)', () => {
    const j = joined(cmds());
    expect(j).toContain('pip-audit');
    expect(j).not.toContain('bandit');
  });

  test('build = mypy, test = pytest', () => {
    const j = joined(cmds());
    expect(j).toContain('mypy');
    expect(j).toContain('pytest');
  });

  test('audit/build/test are warn-not-fail: PATH-gated, echo a warning, never `exit 1`', () => {
    const j = joined(cmds());
    // run-or-warn shape: `if <probe>; then <cmd>; else echo '<warning>'; fi`
    expect(j).toContain('command -v pip-audit');
    expect(j).toMatch(/else echo/);
    expect(j).not.toContain('exit 1');
    // Warning cites the recommended-checks docs.
    expect(j).toContain('cdklabs.github.io/cdk-cicd-wrapper');
  });

  test('never emits an npm command for a Python project', () => {
    const j = joined(cmds());
    expect(j).not.toContain('npm ci');
    expect(j).not.toContain('npm run');
  });

  test('never emits npx (banned in pipelines — deterministic invocation only)', () => {
    expect(joined(cmds())).not.toContain('npx ');
  });
});

// NOTE: the uv tier (uv sync / uv run pip-audit|mypy|pytest) is proven via the sample-synth test and a
// cwd-scoped variant once the tier entrypoint is exportable; a pure unit assertion here would need
// isUvProject to see a uv.lock at cwd, which the shared repo root does not have. See 04-adoption-notes.md.
