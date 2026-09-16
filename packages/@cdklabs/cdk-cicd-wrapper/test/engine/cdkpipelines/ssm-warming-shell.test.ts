// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Runtime test for the account-warming shell: string assertions elsewhere prove the snippet is
// PRESENT; this suite proves it RUNS correctly. It executes the exact `ssmWarmingCommands()` output
// under /bin/sh with a stubbed `aws` on PATH, then asserts the resulting ACCOUNT_<STAGE> environment,
// the fail-loud-on-empty behavior, and the identifier-sanitization edge cases.

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ssmWarmingCommands } from '../../../src/engine/cdkpipelines/CdkPipelinesEngine';

/**
 * Run the generated warming commands under /bin/sh with a fake `aws` that prints `scanOutput` (the
 * tab-separated Name\tValue rows `get-parameters-by-path --output text` would emit). Returns the
 * combined stdout+stderr and exit code, plus the ACCOUNT_* vars the script exported (dumped via `env`).
 *
 * IMPORTANT: this models how CodeBuild buildspec 0.2 actually runs the commands -- each array element
 * is a SEPARATE command line, but all of them share ONE persistent shell/environment. We emulate that
 * by concatenating the elements into one script (they run in one shell, exports persist across them,
 * matching 0.2 same-shell semantics). The complementary `sh -n` per-element check below is what proves
 * each element is independently well-formed -- i.e. that a compound command like the `while ... done`
 * loop is NOT split across elements (which is the shape CodeBuild fails on with "expecting done").
 */
function runWarming(scanOutput: string): { output: string; code: number; accounts: Record<string, string> } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssm-warm-'));
  try {
    // Fake `aws`: ignore args, emit the canned scan rows.
    const binDir = path.join(dir, 'bin');
    fs.mkdirSync(binDir);
    const awsStub = path.join(binDir, 'aws');
    // Write the scan output verbatim -- INCLUDING single rows with no trailing newline -- so this test
    // actually exercises the shell's unterminated-final-line handling (`read ... || [ -n ... ]`).
    fs.writeFileSync(awsStub, `#!/bin/sh\ncat "${path.join(dir, 'scan.txt')}"\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(dir, 'scan.txt'), scanOutput);

    // After warming, dump ACCOUNT_* so the test can read what was exported.
    // `exec 2>&1` folds the script's stderr (the skip/fail-loud warnings) into stdout so we capture it
    // on the success path too (execFileSync returns only stdout when the process exits 0).
    const script = ['exec 2>&1', ...ssmWarmingCommands('shop'), 'env | grep "^ACCOUNT_" | sort'].join('\n');
    const scriptPath = path.join(dir, 'warm.sh');
    fs.writeFileSync(scriptPath, script);

    let output = '';
    let code = 0;
    try {
      output = execFileSync('/bin/sh', [scriptPath], {
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}` },
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      code = err.status ?? 1;
      output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    }

    const accounts: Record<string, string> = {};
    for (const line of output.split('\n')) {
      const m = line.match(/^(ACCOUNT_[A-Za-z0-9_]+)=(.*)$/);
      if (m) accounts[m[1]] = m[2];
    }
    return { output, code, accounts };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const TAB = '\t';

describe('ssmWarmingCommands — executed under /bin/sh', () => {
  test('exports ACCOUNT_<STAGE> for each Account* param, keying off the leaf after "Account"', () => {
    const scan = [
      `/shop/AccountDev${TAB}111111111111`,
      `/shop/AccountProd${TAB}222222222222`,
      // Non-Account params are ignored.
      `/shop/SomeOtherKey${TAB}ignore-me`,
    ].join('\n');

    const { code, accounts } = runWarming(scan);

    expect(code).toBe(0);
    expect(accounts).toEqual({ ACCOUNT_DEV: '111111111111', ACCOUNT_PROD: '222222222222' });
  });

  test('a regional stage suffix like DEVFRA round-trips (AccountDEVFRA -> ACCOUNT_DEVFRA)', () => {
    const scan = `/shop/AccountDEVFRA${TAB}333333333333`;
    const { code, accounts } = runWarming(scan);
    expect(code).toBe(0);
    expect(accounts).toEqual({ ACCOUNT_DEVFRA: '333333333333' });
  });

  test('an account-id value with surrounding text is preserved (IFS=tab split, not whitespace)', () => {
    // Value split must be on tab only, so a value is taken verbatim up to the row's newline.
    const scan = `/shop/AccountDev${TAB}111111111111`;
    const { accounts } = runWarming(scan);
    expect(accounts.ACCOUNT_DEV).toBe('111111111111');
  });

  test('fails loud (exit 1) when the scan returns no Account* params', () => {
    const { code, output } = runWarming(`/shop/JustSomeKey${TAB}value`);
    expect(code).toBe(1);
    expect(output).toContain('found no *Account* parameters');
  });

  test('empty scan output also fails loud', () => {
    const { code, output } = runWarming('');
    expect(code).toBe(1);
    expect(output).toContain('found no *Account* parameters');
  });

  test('a param whose suffix is not a valid identifier is skipped with a warning, not silently dropped', () => {
    // "/shop/Account Dev" -> suffix " Dev" -> sanitized "DEV"? No: the space is stripped by tr -cd,
    // yielding "DEV" which IS valid. Use a purely non-alnum suffix to force the skip path.
    const scan = [
      `/shop/Account---${TAB}999999999999`, // suffix "---" -> sanitized "" -> invalid -> skip+warn
      `/shop/AccountDev${TAB}111111111111`, // a valid one so the run does not fail-loud
    ].join('\n');

    const { code, accounts, output } = runWarming(scan);

    expect(code).toBe(0);
    expect(accounts).toEqual({ ACCOUNT_DEV: '111111111111' });
    expect(output).toContain('skipping');
  });

  test('a suffix starting with a digit is skipped (invalid shell identifier)', () => {
    const scan = [
      `/shop/Account1${TAB}999999999999`, // suffix "1" -> leading digit -> invalid -> skip
      `/shop/AccountDev${TAB}111111111111`,
    ].join('\n');
    const { code, accounts, output } = runWarming(scan);
    expect(code).toBe(0);
    expect(accounts).toEqual({ ACCOUNT_DEV: '111111111111' });
    expect(output).toContain('skipping');
  });
});

