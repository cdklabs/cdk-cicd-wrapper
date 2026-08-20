// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Unit tests for `cdk-cicd exec`'s pure logic. The spawn itself is proven by the harness (m2-verify);
// here we pin stage resolution, the env exported for a stage, the non-clobbering CDK_CONTEXT_JSON
// merge, and the preload argument order.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildContextJson, preloadArgs, resolveStage, stageEnv } from '../../src/cmds/v3/ExecCommand';

describe('exec: resolveStage', () => {
  test('uses CDK_STAGE when set', () => {
    expect(resolveStage({ CDK_STAGE: 'prod' })).toBe('prod');
  });
  test('falls back to local when unset or blank', () => {
    expect(resolveStage({})).toBe('local');
    expect(resolveStage({ CDK_STAGE: '   ' })).toBe('local');
  });
});

describe('exec: stageEnv', () => {
  test('exports account and region into both the DEFAULT and DEPLOY pairs', () => {
    expect(stageEnv('dev', { aws: { accountId: '111111111111', region: 'us-west-2' } })).toEqual({
      CDK_STAGE: 'dev',
      CDK_DEFAULT_ACCOUNT: '111111111111',
      CDK_DEPLOY_ACCOUNT: '111111111111',
      CDK_DEFAULT_REGION: 'us-west-2',
      CDK_DEPLOY_REGION: 'us-west-2',
    });
  });

  test('omits an absent account (kept from the ambient env) but still exports region', () => {
    expect(stageEnv('dev', { aws: { region: 'eu-west-1' } })).toEqual({
      CDK_STAGE: 'dev',
      CDK_DEFAULT_REGION: 'eu-west-1',
      CDK_DEPLOY_REGION: 'eu-west-1',
    });
  });

  test('an env-agnostic config exports only the stage (stays account/region-agnostic)', () => {
    expect(stageEnv('local', {})).toEqual({ CDK_STAGE: 'local' });
  });
});

describe('exec: buildContextJson', () => {
  const config = { application: 'shop', aws: { accountId: '111111111111' } };

  test('adds cicd:config on top of the CLI-provided CDK_CONTEXT_JSON without touching other keys', () => {
    const existing = JSON.stringify({ '@aws-cdk/core:bootstrapQualifier': 'hnb', userKey: 'keep' });
    const out = JSON.parse(buildContextJson(config, { CDK_CONTEXT_JSON: existing }, '/nonexistent'));

    expect(out.userKey).toBe('keep');
    expect(out['@aws-cdk/core:bootstrapQualifier']).toBe('hnb');
    expect(out['cicd:config']).toEqual(config);
  });

  test('does not clobber a user-set cicd:config', () => {
    const existing = JSON.stringify({ 'cicd:config': { application: 'user-wins' } });
    const out = JSON.parse(buildContextJson(config, { CDK_CONTEXT_JSON: existing }, '/nonexistent'));

    expect(out['cicd:config']).toEqual({ application: 'user-wins' });
  });

  test('when no CDK_CONTEXT_JSON is set, merges cdk.json context then cdk.context.json (last wins)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-ctx-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'cdk.json'),
        JSON.stringify({ app: 'x', context: { a: 'from-cdk-json', b: '1' } }),
      );
      fs.writeFileSync(path.join(dir, 'cdk.context.json'), JSON.stringify({ b: 'from-context-json' }));

      const out = JSON.parse(buildContextJson(config, {}, dir));

      expect(out.a).toBe('from-cdk-json');
      expect(out.b).toBe('from-context-json'); // cdk.context.json overrides cdk.json
      expect(out['cicd:config']).toEqual(config);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a malformed existing CDK_CONTEXT_JSON is treated as empty, not fatal', () => {
    const out = JSON.parse(buildContextJson(config, { CDK_CONTEXT_JSON: '{not json' }, '/nonexistent'));
    expect(out['cicd:config']).toEqual(config);
  });
});

describe('exec: preloadArgs', () => {
  test('a .ts entry gets ts-node before the register hook', () => {
    expect(preloadArgs('bin/app.ts', '/reg.js')).toEqual(['-r', 'ts-node/register', '-r', '/reg.js']);
  });
  test('a .js entry gets only the register hook', () => {
    expect(preloadArgs('dist/app.js', '/reg.js')).toEqual(['-r', '/reg.js']);
  });
});

describe('exec: the EXEC_FLAG contract matches the constructs package', () => {
  test('the literal exec sets equals the wrapper preload EXEC_FLAG', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EXEC_FLAG } = require('@cdklabs/cdk-cicd-wrapper/lib/v3/runtime/inject');
    // Read the literal out of the compiled ExecCommand to prove the two ends agree.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = fs.readFileSync(path.join(__dirname, '../../src/cmds/v3/ExecCommand.ts'), 'utf-8');
    expect(src).toContain(`const EXEC_FLAG = '${EXEC_FLAG}'`);
  });
});
