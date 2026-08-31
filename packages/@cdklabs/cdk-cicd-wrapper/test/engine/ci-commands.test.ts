// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Unit tests for the shared default CI build commands: the golden-path scripts (audit/build/test)
// each run-or-warn, in order, with npm ci first. The engines are responsible for appending cdk synth
// and for replacing this default when ci.steps is set -- those are covered in the engine tests.
//
// Beyond the string shape, the run-or-warn snippet is EXECUTED in /bin/sh (the CodeBuild default shell)
// against real package.json fixtures. Its whole value is runtime behaviour -- whether `npm pkg get`
// reports a missing script as `{}`, whether a present script runs, whether an absent one warns without
// failing the build, and whether a failing script propagates its non-zero exit -- none of which the
// synthesized-string assertions can prove. These guard against an npm-version change to `npm pkg get`
// or a shell-quoting regression silently turning the gate into a no-op.

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { defaultCiCommands } from '../../src/engine/ci-commands';

describe('defaultCiCommands', () => {
  const commands = defaultCiCommands();

  test('starts with npm ci', () => {
    expect(commands[0]).toBe('npm ci');
  });

  test('runs audit, build, then test after npm ci, in that order', () => {
    expect(commands).toHaveLength(4);
    expect(commands[1]).toContain('npm run audit');
    expect(commands[2]).toContain('npm run build');
    expect(commands[3]).toContain('npm run test');
  });

  test('each script is run only when present, else warns and continues (no failure)', () => {
    for (const [script, cmd] of [
      ['audit', commands[1]],
      ['build', commands[2]],
      ['test', commands[3]],
    ] as const) {
      // Presence probe via `npm pkg get` (no jq), run-if-present, warn-if-absent, no non-zero exit.
      expect(cmd).toContain(`npm pkg get scripts.${script}`);
      expect(cmd).toContain(`npm run ${script}`);
      expect(cmd).toMatch(/else echo /);
      expect(cmd).not.toContain('exit 1');
    }
  });

  test('the missing-script warning points at the checks documentation', () => {
    expect(commands[1]).toContain('https://cdklabs.github.io/cdk-cicd-wrapper/developer_guides/audit/');
  });

  test('no longer invokes the bespoke cdk-cicd check umbrella', () => {
    expect(commands.join(' ')).not.toContain('cdk-cicd check');
  });
});

describe('defaultCiCommands: runtime behaviour in /bin/sh (the CodeBuild shell)', () => {
  // The exact snippet the engines drop into the buildspec for the `audit` script.
  const auditCmd = defaultCiCommands()[1];
  const dirs: string[] = [];

  /** A throwaway project whose package.json has exactly the given scripts. */
  function project(scripts: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-cicd-ci-cmd-'));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', scripts }));
    dirs.push(dir);
    return dir;
  }

  /** Run the snippet in /bin/sh from `cwd`; return its stdout+stderr and exit code. */
  function run(cwd: string): { output: string; code: number } {
    try {
      const output = execFileSync('/bin/sh', ['-c', auditCmd], { cwd, encoding: 'utf8', stdio: 'pipe' });
      return { output, code: 0 };
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return { output: `${err.stdout ?? ''}${err.stderr ?? ''}`, code: err.status ?? -1 };
    }
  }

  afterAll(() => dirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

  test('a present script runs and exits 0', () => {
    const { output, code } = run(project({ audit: 'echo AUDIT_RAN' }));
    expect(output).toContain('AUDIT_RAN');
    expect(code).toBe(0);
  });

  test('a missing script warns and exits 0 (the build continues)', () => {
    // This is the load-bearing case: `npm pkg get scripts.audit` must report the absent key as `{}`
    // so the `!= "{}"` guard takes the warn branch instead of trying to `npm run` a nonexistent script.
    const { output, code } = run(project({ build: 'true' }));
    expect(output).toContain('WARNING');
    expect(output).not.toContain('AUDIT_RAN');
    expect(code).toBe(0);
  });

  test('a present script that fails propagates its non-zero exit (the build fails)', () => {
    const { code } = run(project({ audit: 'exit 7' }));
    expect(code).not.toBe(0);
  });
});
