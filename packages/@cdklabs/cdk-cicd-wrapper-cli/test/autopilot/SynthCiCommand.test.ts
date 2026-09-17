// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Unit tests for synth-ci's pure argv builder, `synthCiArgs`. Mirrors DeployCiCommand.test.ts: the
// `--` separator is covered by a REAL npm subprocess (not just a string assertion), since without it
// npm consumes `--all`/`--output <dir>` as its own flags and forwards only a stray positional to the
// underlying `cdk` script.

import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { synthCiArgs } from '../../src/cmds/autopilot/SynthCiCommand';

/** The final non-empty stdout line -- npm prints its own `> pkg@ver script` banner line first. */
function lastLine(stdout: string): string {
  const lines = stdout.split('\n').filter((l) => l.trim().length > 0);
  return lines[lines.length - 1];
}

describe('synth-ci: synthCiArgs', () => {
  test('with no output dir: `npm run cdk -- synth --all`', () => {
    expect(synthCiArgs()).toEqual(['run', 'cdk', '--', 'synth', '--all']);
  });

  test('with an output dir: appends `--output <dir>` after the `--` separator', () => {
    expect(synthCiArgs('/tmp/my-assembly')).toEqual([
      'run',
      'cdk',
      '--',
      'synth',
      '--all',
      '--output',
      '/tmp/my-assembly',
    ]);
  });

  test('an empty-string output is treated as absent (no --output emitted)', () => {
    expect(synthCiArgs('')).toEqual(['run', 'cdk', '--', 'synth', '--all']);
  });

  test('real npm subprocess: the `--` separator forwards --all and --output correctly', () => {
    const pkgJson = JSON.stringify({
      name: 'synth-ci-argv-probe',
      version: '0.0.0',
      scripts: { cdk: 'node -e "console.log(JSON.stringify(process.argv.slice(1)))"' },
    });

    const dir = mkdtempSync(path.join(tmpdir(), 'synth-ci-argv-probe-'));
    try {
      writeFileSync(path.join(dir, 'package.json'), pkgJson);

      const withSep = spawnSync('npm', synthCiArgs('/tmp/my-assembly'), { cwd: dir, encoding: 'utf-8' });
      expect(withSep.status).toBe(0);
      expect(JSON.parse(lastLine(withSep.stdout))).toEqual(['synth', '--all', '--output', '/tmp/my-assembly']);

      // Without `--`, npm swallows --all and --output as its own flags, forwarding only a bare
      // positional -- the exact shape of a live "output dir mis-parsed as a stack name" failure.
      const withoutSep = spawnSync('npm', ['run', 'cdk', 'synth', '--all', '--output', '/tmp/my-assembly'], {
        cwd: dir,
        encoding: 'utf-8',
      });
      expect(withoutSep.status).toBe(0);
      expect(JSON.parse(lastLine(withoutSep.stdout))).toEqual(['synth', '/tmp/my-assembly']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
