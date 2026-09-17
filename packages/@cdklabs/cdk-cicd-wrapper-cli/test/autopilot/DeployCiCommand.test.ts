// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Unit tests for deploy-ci's pure argv/env builders. Provisioning a pipeline end to end (which spawns
// `npm run cdk -- deploy`, whose `cdk.json` app is `cdk-cicd exec`, which renders the pipeline because
// CDK_CICD_MODE=pipeline is inherited) is proven by the m4-verify real-AWS gate.
//
// The `--` separator is load-bearing and is covered by a REAL npm subprocess below (not just a string
// assertion): without it, `npm run cdk deploy --all --require-approval never` lets npm consume
// `--all`/`--require-approval` as its own flags, forwarding only the bare positional `never` to the
// underlying script -- reproducing the live `No stacks match the name(s) never` failure.

import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { deployCiArgs, deployCiEnv } from '../../src/cmds/autopilot/DeployCiCommand';

/** The final non-empty stdout line -- npm prints its own `> pkg@ver script` banner line first. */
function lastLine(stdout: string): string {
  const lines = stdout.split('\n').filter((l) => l.trim().length > 0);
  return lines[lines.length - 1];
}

describe('m4-approval-selfupdate: deployCiArgs', () => {
  test('deploys via `npm run cdk -- deploy --all` -- no `--app` override, no npx', () => {
    // The single cdk.json entry (`cdk-cicd exec`) renders the pipeline when CDK_CICD_MODE=pipeline is
    // set (see deployCiEnv); deploy-ci never overrides `--app`. `npm run cdk`, never npx. The `--`
    // separator is required so npm forwards --all/--require-approval to the script instead of
    // consuming them itself.
    expect(deployCiArgs()).toEqual(['run', 'cdk', '--', 'deploy', '--all', '--require-approval', 'never']);
  });

  test('the argv is identical for every engine -- the engine never changes the command', () => {
    // Convergence: the mode signal (env), not the argv, decides app-vs-pipeline, uniformly.
    expect(deployCiArgs('ci')).toEqual(deployCiArgs('cd'));
  });

  test('never emits `--app` or `npx`', () => {
    const args = deployCiArgs();
    expect(args).not.toContain('--app');
    expect(args.some((a) => a.includes('npx'))).toBe(false);
    expect(args.some((a) => a.includes('pipeline-app'))).toBe(false);
  });

  test('real npm subprocess: the `--` separator actually forwards --all/--require-approval', () => {
    // Reproduces the live bug with a genuine npm process, not a string assertion. A `cdk` script that
    // just echoes its received argv proves what actually reaches the underlying command.
    const script = ['run', 'cdk', '--', 'deploy', '--all', '--require-approval', 'never'];
    const withoutSeparator = ['run', 'cdk', 'deploy', '--all', '--require-approval', 'never'];

    const pkgJson = JSON.stringify({
      name: 'deploy-ci-argv-probe',
      version: '0.0.0',
      scripts: { cdk: 'node -e "console.log(JSON.stringify(process.argv.slice(1)))"' },
    });

    const dir = mkdtempSync(path.join(tmpdir(), 'deploy-ci-argv-probe-'));
    try {
      writeFileSync(path.join(dir, 'package.json'), pkgJson);

      const withSep = spawnSync('npm', script, { cwd: dir, encoding: 'utf-8' });
      expect(withSep.status).toBe(0);
      expect(JSON.parse(lastLine(withSep.stdout))).toEqual(['deploy', '--all', '--require-approval', 'never']);

      const withoutSep = spawnSync('npm', withoutSeparator, { cwd: dir, encoding: 'utf-8' });
      expect(withoutSep.status).toBe(0);
      // Without `--`, npm swallows --all/--require-approval as its own flags; only the bare
      // positional survives -- this is the exact shape of the live "No stacks match the name(s)
      // never" failure.
      expect(JSON.parse(lastLine(withoutSep.stdout))).toEqual(['deploy', 'never']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('m4-approval-selfupdate: deployCiEnv', () => {
  test('signals pipeline mode so the single `cdk-cicd exec` entry renders the pipeline', () => {
    expect(deployCiEnv(false)).toEqual({ CDK_CICD_MODE: 'pipeline' });
  });

  test('--disposable is carried as an env flag (not an argv flag cdk would reject)', () => {
    expect(deployCiEnv(true)).toEqual({ CDK_CICD_MODE: 'pipeline', CDK_CICD_DISPOSABLE: '1' });
  });
});
