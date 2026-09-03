// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Unit tests for `cdk-cicd exec`'s pure logic. The spawn itself is proven by the harness (m2-verify);
// here we pin stage resolution, the env exported for a stage, the non-clobbering CDK_CONTEXT_JSON
// merge, and the preload argument order.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { defineCICD, EngineType, RegionOrder, Repository } from '@cdklabs/cdk-cicd-wrapper';
import {
  appConfigForTarget,
  buildContextJson,
  CFN_EXEC_ROLE_FLAG,
  COMPLIANCE_LOG_BUCKET_ACCOUNT_FLAG,
  COMPLIANCE_LOG_BUCKET_NAME_FLAG,
  COMPLIANCE_LOG_BUCKET_REGION_FLAG,
  complianceLoggingEnv,
  DEPLOY_ROLE_EXTERNAL_ID_FLAG,
  DEPLOY_ROLE_FLAG,
  execInvocation,
  forcedRoleEnv,
  isPipelineMode,
  preloadArgs,
  readSecretStringFromAwsCli,
  resolveEnvTarget,
  resolveExternalId,
  resolvePipelineExternalIds,
  resolveStage,
  stageEnv,
  wrapperRuntimeConfig,
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

  test('configured application target wins over ambient CDK defaults rewritten by credentials', () => {
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

  test('the Repo 2 account override wins over app, pipeline, stage, and ambient accounts', () => {
    expect(
      resolveEnvTarget(
        {
          CDK_CICD_ACCOUNT_OVERRIDE: 'target-acct',
          CDK_DEFAULT_ACCOUNT: 'env-acct',
          ACCOUNT_DEV: 'stage-acct',
        },
        appConfig,
        cicdStage,
        'dev',
      ),
    ).toEqual({ account: 'target-acct', region: 'app-region' });
  });

  test('an empty Repo 2 account override clears image config without trusting ambient CDK defaults', () => {
    expect(
      resolveEnvTarget(
        {
          CDK_CICD_ACCOUNT_OVERRIDE: '',
          CDK_DEFAULT_ACCOUNT: 'ambient-acct',
        },
        appConfig,
        cicdStage,
        'dev',
      ),
    ).toEqual({ account: undefined, region: 'app-region' });
  });

  test('the Repo 2 region override wins over app, pipeline, stage, and ambient regions', () => {
    expect(
      resolveEnvTarget(
        {
          CDK_CICD_REGION_OVERRIDE: 'target-region',
          CDK_DEFAULT_REGION: 'env-region',
          REGION_DEV: 'stage-region',
        },
        appConfig,
        cicdStage,
        'dev',
      ),
    ).toEqual({ account: 'app-acct', region: 'target-region' });
  });

  test('an empty Repo 2 region override clears image config without trusting ambient AWS defaults', () => {
    expect(
      resolveEnvTarget(
        {
          CDK_CICD_REGION_OVERRIDE: '',
          AWS_REGION: 'ambient-region',
        },
        appConfig,
        cicdStage,
        'dev',
      ),
    ).toEqual({ account: 'app-acct', region: undefined });
  });

  test('with no config file, the cicd.config stage is next', () => {
    expect(resolveEnvTarget({}, {}, cicdStage, 'dev')).toEqual({ account: 'cicd-acct', region: 'cicd-region' });
  });

  test('then the per-stage ACCOUNT_<STAGE>/REGION_<STAGE> env vars (keyed by the uppercased stage)', () => {
    expect(resolveEnvTarget({ ACCOUNT_DEV: 'stage-acct', REGION_DEV: 'stage-region' }, {}, undefined, 'dev')).toEqual({
      account: 'stage-acct',
      region: 'stage-region',
    });
  });

  test('ambient CDK defaults remain a last resort when repository configuration is absent', () => {
    expect(
      resolveEnvTarget({ CDK_DEFAULT_ACCOUNT: 'env-acct', CDK_DEFAULT_REGION: 'env-region' }, {}, undefined, 'dev'),
    ).toEqual({ account: 'env-acct', region: 'env-region' });
  });

  test('nothing anywhere leaves the target agnostic', () => {
    expect(resolveEnvTarget({}, {}, undefined, 'dev')).toEqual({ account: undefined, region: undefined });
  });
});

describe('exec: compliance logging env', () => {
  const stage = (account: string | undefined, regions: string[]) => ({
    name: 'dev',
    env: { account, regions, regionOrder: RegionOrder.SEQUENTIAL },
    manualApproval: false,
  });
  const cicd = {
    complianceLogBucketName: 'application-compliance-logs',
    stages: [stage('111111111111', ['eu-west-1'])],
  };
  const target = { account: '111111111111', region: 'eu-west-1' };

  test('exports the single configured physical bucket location for an application-mode child', () => {
    expect(complianceLoggingEnv(cicd, target)).toEqual({
      [COMPLIANCE_LOG_BUCKET_NAME_FLAG]: 'application-compliance-logs',
      [COMPLIANCE_LOG_BUCKET_ACCOUNT_FLAG]: '111111111111',
      [COMPLIANCE_LOG_BUCKET_REGION_FLAG]: 'eu-west-1',
    });
  });

  test.each([COMPLIANCE_LOG_BUCKET_NAME_FLAG, COMPLIANCE_LOG_BUCKET_ACCOUNT_FLAG, COMPLIANCE_LOG_BUCKET_REGION_FLAG])(
    'treats present env key %s as authoritative even when empty',
    (flag) => {
      const overrides = { [flag]: '' };
      expect(complianceLoggingEnv(cicd, target, overrides)).toEqual({});
      expect({ ...overrides, ...complianceLoggingEnv(cicd, target, overrides) }).toEqual(overrides);
    },
  );

  test('does nothing when no compliance bucket is configured', () => {
    expect(complianceLoggingEnv(undefined, target)).toEqual({});
    expect(complianceLoggingEnv({ stages: [] }, target)).toEqual({});
  });

  test.each([
    ['accounts', [stage('111111111111', ['eu-west-1']), stage('222222222222', ['eu-west-1'])]],
    ['Regions', [stage('111111111111', ['eu-west-1']), stage('111111111111', ['us-east-1'])]],
    ['Regions', [stage('111111111111', ['eu-west-1', 'us-east-1'])]],
  ])('rejects a configured bucket topology spanning multiple %s', (_dimension, stages) => {
    expect(() => complianceLoggingEnv({ ...cicd, stages }, target)).toThrow(
      /one physical bucket|one concrete shared account and Region/,
    );
  });

  test('rejects an invocation target outside the configured physical bucket location', () => {
    expect(() => complianceLoggingEnv(cicd, { account: '111111111111', region: 'us-east-1' })).toThrow(
      /does not match compliance bucket 'application-compliance-logs' location 111111111111\/eu-west-1/,
    );
  });

  test.each([
    ['account', { region: 'eu-west-1' }],
    ['Region', { account: '111111111111' }],
  ])('fails closed when the target %s is unresolved', (_missing, unresolvedTarget) => {
    expect(() => complianceLoggingEnv(cicd, unresolvedTarget)).toThrow(
      /compliance bucket 'application-compliance-logs' requires a resolved target account and Region/,
    );
  });
});

describe('exec: Repo 2 AppConfig target overlay', () => {
  test('overlays authoritative account and region into the injected AppConfig context', () => {
    const imageConfig = {
      application: 'shop',
      aws: { accountId: '111111111111', region: 'us-west-2', partition: 'aws' },
    };
    const env = {
      CDK_CICD_ACCOUNT_OVERRIDE: '222222222222',
      CDK_CICD_REGION_OVERRIDE: 'eu-west-1',
    };
    const target = resolveEnvTarget(env, imageConfig, undefined, 'prod');
    const context = JSON.parse(buildContextJson(appConfigForTarget(imageConfig, target, env), {}, {}, '/nonexistent'));

    expect(target).toEqual({ account: '222222222222', region: 'eu-west-1' });
    expect(context['cicd:config']).toEqual({
      application: 'shop',
      aws: { accountId: '222222222222', region: 'eu-west-1', partition: 'aws' },
    });
  });

  test('present-but-empty overrides remove stale image values when the target stays agnostic', () => {
    const imageConfig = {
      application: 'shop',
      aws: { accountId: '111111111111', region: 'us-west-2', partition: 'aws' },
    };
    const env = {
      CDK_CICD_ACCOUNT_OVERRIDE: '',
      CDK_CICD_REGION_OVERRIDE: '',
    };
    const target = resolveEnvTarget(env, imageConfig, undefined, 'dev');

    expect(target).toEqual({ account: undefined, region: undefined });
    expect(appConfigForTarget(imageConfig, target, env)).toEqual({
      application: 'shop',
      aws: { partition: 'aws' },
    });
  });

  test('without Repo 2 override flags the application config is unchanged', () => {
    const config = { aws: { accountId: '111111111111', region: 'us-west-2' } };
    expect(appConfigForTarget(config, { account: '222222222222', region: 'eu-west-1' }, {})).toBe(config);
  });

  test('does not overlay ambient CDK defaults into AppConfig', () => {
    const config = { aws: { accountId: '111111111111', region: 'us-west-2' } };
    const env = {
      CDK_DEFAULT_ACCOUNT: '222222222222',
      CDK_DEFAULT_REGION: 'eu-central-1',
      AWS_REGION: 'eu-central-1',
    };
    const target = resolveEnvTarget(env, config, undefined, 'prod');

    expect(target).toEqual({ account: '111111111111', region: 'us-west-2' });
    expect(appConfigForTarget(config, target, env)).toBe(config);
  });

  test('explicit synth-target flags survive ambient cross-account CDK rewrites', () => {
    const config = { aws: { accountId: '222222222222', region: 'eu-west-1' } };
    const env = {
      CDK_CICD_ACCOUNT_OVERRIDE: '222222222222',
      CDK_CICD_REGION_OVERRIDE: 'eu-west-1',
      CDK_DEFAULT_ACCOUNT: '111111111111',
      CDK_DEFAULT_REGION: 'us-east-1',
      AWS_REGION: 'us-east-1',
    };
    const target = resolveEnvTarget(env, config, undefined, 'prod');

    expect(target).toEqual({ account: '222222222222', region: 'eu-west-1' });
    expect(appConfigForTarget(config, target, env)).toEqual(config);
  });
});

describe('exec: buildContextJson', () => {
  const config = { application: 'shop', aws: { accountId: '111111111111' } };
  const wrapperConfig = {
    qualifier: 'shop',
    synthesizer: { type: 'default' },
    plugins: [{ name: 'AwsSolutionsChecks', version: '1' }],
  };

  test('adds separate app and wrapper config without touching other context keys', () => {
    const existing = JSON.stringify({ '@aws-cdk/core:bootstrapQualifier': 'hnb', userKey: 'keep' });
    const out = JSON.parse(buildContextJson(config, wrapperConfig, { CDK_CONTEXT_JSON: existing }, '/nonexistent'));

    expect(out.userKey).toBe('keep');
    expect(out['@aws-cdk/core:bootstrapQualifier']).toBe('hnb');
    expect(out['cicd:config']).toEqual(config);
    expect(out['cicd:wrapper']).toEqual(wrapperConfig);
    expect(out['cicd:config']).not.toHaveProperty('plugins');
  });

  test('does not clobber user-set app or wrapper config', () => {
    const existing = JSON.stringify({
      'cicd:config': { application: 'user-wins' },
      'cicd:wrapper': { qualifier: 'userqual' },
    });
    const out = JSON.parse(buildContextJson(config, wrapperConfig, { CDK_CONTEXT_JSON: existing }, '/nonexistent'));

    expect(out['cicd:config']).toEqual({ application: 'user-wins' });
    expect(out['cicd:wrapper']).toEqual({ qualifier: 'userqual' });
  });

  test('when no CDK_CONTEXT_JSON is set, merges cdk.json context then cdk.context.json (last wins)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-ctx-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'cdk.json'),
        JSON.stringify({ app: 'x', context: { a: 'from-cdk-json', b: '1' } }),
      );
      fs.writeFileSync(path.join(dir, 'cdk.context.json'), JSON.stringify({ b: 'from-context-json' }));

      const out = JSON.parse(buildContextJson(config, wrapperConfig, {}, dir));

      expect(out.a).toBe('from-cdk-json');
      expect(out.b).toBe('from-context-json'); // cdk.context.json overrides cdk.json
      expect(out['cicd:config']).toEqual(config);
      expect(out['cicd:wrapper']).toEqual(wrapperConfig);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a malformed existing CDK_CONTEXT_JSON is treated as empty, not fatal', () => {
    const out = JSON.parse(buildContextJson(config, {}, { CDK_CONTEXT_JSON: '{not json' }, '/nonexistent'));
    expect(out['cicd:config']).toEqual(config);
    expect(out['cicd:wrapper']).toBeUndefined();
  });
});

