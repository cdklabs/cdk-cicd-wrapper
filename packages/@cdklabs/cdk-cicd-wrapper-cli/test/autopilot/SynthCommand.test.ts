// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ResolvedCicdConfig } from '@cdklabs/cdk-cicd-wrapper';
import { ACCOUNT_OVERRIDE_FLAG, REGION_OVERRIDE_FLAG, resolveEnvTarget } from '../../src/cmds/autopilot/ExecCommand';
import {
  configForStage,
  contextBootstrapQualifier,
  qualifierMismatchWarning,
  synthTargets,
} from '../../src/cmds/autopilot/SynthCommand';

// A minimal resolved config: one single-region stage, one multi-region stage.
const CONFIG = {
  repository: {} as any,
  synthesizer: { type: 'default' as any },
  stages: [
    {
      name: 'dev',
      env: { account: '111111111111', regions: ['us-west-2'], regionOrder: 'sequential' as any },
      manualApproval: false,
    },
    {
      name: 'prod',
      env: { account: '222222222222', regions: ['us-west-1', 'eu-west-1'], regionOrder: 'sequential' as any },
      manualApproval: true,
    },
  ],
} as unknown as ResolvedCicdConfig;

describe('m3-synth: synthTargets', () => {
  test('--all enumerates every stage x region, in config order', () => {
    const targets = synthTargets(CONFIG);
    expect(targets.map((t) => `${t.stage}/${t.region}`)).toEqual(['dev/us-west-2', 'prod/us-west-1', 'prod/eu-west-1']);
  });

  test('a single stage yields only that stage regions', () => {
    expect(synthTargets(CONFIG, 'prod').map((t) => t.region)).toEqual(['us-west-1', 'eu-west-1']);
    expect(synthTargets(CONFIG, 'nope')).toEqual([]);
  });

  test('a region override pins the selected stage to that one region, ignoring the config list', () => {
    // A multi-region stage collapses to exactly the overridden region (container mode: one region per run).
    expect(synthTargets(CONFIG, 'prod', 'ap-southeast-2').map((t) => `${t.stage}/${t.region}`)).toEqual([
      'prod/ap-southeast-2',
    ]);
    // The override carries into the env pins, so the synth actually targets that region.
    const [only] = synthTargets(CONFIG, 'prod', 'ap-southeast-2');
    expect(only.env.CDK_DEFAULT_REGION).toBe('ap-southeast-2');
    expect(only.env[REGION_OVERRIDE_FLAG]).toBe('ap-southeast-2');
    expect(only.env.AWS_REGION).toBe('ap-southeast-2');
    expect(only.account).toBe('222222222222');
  });

  test('a region override yields one target even for an env-agnostic stage with no regions', () => {
    const agnostic = {
      ...CONFIG,
      stages: [
        {
          name: 'dev',
          env: { account: undefined, regions: [], regionOrder: 'sequential' as any },
          manualApproval: false,
        },
      ],
    } as unknown as ResolvedCicdConfig;
    expect(synthTargets(agnostic, 'dev', 'us-west-2').map((t) => t.region)).toEqual(['us-west-2']);
  });

  test('an env-agnostic stage falls back to CDK_DEFAULT_REGION, then AWS_REGION', () => {
    const agnostic = {
      ...CONFIG,
      stages: [
        {
          name: 'dev',
          env: { account: undefined, regions: [], regionOrder: 'sequential' as any },
          manualApproval: false,
        },
      ],
    } as unknown as ResolvedCicdConfig;

    expect(
      synthTargets(agnostic, 'dev', undefined, {
        CDK_DEFAULT_REGION: 'eu-central-1',
        AWS_REGION: 'us-east-1',
      }).map((t) => t.region),
    ).toEqual(['eu-central-1']);
    expect(synthTargets(agnostic, 'dev', undefined, { AWS_REGION: 'us-east-1' }).map((t) => t.region)).toEqual([
      'us-east-1',
    ]);
    expect(synthTargets(agnostic, 'dev', undefined, {})).toEqual([]);
  });

  test('the Repo 2 account override wins over the account baked into cicd.config', () => {
    const [target] = synthTargets(CONFIG, 'prod', undefined, {
      CDK_CICD_ACCOUNT_OVERRIDE: '999999999999',
    });
    expect(target.account).toBe('999999999999');
    expect(target.env.CDK_DEFAULT_ACCOUNT).toBe('999999999999');
    expect(target.env.CDK_DEPLOY_ACCOUNT).toBe('999999999999');
  });

  test('empty Repo 2 overrides clear image targets and use ambient account/region values', () => {
    const [target] = synthTargets(CONFIG, 'prod', undefined, {
      CDK_CICD_ACCOUNT_OVERRIDE: '',
      CDK_DEFAULT_ACCOUNT: '999999999999',
      CDK_CICD_REGION_OVERRIDE: '',
      AWS_REGION: 'eu-central-1',
    });
    expect(target.account).toBe('999999999999');
    expect(target.region).toBe('eu-central-1');
    expect(target.env.CDK_DEFAULT_ACCOUNT).toBe('999999999999');
    expect(target.env.CDK_DEFAULT_REGION).toBe('eu-central-1');
    expect(target.env[ACCOUNT_OVERRIDE_FLAG]).toBe('999999999999');
    expect(target.env[REGION_OVERRIDE_FLAG]).toBe('eu-central-1');
  });

  test('an intentionally account-agnostic target carries an empty explicit account contract', () => {
    const agnostic = {
      ...CONFIG,
      stages: [
        {
          name: 'dev',
          env: { account: undefined, regions: ['eu-west-1'], regionOrder: 'sequential' as any },
          manualApproval: false,
        },
      ],
    } as unknown as ResolvedCicdConfig;
    const [target] = synthTargets(agnostic, 'dev', undefined, {
      CDK_DEFAULT_ACCOUNT: '111111111111',
    });

    expect(target.account).toBeUndefined();
    expect(target.env[ACCOUNT_OVERRIDE_FLAG]).toBe('');
    expect(
      resolveEnvTarget(
        { ...target.env, CDK_DEFAULT_ACCOUNT: '111111111111' },
        { aws: { accountId: '999999999999' } },
        undefined,
        'dev',
      ).account,
    ).toBeUndefined();
  });

  test('configured cross-account targets survive ambient CDK CLI account and region rewrites', () => {
    const [target] = synthTargets(CONFIG, 'prod', undefined, {
      CDK_DEFAULT_ACCOUNT: '111111111111',
      CDK_DEFAULT_REGION: 'us-east-1',
      AWS_REGION: 'us-east-1',
    });
    const rewrittenByCdk = {
      ...target.env,
      CDK_DEFAULT_ACCOUNT: '111111111111',
      CDK_DEFAULT_REGION: 'us-east-1',
      AWS_REGION: 'us-east-1',
    };

    expect(target.env[ACCOUNT_OVERRIDE_FLAG]).toBe('222222222222');
    expect(target.env[REGION_OVERRIDE_FLAG]).toBe('us-west-1');
    expect(resolveEnvTarget(rewrittenByCdk, {}, undefined, 'prod')).toEqual({
      account: '222222222222',
      region: 'us-west-1',
    });
  });

  test('each target carries the per-region env and a segregated output dir', () => {
    const [, prodUsW1] = synthTargets(CONFIG);
    expect(prodUsW1.outDir).toBe(path.join('cdk.out', 'prod', 'us-west-1'));
    expect(prodUsW1.env).toEqual({
      CDK_STAGE: 'prod',
      CDK_DEFAULT_ACCOUNT: '222222222222',
      CDK_DEPLOY_ACCOUNT: '222222222222',
      [ACCOUNT_OVERRIDE_FLAG]: '222222222222',
      CDK_DEFAULT_REGION: 'us-west-1',
      CDK_DEPLOY_REGION: 'us-west-1',
      [REGION_OVERRIDE_FLAG]: 'us-west-1',
      // steer the CDK CLI's own region derivation, not just the app's CDK_DEFAULT_REGION
      AWS_REGION: 'us-west-1',
      AWS_DEFAULT_REGION: 'us-west-1',
    });
  });
});

