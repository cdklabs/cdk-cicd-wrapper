// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Unit tests for `cdk-cicd exec`'s pure logic. The spawn itself is proven by the harness (m2-verify);
// here we pin stage resolution, the env exported for a stage, the non-clobbering CDK_CONTEXT_JSON
// merge, and the preload argument order.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EngineType } from '@cdklabs/cdk-cicd-wrapper';
import {
  buildContextJson,
  execInvocation,
  forcedRoleEnv,
  isPipelineMode,
  preloadArgs,
  resolveEnvTarget,
  resolveExternalId,
  resolveStage,
  stageEnv,
} from '../../src/cmds/autopilot/ExecCommand';

describe('exec: resolveStage', () => {
  test('uses CDK_STAGE when set', () => {
    expect(resolveStage({ CDK_STAGE: 'prod' })).toBe('prod');
  });
  test('falls back to local when unset or blank', () => {
    expect(resolveStage({})).toBe('local');
    expect(resolveStage({ CDK_STAGE: '   ' })).toBe('local');
  });
});

describe('exec: isPipelineMode', () => {
  test('true only when CDK_CICD_MODE is exactly pipeline (trimmed)', () => {
    expect(isPipelineMode({ CDK_CICD_MODE: 'pipeline' })).toBe(true);
    expect(isPipelineMode({ CDK_CICD_MODE: '  pipeline  ' })).toBe(true);
  });
  test('false when unset, blank, or any other value (a plain synth renders app stacks)', () => {
    expect(isPipelineMode({})).toBe(false);
    expect(isPipelineMode({ CDK_CICD_MODE: '' })).toBe(false);
    expect(isPipelineMode({ CDK_CICD_MODE: 'app' })).toBe(false);
  });
});

describe('exec: stageEnv', () => {
  test('exports account and region into both the DEFAULT and DEPLOY pairs', () => {
    expect(stageEnv('dev', { account: '111111111111', region: 'us-west-2' })).toEqual({
      CDK_STAGE: 'dev',
      CDK_DEFAULT_ACCOUNT: '111111111111',
      CDK_DEPLOY_ACCOUNT: '111111111111',
      CDK_DEFAULT_REGION: 'us-west-2',
      CDK_DEPLOY_REGION: 'us-west-2',
    });
  });

  test('omits an absent account but still exports region', () => {
    expect(stageEnv('dev', { region: 'eu-west-1' })).toEqual({
      CDK_STAGE: 'dev',
      CDK_DEFAULT_REGION: 'eu-west-1',
      CDK_DEPLOY_REGION: 'eu-west-1',
    });
  });

  test('an empty target exports only the stage (stays account/region-agnostic)', () => {
    expect(stageEnv('local', {})).toEqual({ CDK_STAGE: 'local' });
  });
});