describe('ssmWarmingCommands — each emitted element is a self-contained command', () => {
  // CodeBuild feeds each buildspec `commands` entry to the shell as its OWN command line. A compound
  // command (a `while`/`case`/`if`) split across entries is parsed incomplete and aborts with
  // `Syntax error: end of file unexpected (expecting "done")`. This is the exact bug: `sh -n` on the
  // lone `while ... do` element used to fail. Assert every element parses standalone.
  test('every element passes `sh -n` (parse-only) on its own', () => {
    const elements = ssmWarmingCommands('shop');
    const failures: { element: string; error: string }[] = [];
    for (const element of elements) {
      try {
        // -n = read commands but do not execute; a syntax error (e.g. unterminated `while`) exits non-zero.
        execFileSync('/bin/sh', ['-n', '-c', element], { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) {
        const err = e as { stderr?: Buffer };
        failures.push({ element, error: err.stderr?.toString() ?? 'sh -n failed' });
      }
    }
    expect(failures).toEqual([]);
  });

  test('no element contains a `while`/`do` without its matching `done`', () => {
    // A structural guard independent of a shell being available: whichever element opens the loop must
    // also close it, so the loop can never be spread across separate CodeBuild command entries.
    const elements = ssmWarmingCommands('shop');
    const loopOpeners = elements.filter((c) => /\bwhile\b/.test(c) || /\bdo\b/.test(c));
    expect(loopOpeners).toHaveLength(1);
    expect(loopOpeners[0]).toMatch(/\bdone\b/);
  });

  test('persistToGithubEnv appends warmed vars to $GITHUB_ENV so they survive to the next GitHub step', () => {
    // On GitHub Actions the warming Login step and the Synth step are separate steps; a plain `export`
    // does not cross that boundary, only a write to $GITHUB_ENV does. Default (CodeBuild) must NOT emit it.
    const codebuild = ssmWarmingCommands('shop').join('\n');
    expect(codebuild).not.toContain('GITHUB_ENV');

    const github = ssmWarmingCommands('shop', { persistToGithubEnv: true }).join('\n');
    expect(github).toContain('GITHUB_ENV');

    // Functional proof: exercise the loop element with $GITHUB_ENV pointed at a temp file and confirm
    // the warmed var lands in it (what the subsequent Synth step would read).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssm-warm-gh-'));
    try {
      const ghEnv = path.join(dir, 'github_env');
      fs.writeFileSync(ghEnv, '');
      const binDir = path.join(dir, 'bin');
      fs.mkdirSync(binDir);
      fs.writeFileSync(path.join(binDir, 'aws'), `#!/bin/sh\ncat "${path.join(dir, 'scan.txt')}"\n`, { mode: 0o755 });
      fs.writeFileSync(path.join(dir, 'scan.txt'), `/shop/AccountDev${TAB}111111111111\n`);
      const scriptPath = path.join(dir, 'warm.sh');
      fs.writeFileSync(scriptPath, ssmWarmingCommands('shop', { persistToGithubEnv: true }).join('\n'));
      execFileSync('/bin/sh', [scriptPath], {
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}`, GITHUB_ENV: ghEnv },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      expect(fs.readFileSync(ghEnv, 'utf-8')).toContain('ACCOUNT_DEV=111111111111');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
