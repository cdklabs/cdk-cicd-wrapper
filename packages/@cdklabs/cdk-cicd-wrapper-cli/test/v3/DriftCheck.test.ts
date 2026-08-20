// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { analyzeManifest, checkAssembly } from '../../src/cmds/v3/DriftCheck';

function manifestWith(environment: string): any {
  return { artifacts: { TheStack: { type: 'aws:cloudformation:stack', environment } } };
}

const TARGET = { account: '111111111111', region: 'us-west-2' };

describe('m3-drift-check: analyzeManifest', () => {
  test('an exact match is ok and deployable', () => {
    const r = analyzeManifest(manifestWith('aws://111111111111/us-west-2'), TARGET);
    expect(r.stacks[0].kind).toBe('ok');
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  test('an environment-agnostic stack is OK (resolved at deploy)', () => {
    const r = analyzeManifest(manifestWith('aws://unknown-account/unknown-region'), TARGET);
    expect(r.stacks[0].kind).toBe('agnostic');
    expect(r.ok).toBe(true);
  });

  test('a region mismatch warns but stays deployable', () => {
    const r = analyzeManifest(manifestWith('aws://111111111111/eu-west-1'), TARGET);
    expect(r.stacks[0].kind).toBe('region-mismatch');
    expect(r.warnings).toHaveLength(1);
    expect(r.ok).toBe(true);
  });

  test('an account mismatch errors and blocks the deploy', () => {
    const r = analyzeManifest(manifestWith('aws://000000000000/us-west-2'), TARGET);
    expect(r.stacks[0].kind).toBe('account-mismatch');
    expect(r.errors).toHaveLength(1);
    expect(r.ok).toBe(false);
  });

  test('with no target account, the account is not checked (region still is)', () => {
    const r = analyzeManifest(manifestWith('aws://999999999999/us-west-2'), { region: 'us-west-2' });
    expect(r.stacks[0].kind).toBe('ok');
    expect(r.ok).toBe(true);
  });

  test('the hardcoded-env shape (foreign account AND region) is an account-mismatch, not just a warning', () => {
    // Mirrors hardcoded-env-app: env baked to 000000000000/eu-west-1. Account wins -> abort.
    const r = analyzeManifest(manifestWith('aws://000000000000/eu-west-1'), TARGET);
    expect(r.stacks[0].kind).toBe('account-mismatch');
    expect(r.ok).toBe(false);
  });

  test('a multi-stack assembly is not deployable if ANY stack account-mismatches', () => {
    const manifest = {
      artifacts: {
        Good: { type: 'aws:cloudformation:stack', environment: 'aws://111111111111/us-west-2' },
        Bad: { type: 'aws:cloudformation:stack', environment: 'aws://000000000000/us-west-2' },
      },
    };
    const r = analyzeManifest(manifest, TARGET);
    expect(r.stacks).toHaveLength(2);
    expect(r.ok).toBe(false);
  });

  test('non-stack artifacts (assets, tree) are skipped', () => {
    const manifest = {
      artifacts: {
        Assets: { type: 'cdk:asset-manifest' },
        Tree: { type: 'cdk:tree' },
        Stack: { type: 'aws:cloudformation:stack', environment: 'aws://111111111111/us-west-2' },
      },
    };
    const r = analyzeManifest(manifest, TARGET);
    expect(r.stacks.map((s) => s.stack)).toEqual(['Stack']);
  });
});

describe('m3-drift-check: checkAssembly', () => {
  test('reads manifest.json from the assembly dir', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-'));
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifestWith('aws://000000000000/us-west-2')));
    expect(checkAssembly(dir, TARGET).ok).toBe(false);
  });

  test('throws a clear error when there is no assembly', () => {
    expect(() => checkAssembly(fs.mkdtempSync(path.join(os.tmpdir(), 'drift-')), TARGET)).toThrow(/synth first/);
  });
});