describe('exec: resolveEnvTarget precedence', () => {
  const appConfig = { aws: { accountId: 'app-acct', region: 'app-region' } };
  const cicdStage = { env: { account: 'cicd-acct', regions: ['cicd-region', 'other'] } };

  test('the app-config file wins (config-file-first for the inner loop)', () => {
    // Even with a cicd.config stage, per-stage env vars, and CDK_DEFAULT_* all set, the config file wins.
    expect(
      resolveEnvTarget(
        {
          CDK_DEFAULT_ACCOUNT: 'env-acct',
          CDK_DEFAULT_REGION: 'env-region',
          ACCOUNT_DEV: 'stage-acct',
          REGION_DEV: 'stage-region',
        },
        appConfig,
        cicdStage,
        'dev',
      ),
    ).toEqual({ account: 'app-acct', region: 'app-region' });
  });

  test('with no config file, the cicd.config stage is next', () => {
    expect(resolveEnvTarget({}, {}, cicdStage, 'dev')).toEqual({ account: 'cicd-acct', region: 'cicd-region' });
  });

  test('then the per-stage ACCOUNT_<STAGE>/REGION_<STAGE> env vars (keyed by the uppercased stage)', () => {
    expect(
      resolveEnvTarget(
        { ACCOUNT_DEV: 'stage-acct', REGION_DEV: 'stage-region', CDK_DEFAULT_ACCOUNT: 'env-acct' },
        {},
        undefined,
        'dev',
      ),
    ).toEqual({ account: 'stage-acct', region: 'stage-region' });
  });

  test('finally CDK_DEFAULT_* is the last resort', () => {
    expect(
      resolveEnvTarget({ CDK_DEFAULT_ACCOUNT: 'env-acct', CDK_DEFAULT_REGION: 'env-region' }, {}, undefined, 'dev'),
    ).toEqual({ account: 'env-acct', region: 'env-region' });
  });

  test('nothing anywhere leaves the target agnostic', () => {
    expect(resolveEnvTarget({}, {}, undefined, 'dev')).toEqual({ account: undefined, region: undefined });
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

describe('exec: execInvocation (all engines run the plain bin)', () => {
  const paths = { registerPath: '/reg.js' };

  test('the flat engine (default) runs the entry directly under the register preload', () => {
    expect(execInvocation('bin/app.ts', EngineType.CODEPIPELINE, paths)).toEqual({
      nodeArgs: ['-r', 'ts-node/register', '-r', '/reg.js', 'bin/app.ts'],
    });
    // undefined engine behaves the same (no assembler).
    expect(execInvocation('bin/app.ts', undefined, paths).nodeArgs).toContain('/reg.js');
    expect(execInvocation('bin/app.ts', undefined, paths).entryEnv).toBeUndefined();
  });

  test('the CDK Pipelines engine ALSO runs the plain bin -- exec never synthesizes the pipeline', () => {
    // The pipeline is rendered only by `cdk-cicd pipeline-app`; `exec` synthesizes the app stacks for
    // every engine. So no assembler routing, no CDK_CICD_ENTRY.
    const inv = execInvocation('bin/app.ts', EngineType.CDK_PIPELINES, paths);
    expect(inv.nodeArgs).toEqual(['-r', 'ts-node/register', '-r', '/reg.js', 'bin/app.ts']);
    expect(inv.entryEnv).toBeUndefined();
  });

  test('the GitHub Actions engine also runs the plain bin, same as every other engine', () => {
    const inv = execInvocation('bin/app.ts', EngineType.GITHUB_ACTIONS, paths);
    expect(inv.nodeArgs).toEqual(['-r', 'ts-node/register', '-r', '/reg.js', 'bin/app.ts']);
    expect(inv.entryEnv).toBeUndefined();
  });
});

describe('exec: forcedRoleEnv', () => {
  test('exports the stage deployment roles as the preload role env vars', async () => {
    expect(await forcedRoleEnv({ deployment: { deployRole: 'arn:deploy', cfnExecutionRole: 'arn:cfn' } })).toEqual({
      CDK_CICD_DEPLOY_ROLE_ARN: 'arn:deploy',
      CDK_CICD_CFN_EXEC_ROLE_ARN: 'arn:cfn',
    });
  });

  test('exports only what the stage configured; nothing for a stage with no deployment', async () => {
    expect(await forcedRoleEnv({ deployment: { deployRole: 'arn:deploy' } })).toEqual({
      CDK_CICD_DEPLOY_ROLE_ARN: 'arn:deploy',
    });
    expect(await forcedRoleEnv({})).toEqual({});
    expect(await forcedRoleEnv(undefined)).toEqual({});
  });

  test('a literal per-stage externalId is exported', async () => {
    expect(await forcedRoleEnv({ deployment: { deployRole: 'arn:deploy', externalId: 'ext-stage' } })).toEqual({
      CDK_CICD_DEPLOY_ROLE_ARN: 'arn:deploy',
      CDK_CICD_DEPLOY_ROLE_EXTERNAL_ID: 'ext-stage',
    });
  });

  test('the pipeline-level externalId is used when the stage sets none', async () => {
    expect(await forcedRoleEnv({ deployment: { deployRole: 'arn:deploy' } }, 'ext-pipeline')).toEqual({
      CDK_CICD_DEPLOY_ROLE_ARN: 'arn:deploy',
      CDK_CICD_DEPLOY_ROLE_EXTERNAL_ID: 'ext-pipeline',
    });
  });

  test('a per-stage externalId overrides the pipeline-level default', async () => {
    expect(
      await forcedRoleEnv({ deployment: { deployRole: 'arn:deploy', externalId: 'ext-stage' } }, 'ext-pipeline'),
    ).toEqual({
      CDK_CICD_DEPLOY_ROLE_ARN: 'arn:deploy',
      CDK_CICD_DEPLOY_ROLE_EXTERNAL_ID: 'ext-stage',
    });
  });
});

describe('exec: resolveExternalId', () => {
  test('a literal is returned unchanged; blank/undefined -> undefined', async () => {
    expect(await resolveExternalId('plain-value')).toBe('plain-value');
    expect(await resolveExternalId('')).toBeUndefined();
    expect(await resolveExternalId(undefined)).toBeUndefined();
  });

  test('a resolve:secretsmanager: reference without the SDK present fails with a clear, actionable error', async () => {
    // @aws-sdk/client-secrets-manager is intentionally NOT a build dependency (nested-smithy conflict); it
    // is loaded via an untyped runtime import that is present in the pipeline/CI runtime. When absent, the
    // resolver must fail with guidance rather than an opaque MODULE_NOT_FOUND.
    await expect(
      resolveExternalId('resolve:secretsmanager:arn:aws:secretsmanager:us-west-2:111111111111:secret:x'),
    ).rejects.toThrow(/needs @aws-sdk\/client-secrets-manager|has no SecretString/);
  });
});

describe('exec: cross-package env-flag literals match the constructs package', () => {
  test('EXEC_FLAG and the forced-role flags equal the wrapper preload constants', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const inject = require('@cdklabs/cdk-cicd-wrapper/lib/runtime/inject');
    // Read the literals out of the compiled ExecCommand to prove both ends agree.
    const src = fs.readFileSync(path.join(__dirname, '../../src/cmds/autopilot/ExecCommand.ts'), 'utf-8');
    expect(src).toContain(`const EXEC_FLAG = '${inject.EXEC_FLAG}'`);
    expect(src).toContain(`const DEPLOY_ROLE_FLAG = '${inject.DEPLOY_ROLE_FLAG}'`);
    expect(src).toContain(`const CFN_EXEC_ROLE_FLAG = '${inject.CFN_EXEC_ROLE_FLAG}'`);
    expect(src).toContain(`const DEPLOY_ROLE_EXTERNAL_ID_FLAG = '${inject.DEPLOY_ROLE_EXTERNAL_ID_FLAG}'`);
  });
});
