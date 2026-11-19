// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Every command that shells out through `npm run cdk ...` must get its flags to cdk. npm consumes the flags
// that follow a script name unless `--` separates them, and a missing separator fails silently: cdk simply
// runs without `--all`/`--output`/`--require-approval`. So rather than trust each argv's shape, run each
// one through the real npm against a stub `cdk` script that prints what it received.

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { deployCiArgs } from '../../src/cmds/autopilot/DeployCiCommand';
import { listCiArgs } from '../../src/cmds/autopilot/ListCiCommand';
import { synthCiArgs } from '../../src/cmds/autopilot/SynthCiCommand';

let project: string;

beforeAll(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-cicd-npm-args-'));
  fs.writeFileSync(path.join(project, 'print.js'), 'process.stdout.write(JSON.stringify(process.argv.slice(2)));\n');
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({ name: 'npm-args', version: '1.0.0', private: true, scripts: { cdk: 'node print.js' } }),
  );
});

afterAll(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

/** What the `cdk` script receives when npm runs `args`. */
function received(args: string[]): string[] {
  const run = spawnSync('npm', ['--silent', ...args], { cwd: project, encoding: 'utf-8' });
  expect(run.error).toBeUndefined(); // npm missing from PATH, rather than a forwarding defect
  if (run.status !== 0) throw new Error(`npm ${args.join(' ')} exited ${run.status}: ${run.stderr}`);
  return JSON.parse(run.stdout);
}

/** The arguments the command means cdk to get: everything after the `--`. */
function intended(args: string[]): string[] {
  expect(args.slice(0, 3)).toEqual(['run', 'cdk', '--']);
  return args.slice(3);
}

describe('npm run cdk argument forwarding', () => {
  test.each([
    ['deploy-ci', deployCiArgs()],
    ['synth-ci', synthCiArgs()],
    ['synth-ci --output', synthCiArgs('out-dir')],
    ['list-ci', listCiArgs('/tmp/cdk-cicd-list-ci-x')],
  ])('%s: every flag reaches cdk', (_name, args) => {
    expect(received(args)).toEqual(intended(args));
  });

  test('CONTROL: without the separator npm really does drop the flags', () => {
    // If npm ever stops consuming them, this fails first, and the separator becomes optional rather than load-bearing.
    expect(received(['run', 'cdk', 'synth', '--all', '--output', 'out-dir'])).not.toContain('--all');
  });
});