describe('exec: wrapperRuntimeConfig', () => {
  test('selects only wrapper-owned fields from cicd.config', () => {
    const cicd = defineCICD({
      application: 'shop',
      qualifier: 'shopqual',
      repository: Repository.codecommit('shop'),
      stages: ['dev'],
      plugins: [],
    });
    expect(wrapperRuntimeConfig(cicd)).toEqual({
      application: 'shop',
      qualifier: 'shopqual',
      synthesizer: { type: 'default' },
      plugins: [],
    });
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

  test('an externalId without a forced deployRole is ignored without resolving it', async () => {
    await expect(
      forcedRoleEnv({ deployment: { externalId: 'resolve:secretsmanager:must-not-be-read' } }, 'pipeline-default'),
    ).resolves.toEqual({});
  });

  test('Repo 2 role env overrides image-baked roles and uses its pre-resolved ExternalId literally', async () => {
    const resolvedValueThatLooksLikeAReference = 'resolve:secretsmanager:this-is-the-literal-secret-value';
    await expect(
      forcedRoleEnv(
        {
          deployment: {
            deployRole: 'arn:image:deploy',
            cfnExecutionRole: 'arn:image:cfn',
            externalId: 'image-external-id',
          },
        },
        'image-default-external-id',
        {
          [DEPLOY_ROLE_FLAG]: 'arn:repo2:deploy',
          [CFN_EXEC_ROLE_FLAG]: 'arn:repo2:cfn',
          [DEPLOY_ROLE_EXTERNAL_ID_FLAG]: resolvedValueThatLooksLikeAReference,
        },
      ),
    ).resolves.toEqual({
      [DEPLOY_ROLE_FLAG]: 'arn:repo2:deploy',
      [CFN_EXEC_ROLE_FLAG]: 'arn:repo2:cfn',
      [DEPLOY_ROLE_EXTERNAL_ID_FLAG]: resolvedValueThatLooksLikeAReference,
    });
  });

  test('present-but-empty Repo 2 role env clears every image-baked role value', async () => {
    await expect(
      forcedRoleEnv(
        {
          deployment: {
            deployRole: 'arn:image:deploy',
            cfnExecutionRole: 'arn:image:cfn',
            externalId: 'image-external-id',
          },
        },
        'image-default-external-id',
        {
          [DEPLOY_ROLE_FLAG]: '',
          [CFN_EXEC_ROLE_FLAG]: '',
          [DEPLOY_ROLE_EXTERNAL_ID_FLAG]: '',
        },
      ),
    ).resolves.toEqual({});
  });
});

describe('exec: resolveExternalId', () => {
  test('a literal is returned unchanged; blank/undefined -> undefined', async () => {
    expect(await resolveExternalId('plain-value')).toBe('plain-value');
    expect(await resolveExternalId('')).toBeUndefined();
    expect(await resolveExternalId(undefined)).toBeUndefined();
  });

  test('a resolve:secretsmanager reference uses the injected secret reader', async () => {
    const reader = jest.fn(async () => 'resolved-value');
    await expect(
      resolveExternalId('resolve:secretsmanager:arn:aws:secretsmanager:us-west-2:111111111111:secret:x', reader),
    ).resolves.toBe('resolved-value');
    expect(reader).toHaveBeenCalledWith('arn:aws:secretsmanager:us-west-2:111111111111:secret:x');
  });

  test('the AWS CLI resolver parses SecretString without invoking a shell', () => {
    const runnerMock = jest.fn().mockReturnValue({
      status: 0,
      stdout: JSON.stringify({ SecretString: 'from-cli' }),
      stderr: '',
    });
    const runner = runnerMock as unknown as typeof import('child_process').spawnSync;

    const secretArn = 'arn:aws:secretsmanager:eu-west-1:111111111111:secret:x';
    expect(readSecretStringFromAwsCli(secretArn, runner)).toBe('from-cli');
    expect(runner).toHaveBeenCalledWith(
      'aws',
      ['secretsmanager', 'get-secret-value', '--secret-id', secretArn, '--output', 'json', '--region', 'eu-west-1'],
      expect.objectContaining({ encoding: 'utf-8' }),
    );
    expect(runnerMock.mock.calls[0][2]).not.toHaveProperty('shell');
  });

  test('a non-ARN secret id uses the ambient AWS region', () => {
    const runnerMock = jest.fn().mockReturnValue({
      status: 0,
      stdout: JSON.stringify({ SecretString: 'from-cli' }),
      stderr: '',
    });
    const runner = runnerMock as unknown as typeof import('child_process').spawnSync;

    expect(readSecretStringFromAwsCli('external-id-secret', runner)).toBe('from-cli');
    expect(runnerMock.mock.calls[0][1]).toEqual([
      'secretsmanager',
      'get-secret-value',
      '--secret-id',
      'external-id-secret',
      '--output',
      'json',
    ]);
  });

  test('the AWS CLI resolver reports command failures without exposing a secret value', () => {
    const runner = jest.fn().mockReturnValue({
      status: 254,
      stdout: '',
      stderr: 'AccessDeniedException',
    }) as unknown as typeof import('child_process').spawnSync;
    expect(() => readSecretStringFromAwsCli('secret-id', runner)).toThrow(
      /could not read Secrets Manager secret 'secret-id': AccessDeniedException/,
    );
  });
});

describe('exec: self-mutating pipeline externalIds', () => {
  test('resolves per-stage/default references only for stages with a deployRole', async () => {
    const cicd = defineCICD({
      application: 'shop',
      repository: Repository.codecommit('shop'),
      deployRoleExternalId: 'resolve:secretsmanager:default',
      stages: [
        { name: 'dev', deployment: { deployRole: 'arn:dev' } },
        {
          name: 'prod',
          deployment: { deployRole: 'arn:prod', externalId: 'resolve:secretsmanager:prod' },
        },
        { name: 'qa', deployment: { externalId: 'resolve:secretsmanager:ignored' } },
      ],
    });
    const resolver = jest.fn(async (value?: string) => (value === undefined ? undefined : `resolved:${value}`));

    const resolved = await resolvePipelineExternalIds(cicd, resolver);

    expect(resolved.stages[0].deployment?.externalId).toBe('resolved:resolve:secretsmanager:default');
    expect(resolved.stages[1].deployment?.externalId).toBe('resolved:resolve:secretsmanager:prod');
    expect(resolved.stages[2].deployment?.externalId).toBe('resolve:secretsmanager:ignored');
    expect(resolved.deployRoleExternalId).toBeUndefined();
    expect(resolver).toHaveBeenCalledTimes(2);
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
    expect(src).toContain(`const COMPLIANCE_LOG_BUCKET_NAME_FLAG = '${inject.COMPLIANCE_LOG_BUCKET_NAME_FLAG}'`);
    expect(src).toContain(`const COMPLIANCE_LOG_BUCKET_ACCOUNT_FLAG = '${inject.COMPLIANCE_LOG_BUCKET_ACCOUNT_FLAG}'`);
    expect(src).toContain(`const COMPLIANCE_LOG_BUCKET_REGION_FLAG = '${inject.COMPLIANCE_LOG_BUCKET_REGION_FLAG}'`);
    // This constant is new in the source under test, so read the constructs source rather than a
    // potentially stale pre-test lib/ build.
    const injectSrc = fs.readFileSync(path.join(__dirname, '../../../cdk-cicd-wrapper/src/runtime/inject.ts'), 'utf-8');
    expect(src).toContain("const WRAPPER_CONFIG_CONTEXT_KEY = 'cicd:wrapper'");
    expect(injectSrc).toContain("export const WRAPPER_CONFIG_CONTEXT_KEY = 'cicd:wrapper'");
  });
});