describe('container mode: configForStage', () => {
  const containerEnv = { [ACCOUNT_OVERRIDE_FLAG]: '333333333333', [REGION_OVERRIDE_FLAG]: 'eu-west-3' };

  test('a declared stage is returned unchanged', () => {
    const selected = configForStage(CONFIG, 'dev', containerEnv)!;
    expect(selected.adHoc).toBe(false);
    expect(selected.config).toBe(CONFIG);
    expect(selected.stage.name).toBe('dev');
  });

  test('outside the container contract an undeclared stage is still refused', () => {
    expect(configForStage(CONFIG, 'SBCD', {})).toBeUndefined();
    expect(configForStage(CONFIG, 'SBCD', { [ACCOUNT_OVERRIDE_FLAG]: '333333333333' })).toBeUndefined();
  });

  test('under the container contract an undeclared stage resolves from the overrides, with no image stages', () => {
    const empty = { ...CONFIG, stages: [] } as unknown as ResolvedCicdConfig;
    const selected = configForStage(empty, 'SBCD', containerEnv)!;
    expect(selected.adHoc).toBe(true);
    expect(selected.stage).toMatchObject({ name: 'SBCD', manualApproval: false });
    const targets = synthTargets(selected.config, 'SBCD', 'eu-west-3', containerEnv);
    expect(targets).toEqual([expect.objectContaining({ stage: 'SBCD', region: 'eu-west-3', account: '333333333333' })]);
  });

  test('an environment-agnostic container target still yields one ambient-region target', () => {
    const env = { [ACCOUNT_OVERRIDE_FLAG]: '', [REGION_OVERRIDE_FLAG]: '', AWS_REGION: 'eu-central-1' };
    const selected = configForStage(CONFIG, 'SBCD', env)!;
    expect(synthTargets(selected.config, 'SBCD', undefined, env).map((t) => t.region)).toEqual(['eu-central-1']);
  });
});

