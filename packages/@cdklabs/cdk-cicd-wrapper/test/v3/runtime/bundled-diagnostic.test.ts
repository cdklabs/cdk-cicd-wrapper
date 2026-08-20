// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Two layers: the pure decision (shouldWarnBundled) in-process, and the actual process.on('exit')
// wiring exercised end-to-end by running the COMPILED preload under `node -r` in a subprocess -- the
// only faithful way to test an exit handler that changes the process exit code. The heavier "fires on
// a real esbuild bundle, silent on level0/level1" proof lives in the m2-verify gate.

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EXEC_FLAG, shouldWarnBundled } from '../../../src/v3/runtime/inject';

describe('m2-bundled-diagnostic: shouldWarnBundled', () => {
  test('fires only when armed, zero Apps wrapped, and the run succeeded', () => {
    expect(shouldWarnBundled({ armed: true, constructed: 0, exitCode: 0 })).toBe(true);
  });

  test('stays silent when the wrapper wrapped at least one App', () => {
    expect(shouldWarnBundled({ armed: true, constructed: 1, exitCode: 0 })).toBe(false);
  });

  test('stays silent when not armed (import / plain node, not a cdk-cicd exec run)', () => {
    expect(shouldWarnBundled({ armed: false, constructed: 0, exitCode: 0 })).toBe(false);
  });

  test('never masks a run that already failed for its own reason', () => {
    expect(shouldWarnBundled({ armed: true, constructed: 0, exitCode: 1 })).toBe(false);
  });
});

describe('m2-bundled-diagnostic: the exit-handler wiring (compiled preload under node -r)', () => {
  const REGISTER = path.resolve(__dirname, '../../../lib/v3/runtime/register.js');
  const wrapperPkgDir = path.resolve(__dirname, '../../..'); // aws-cdk-lib resolves here in dev
  let scriptDir: string;

  beforeAll(() => {
    if (!fs.existsSync(REGISTER)) {
      throw new Error(`compiled preload missing at ${REGISTER} -- run \`npx projen compile\` before these tests`);
    }
    scriptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-cicd-diag-'));
  });

  afterAll(() => {
    fs.rmSync(scriptDir, { recursive: true, force: true });
  });

  // Run `node -r <compiled register> <script>` with a chosen env, capturing exit code and stderr.
  // The temp script lives outside the repo, so NODE_PATH points its `require('aws-cdk-lib')` at the
  // same copy the hook patches (the one cwd=wrapperPkgDir resolves) -- otherwise the app's App would
  // come from an unpatched copy and never increment the wrapper's counter.
  function runUnderPreload(script: string, env: Record<string, string>): { code: number; stderr: string } {
    const file = path.join(scriptDir, `s-${Buffer.from(script).length}-${Object.keys(env).join('')}.js`);
    fs.writeFileSync(file, script, 'utf-8');
    try {
      execFileSync(process.execPath, ['-r', REGISTER, file], {
        cwd: wrapperPkgDir,
        env: { ...process.env, ...env, NODE_PATH: path.join(wrapperPkgDir, 'node_modules') },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { code: 0, stderr: '' };
    } catch (e) {
      const err = e as { status?: number; stderr?: Buffer };
      return { code: err.status ?? -1, stderr: err.stderr?.toString() ?? '' };
    }
  }

  const NO_APP = 'console.log("bundled-like: no App constructed through the wrapper");';
  const ONE_APP = 'const { App } = require("aws-cdk-lib"); new App();';
  const APP_THEN_THROW = 'const { App } = require("aws-cdk-lib"); new App(); throw new Error("app boom");';

  test('armed + no App wrapped -> fails the run with the attach() pointer', () => {
    const { code, stderr } = runUnderPreload(NO_APP, { [EXEC_FLAG]: '1' });
    expect(code).toBe(1);
    expect(stderr).toContain('CdkCicd.attach(app)');
  });

  test('armed + an App wrapped -> silent success', () => {
    const { code, stderr } = runUnderPreload(ONE_APP, { [EXEC_FLAG]: '1' });
    expect(code).toBe(0);
    expect(stderr).not.toContain('CdkCicd.attach');
  });

  test('NOT armed + no App -> silent success (import / plain node safety)', () => {
    const { code, stderr } = runUnderPreload(NO_APP, { [EXEC_FLAG]: '0' });
    expect(code).toBe(0);
    expect(stderr).not.toContain('CdkCicd.attach');
  });

  test('armed + the app throws -> the app failure is not masked by the diagnostic', () => {
    const { code, stderr } = runUnderPreload(APP_THEN_THROW, { [EXEC_FLAG]: '1' });
    expect(code).not.toBe(0);
    expect(stderr).toContain('app boom');
    expect(stderr).not.toContain('CdkCicd.attach'); // an App WAS wrapped, and the exit code is non-zero
  });
});