describe('cdk-cicd synth: stages and pipeline stack on different bootstrap qualifiers', () => {
  test("warns only when the repository sets a context that differs from the stages' qualifier", () => {
    const fromCdkJson = (value: unknown) => ({ value, file: 'cdk.json' as const });
    expect(qualifierMismatchWarning('myapp', fromCdkJson('myapp'))).toBeUndefined();
    // No context: the pipeline stack is on the CDK's own qualifier, as every pre-context pipeline is. No warning.
    expect(qualifierMismatchWarning('myapp', undefined)).toBeUndefined();
    // No stages' qualifier (no `qualifier`, no `application`): the stages fall back to the context themselves.
    expect(qualifierMismatchWarning(undefined, fromCdkJson('acme'))).toBeUndefined();
    const warning = qualifierMismatchWarning('renamedap', fromCdkJson('myapp'));
    expect(warning).toMatch(
      /stages use bootstrap qualifier 'renamedap', but cdk\.json sets @aws-cdk\/core:bootstrapQualifier to 'myapp'/,
    );
    // Each side names the bootstrap it needs, and the low-risk fix pins the stages to the pipeline's qualifier.
    expect(warning).toMatch(/need the 'myapp' bootstrap, and each stage's account and Region the 'renamedap' one/);
    expect(warning).toMatch(/set `qualifier: 'myapp'` in cicd\.config\.ts/);
    expect(warning).toMatch(/Renaming `application` changes a qualifier derived from it/);
    expect(qualifierMismatchWarning('a', { value: 'b', file: 'cdk.context.json' })).toMatch(
      /but cdk\.context\.json sets/,
    );
  });

  test('reads the context as the CDK CLI looks it up: cdk.json before cdk.context.json', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-cicd-synth-qualifier-'));
    try {
      expect(contextBootstrapQualifier(dir)).toBeUndefined();
      fs.writeFileSync(
        path.join(dir, 'cdk.context.json'),
        JSON.stringify({ '@aws-cdk/core:bootstrapQualifier': 'other' }),
      );
      expect(contextBootstrapQualifier(dir)).toEqual({ value: 'other', file: 'cdk.context.json' });
      fs.writeFileSync(
        path.join(dir, 'cdk.json'),
        JSON.stringify({ app: 'x', context: { '@aws-cdk/core:bootstrapQualifier': 'myapp' } }),
      );
      expect(contextBootstrapQualifier(dir)).toEqual({ value: 'myapp', file: 'cdk.json' });
      fs.writeFileSync(path.join(dir, 'cdk.json'), '{ not json');
      expect(contextBootstrapQualifier(dir)).toEqual({ value: 'other', file: 'cdk.context.json' });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
