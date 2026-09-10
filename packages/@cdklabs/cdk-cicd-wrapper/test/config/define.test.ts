// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { defineCICD, defineDeployment, resolveCicdConfig } from '../../src/config/define';
import { Repository } from '../../src/config/repository';
import { EngineType, RegionOrder, SynthesizerType } from '../../src/config/types';

const REPO = Repository.github('org/repo');

describe('m3-config: defineCICD stage normalization', () => {
  test('a bare-name stage becomes an object with an empty (env-agnostic) region list', () => {
    const cfg = defineCICD({ repository: REPO, stages: ['dev'] });
    expect(cfg.stages[0]).toEqual({
      name: 'dev',
      env: { account: undefined, regions: [], regionOrder: RegionOrder.SEQUENTIAL },
      manualApproval: false,
      deployment: undefined,
    });
  });

  test('single region and region list both normalize to a regions[] with a default order', () => {
    const single = defineCICD({ repository: REPO, stages: [{ name: 'a', env: { region: 'us-west-2' } }] });
    expect(single.stages[0].env.regions).toEqual(['us-west-2']);
    expect(single.stages[0].env.regionOrder).toBe(RegionOrder.SEQUENTIAL);

    const many = defineCICD({
      repository: REPO,
      stages: [{ name: 'a', env: { regions: ['us-west-2', 'us-west-1'], regionOrder: RegionOrder.PARALLEL } }],
    });
    expect(many.stages[0].env.regions).toEqual(['us-west-2', 'us-west-1']);
    expect(many.stages[0].env.regionOrder).toBe(RegionOrder.PARALLEL);
  });

  test('manualApproval defaults by stage name and an explicit value always wins', () => {
    const cfg = defineCICD({
      repository: REPO,
      stages: ['dev', 'res', 'prod', 'staging', { name: 'dev', manualApproval: true }],
    });
    expect(cfg.stages.map((s) => s.manualApproval)).toEqual([false, false, true, true, true]);
  });

  test('deployment roles pass through unchanged', () => {
    const cfg = defineCICD({
      repository: REPO,
      stages: [{ name: 'prod', deployment: { deployRole: 'arn:role/deploy', cfnExecutionRole: 'arn:role/cfn' } }],
    });
    expect(cfg.stages[0].deployment).toEqual({ deployRole: 'arn:role/deploy', cfnExecutionRole: 'arn:role/cfn' });
  });
});

describe('m3-config: defineCICD top-level defaults', () => {
  test('qualifier is derived from application: lowercased, alphanumeric, <=10 chars', () => {
    expect(defineCICD({ application: 'My-App_2024!', repository: REPO, stages: [] }).qualifier).toBe('myapp2024');
    expect(defineCICD({ application: 'averylongapplicationname', repository: REPO, stages: [] }).qualifier).toBe(
      'averylonga',
    );
  });

  test('an explicit qualifier wins and is trimmed, while no application means no derived qualifier', () => {
    expect(defineCICD({ application: 'app', qualifier: '  custom_1  ', repository: REPO, stages: [] }).qualifier).toBe(
      'custom_1',
    );
    expect(defineCICD({ repository: REPO, stages: [] }).qualifier).toBeUndefined();
  });

  test.each(['', '   ', 'invalid qualifier', 'invalid!', '12345678901'])(
    'rejects an invalid explicit qualifier %j',
    (qualifier) => {
      expect(() => defineCICD({ qualifier, repository: REPO, stages: [] })).toThrow(
        /explicit bootstrap qualifier.*\[A-Za-z0-9_-\]\{1,10\}/,
      );
    },
  );

  test('an application that sanitizes to nothing falls back to a valid qualifier', () => {
    // e.g. an all-punctuation name -> no alphanumerics left -> must not yield an empty qualifier.
    expect(defineCICD({ application: '!!!', repository: REPO, stages: [] }).qualifier).toBe('cdkcicd');
  });

  test('engine defaults to CODEPIPELINE and ci defaults to empty (engine supplies its own steps)', () => {
    const cfg = defineCICD({ repository: REPO, stages: [] });
    expect(cfg.engine).toBe(EngineType.CODEPIPELINE);
    expect(cfg.ci).toEqual({
      steps: {},
      synthStages: [],
      image: undefined,
      codeBuildImageCredentials: undefined,
    });
  });

  test("ci.synthStages 'all' collapses to an empty list; an explicit list is kept", () => {
    expect(defineCICD({ repository: REPO, stages: [], ci: { synthStages: 'all' } }).ci.synthStages).toEqual([]);
    expect(defineCICD({ repository: REPO, stages: [], ci: { synthStages: ['dev'] } }).ci.synthStages).toEqual(['dev']);
  });

  test('ci.steps, image, and CodeBuild image credentials pass through', () => {
    const codeBuildImageCredentials = {
      secretArn: 'arn:aws:secretsmanager:us-west-2:111111111111:secret:registry-ABC123',
      encryptionKeyArn: 'arn:aws:kms:us-west-2:111111111111:key/EXAMPLE_NOT_A_SECRET',
    };
    const cfg = defineCICD({
      repository: REPO,
      stages: [],
      ci: {
        steps: { lint: 'npx cdk-cicd validate' },
        image: 'registry.example.com/private/node:24',
        codeBuildImageCredentials,
      },
    });
    expect(cfg.ci.steps).toEqual({ lint: 'npx cdk-cicd validate' });
    expect(cfg.ci.image).toBe('registry.example.com/private/node:24');
    expect(cfg.ci.codeBuildImageCredentials).toEqual(codeBuildImageCredentials);
  });

  test('CodeBuild image credentials require ci.image', () => {
    expect(() =>
      defineCICD({
        repository: REPO,
        stages: [],
        ci: {
          codeBuildImageCredentials: {
            secretArn: 'arn:aws:secretsmanager:us-west-2:111111111111:secret:registry-ABC123',
          },
        },
      }),
    ).toThrow(/ci\.codeBuildImageCredentials requires ci\.image/);
  });

  test('synthesizer defaults to DEFAULT and an explicit type wins', () => {
    expect(defineCICD({ repository: REPO, stages: [] }).synthesizer.type).toBe(SynthesizerType.DEFAULT);
    const appStaging = defineCICD({
      application: 'payments',
      repository: REPO,
      stages: [],
      synthesizer: { type: SynthesizerType.APP_STAGING, appId: 'payments-v2' },
    });
    expect(appStaging.qualifier).toBe('payments');
    expect(appStaging.synthesizer.type).toBe(SynthesizerType.APP_STAGING);
    expect(appStaging.synthesizer.appId).toBe('payments-v2');
  });

  test('APP_STAGING preserves custom qualifiers and deployment identities for direct use', () => {
    const deployment = {
      deployRole: 'arn:aws:iam::111111111111:role/deploy',
      cfnExecutionRole: 'arn:aws:iam::111111111111:role/cfn-exec',
    };
    const config = defineCICD({
      repository: REPO,
      stages: [{ name: 'prod', deployment }],
      qualifier: 'custom123',
      synthesizer: { type: SynthesizerType.APP_STAGING, appId: 'payments-v2' },
    });

    expect(config.qualifier).toBe('custom123');
    expect(config.stages[0].deployment).toEqual(deployment);
    expect(
      defineCICD({
        repository: REPO,
        stages: [],
        engine: EngineType.CDK_PIPELINES,
        synthesizer: { type: SynthesizerType.APP_STAGING, appId: 'payments-v2' },
      }).synthesizer.type,
    ).toBe(SynthesizerType.APP_STAGING);
  });

  test('APP_STAGING rejects deploy-role ExternalIds but permits role-only and blank identity values', () => {
    expect(() =>
      defineCICD({
        repository: REPO,
        stages: [
          {
            name: 'prod',
            deployment: {
              deployRole: 'arn:aws:iam::111111111111:role/deploy',
              externalId: 'stage-external-id',
            },
          },
        ],
        synthesizer: { type: SynthesizerType.APP_STAGING, appId: 'payments-v2' },
      }),
    ).toThrow(/cannot use a deploy-role ExternalId.*stage 'prod'/s);
    expect(() =>
      resolveCicdConfig({
        repository: REPO,
        deployRoleExternalId: 'pipeline-external-id',
        stages: [
          {
            name: 'prod',
            deployment: { deployRole: 'arn:aws:iam::111111111111:role/deploy' },
          },
        ],
        synthesizer: { type: SynthesizerType.APP_STAGING, appId: 'payments-v2' },
      }),
    ).toThrow(/cannot use a deploy-role ExternalId.*stage 'prod'/s);
    expect(() =>
      defineCICD({
        repository: REPO,
        stages: [{ name: 'prod', deployment: { deployRole: ' ', cfnExecutionRole: ' ', externalId: ' ' } }],
        synthesizer: { type: SynthesizerType.APP_STAGING, appId: 'payments-v2' },
      }),
    ).not.toThrow();
  });

  test('codeArtifact defaults to undefined (opt-in) and an explicit config passes through unchanged', () => {
    expect(defineCICD({ repository: REPO, stages: [] }).codeArtifact).toBeUndefined();
    const codeArtifact = { domain: 'd', repository: 'r', npmScope: 'cdklabs' };
    expect(defineCICD({ repository: REPO, stages: [], codeArtifact }).codeArtifact).toEqual(codeArtifact);
  });

  test('codeBuildEnvSettings defaults to undefined (opt-in) and an explicit config passes through unchanged', () => {
    expect(defineCICD({ repository: REPO, stages: [] }).codeBuildEnvSettings).toBeUndefined();
    const codeBuildEnvSettings = { privileged: true, environmentVariables: { FOO: { value: 'bar' } } };
    expect(defineCICD({ repository: REPO, stages: [], codeBuildEnvSettings }).codeBuildEnvSettings).toEqual(
      codeBuildEnvSettings,
    );
  });

  test('vpc defaults to undefined (opt-in) and an explicit config passes through unchanged', () => {
    expect(defineCICD({ repository: REPO, stages: [] }).vpc).toBeUndefined();
    const vpc = { managedVpc: { cidrBlock: '10.0.0.0/16' } };
    expect(defineCICD({ repository: REPO, stages: [], vpc }).vpc).toEqual(vpc);
  });

  test('private dependency KMS key ARNs survive normalization', () => {
    const npmRegistry = {
      url: 'https://npm.example.com/',
      basicAuthSecretArn: 'arn:aws:secretsmanager:us-west-2:111111111111:secret:npm',
      encryptionKeyArn: 'arn:aws:kms:us-west-2:111111111111:key/npm-key',
    };
    const proxy = {
      proxySecretArn: 'arn:aws:secretsmanager:us-west-2:111111111111:secret:proxy',
      encryptionKeyArn: 'arn:aws:kms:us-west-2:111111111111:key/proxy-key',
    };
    const cfg = defineCICD({ repository: REPO, stages: [], npmRegistry, proxy });
    expect(cfg.npmRegistry).toEqual(npmRegistry);
    expect(cfg.proxy?.encryptionKeyArn).toBe(proxy.encryptionKeyArn);
  });

  test('m9-migrate-compliance-bucket: managed creation defaults on and an existing bucket is explicit', () => {
    const defaults = defineCICD({ repository: REPO, stages: [] });
    expect(defaults.complianceLogBucketName).toBeUndefined();
    expect(defaults.createComplianceLogBucket).toBe(true);

    const existing = defineCICD({
      repository: REPO,
      stages: [],
      complianceLogBucketName: 'my-compliance-bucket',
      createComplianceLogBucket: false,
    });
    expect(existing.complianceLogBucketName).toEqual('my-compliance-bucket');
    expect(existing.createComplianceLogBucket).toBe(false);
  });

  test('m9-migrate-compliance-bucket: existing-bucket mode requires a name', () => {
    expect(() => defineCICD({ repository: REPO, stages: [], createComplianceLogBucket: false })).toThrow(
      /requires complianceLogBucketName/,
    );
  });

  test('warmAccountsFromSsm defaults to false (opt-in) and an explicit true passes through', () => {
    expect(defineCICD({ repository: REPO, stages: [] }).warmAccountsFromSsm).toBe(false);
    // Enabling it requires a resolvable qualifier (see the guard test below), so supply one here.
    expect(
      defineCICD({ repository: REPO, stages: [], warmAccountsFromSsm: true, qualifier: 'shopq' }).warmAccountsFromSsm,
    ).toBe(true);
  });

  test('warmAccountsFromSsm without a resolvable qualifier is a config-time error', () => {
    // No qualifier and no application => qualifier is undefined => the SSM grant could only widen to
    // parameter/*/*, so defineCICD rejects it rather than emit an over-broad grant.
    expect(() => defineCICD({ repository: REPO, stages: [], warmAccountsFromSsm: true })).toThrow(
      /warmAccountsFromSsm requires a resolvable qualifier/,
    );
    // A derived qualifier (from application) satisfies it.
    expect(
      defineCICD({ application: 'shop', repository: REPO, stages: [], warmAccountsFromSsm: true }).warmAccountsFromSsm,
    ).toBe(true);
  });

  test('resolveCicdConfig (the YAML path) produces the same result as defineCICD', () => {
    const props = { application: 'shop', repository: REPO, stages: ['dev', 'prod'] };
    expect(resolveCicdConfig(props)).toEqual(defineCICD(props));
  });
});

describe('m6-container: defineDeployment target normalization (Repo 2)', () => {
  test('normalizes and validates explicit qualifiers with the same contract as defineCICD', () => {
    expect(
      defineDeployment({
        qualifier: '  deploy_1 ',
        image: 'img:tag',
        targets: [{ stage: 'dev' }],
      }).qualifier,
    ).toBe('deploy_1');

    for (const qualifier of ['', '   ', 'invalid qualifier', 'invalid!', '12345678901']) {
      expect(() => defineDeployment({ qualifier, image: 'img:tag', targets: [{ stage: 'dev' }] })).toThrow(
        /explicit bootstrap qualifier.*\[A-Za-z0-9_-\]\{1,10\}/,
      );
    }
  });

  test('derives the qualifier and preserves the app-staging identity', () => {
    const cfg = defineDeployment({
      application: 'Payments-Service',
      synthesizer: { type: SynthesizerType.APP_STAGING, appId: 'payments-assets' },
      image: 'img:tag',
      targets: [{ stage: 'dev' }],
    });

    expect(cfg.application).toBe('Payments-Service');
    expect(cfg.qualifier).toBe('paymentsse');
    expect(cfg.synthesizer).toEqual({
      type: SynthesizerType.APP_STAGING,
      appId: 'payments-assets',
    });
  });

  test('Repo 2 APP_STAGING preserves custom qualifiers and deployment identities for direct use', () => {
    const deployment = {
      deployRole: 'arn:aws:iam::111111111111:role/deploy',
      cfnExecutionRole: 'arn:aws:iam::111111111111:role/cfn-exec',
    };
    const config = defineDeployment({
      qualifier: 'custom123',
      synthesizer: { type: SynthesizerType.APP_STAGING, appId: 'payments-assets' },
      image: 'img:tag',
      targets: [{ stage: 'prod', deployment }],
    });

    expect(config.qualifier).toBe('custom123');
    expect(config.targets[0].deployment).toEqual(deployment);
  });

  test('Repo 2 APP_STAGING rejects deploy-role ExternalIds but permits role-only and blank identity values', () => {
    expect(() =>
      defineDeployment({
        synthesizer: { type: SynthesizerType.APP_STAGING, appId: 'payments-assets' },
        image: 'img:tag',
        targets: [
          {
            stage: 'prod',
            deployment: {
              deployRole: 'arn:aws:iam::111111111111:role/deploy',
              externalId: 'target-external-id',
            },
          },
        ],
      }),
    ).toThrow(/cannot use a deploy-role ExternalId.*target 'prod'/s);
    expect(() =>
      defineDeployment({
        synthesizer: { type: SynthesizerType.APP_STAGING, appId: 'payments-assets' },
        image: 'img:tag',
        targets: [
          {
            stage: 'prod',
            deployment: { cfnExecutionRole: 'arn:aws:iam::111111111111:role/cfn-exec' },
          },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      defineDeployment({
        synthesizer: { type: SynthesizerType.APP_STAGING, appId: 'payments-assets' },
        image: 'img:tag',
        targets: [{ stage: 'prod', deployment: { deployRole: ' ', cfnExecutionRole: ' ', externalId: ' ' } }],
      }),
    ).not.toThrow();
  });

  test('the image passes through and targets keep their order', () => {
    const cfg = defineDeployment({
      image: 'acct.dkr.ecr.eu-west-1.amazonaws.com/my-app-deployer:1.4.2',
      targets: [{ stage: 'dev' }, { stage: 'prod' }],
    });
    expect(cfg.image).toBe('acct.dkr.ecr.eu-west-1.amazonaws.com/my-app-deployer:1.4.2');
    expect(cfg.targets.map((t) => t.stage)).toEqual(['dev', 'prod']);
  });

  test('a target with no env becomes environment-agnostic (empty region list)', () => {
    const cfg = defineDeployment({ image: 'img:tag', targets: [{ stage: 'dev' }] });
    expect(cfg.targets[0]).toEqual({
      stage: 'dev',
      env: { account: undefined, regions: [], regionOrder: RegionOrder.SEQUENTIAL },
      manualApproval: false,
      deployment: undefined,
      complianceLogBucketName: undefined,
      complianceLogBucketAccount: undefined,
      complianceLogBucketRegion: undefined,
    });
  });

  test('single region and region list both normalize to a regions[] with a default order', () => {
    const single = defineDeployment({ image: 'img:tag', targets: [{ stage: 'a', env: { region: 'us-west-2' } }] });
    expect(single.targets[0].env.regions).toEqual(['us-west-2']);
    expect(single.targets[0].env.regionOrder).toBe(RegionOrder.SEQUENTIAL);

    const many = defineDeployment({
      image: 'img:tag',
      targets: [{ stage: 'a', env: { regions: ['us-west-2', 'us-west-1'], regionOrder: RegionOrder.PARALLEL } }],
    });
    expect(many.targets[0].env.regions).toEqual(['us-west-2', 'us-west-1']);
    expect(many.targets[0].env.regionOrder).toBe(RegionOrder.PARALLEL);
  });

  test('manualApproval defaults by stage name (same rule as stages) and an explicit value wins', () => {
    const cfg = defineDeployment({
      image: 'img:tag',
      targets: [{ stage: 'dev' }, { stage: 'res' }, { stage: 'prod' }, { stage: 'dev', manualApproval: true }],
    });
    expect(cfg.targets.map((t) => t.manualApproval)).toEqual([false, false, true, true]);
  });

  test('repository is optional and passes through for the CD pipeline path', () => {
    expect(defineDeployment({ image: 'img:1', targets: [{ stage: 'dev' }] }).repository).toBeUndefined();
    const repo = Repository.codecommit('my-deploy-config');
    expect(defineDeployment({ image: 'img:1', repository: repo, targets: [{ stage: 'dev' }] }).repository).toBe(repo);
  });

  test('cross-account ECR repository-policy acknowledgement passes through', () => {
    expect(
      defineDeployment({
        image: '222222222222.dkr.ecr.us-west-2.amazonaws.com/deployer:1',
        targets: [{ stage: 'dev' }],
        crossAccountEcrRepositoryPolicyConfigured: true,
      }).crossAccountEcrRepositoryPolicyConfigured,
    ).toBe(true);
  });

  test('a per-target image pins that stage version; top-level image is optional (the default)', () => {
    const cfg = defineDeployment({
      image: 'repo:base',
      targets: [
        { stage: 'dev', image: 'repo:dev-42' }, // its own version
        { stage: 'prod' }, // falls back to the top-level default
      ],
    });
    expect(cfg.targets[0].image).toBe('repo:dev-42');
    expect(cfg.targets[1].image).toBeUndefined();
    expect(cfg.image).toBe('repo:base');
    // top-level image may be omitted entirely when every target pins its own
    const noDefault = defineDeployment({ targets: [{ stage: 'dev', image: 'repo:dev-42' }] });
    expect(noDefault.image).toBeUndefined();
    expect(noDefault.targets[0].image).toBe('repo:dev-42');
  });

  test('codeArtifact passes through for the CD build (pre-release CLI install)', () => {
    const ca = { domain: 'd', repository: 'r', npmScope: 'cdklabs' };
    expect(defineDeployment({ image: 'i:1', codeArtifact: ca, targets: [{ stage: 'dev' }] }).codeArtifact).toEqual(ca);
  });

  test('the target account and forced roles pass through unchanged', () => {
    const cfg = defineDeployment({
      image: 'img:tag',
      targets: [
        {
          stage: 'prod',
          env: { account: '333333333333', region: 'eu-west-1' },
          deployment: { deployRole: 'arn:role/deploy' },
        },
      ],
    });
    expect(cfg.targets[0].env.account).toBe('333333333333');
    expect(cfg.targets[0].deployment).toEqual({ deployRole: 'arn:role/deploy' });
  });

  test('Repo 2 compliance logging resolves a config default and a per-target override to concrete coordinates', () => {
    const cfg = defineDeployment({
      image: 'img:tag',
      complianceLogBucketName: 'shared-compliance-111111111111',
      targets: [
        { stage: 'dev', env: { account: '111111111111', region: 'eu-west-1' } },
        {
          stage: 'prod',
          env: { account: '222222222222', region: 'us-east-1' },
          complianceLogBucketName: 'prod-compliance-222222222222',
        },
      ],
    });

    expect(cfg.complianceLogBucketName).toBe('shared-compliance-111111111111');
    expect(cfg.targets[0]).toEqual(
      expect.objectContaining({
        complianceLogBucketName: 'shared-compliance-111111111111',
        complianceLogBucketAccount: '111111111111',
        complianceLogBucketRegion: 'eu-west-1',
      }),
    );
    expect(cfg.targets[1]).toEqual(
      expect.objectContaining({
        complianceLogBucketName: 'prod-compliance-222222222222',
        complianceLogBucketAccount: '222222222222',
        complianceLogBucketRegion: 'us-east-1',
      }),
    );
  });

  test.each([
    {
      name: 'an account-agnostic target',
      target: { stage: 'dev', env: { region: 'eu-west-1' } },
      error: /requires a concrete 12-digit env\.account/,
    },
    {
      name: 'a region-agnostic target',
      target: { stage: 'dev', env: { account: '111111111111' } },
      error: /requires exactly one concrete AWS Region/,
    },
    {
      name: 'a multi-region target',
      target: {
        stage: 'dev',
        env: { account: '111111111111', regions: ['eu-west-1', 'us-east-1'] },
      },
      error: /requires exactly one concrete AWS Region/,
    },
    {
      name: 'an invalid bucket name',
      target: {
        stage: 'dev',
        env: { account: '111111111111', region: 'eu-west-1' },
        complianceLogBucketName: 'Invalid Bucket',
      },
      error: /must be a valid 3-63 character S3 bucket name/,
    },
  ])('Repo 2 compliance logging rejects $name', ({ target, error }) => {
    expect(() =>
      defineDeployment({
        image: 'img:tag',
        complianceLogBucketName: target.complianceLogBucketName === undefined ? 'compliance-logs' : undefined,
        targets: [target],
      }),
    ).toThrow(error);
  });

  test('Repo 2 rejects one bucket name assigned to different account/Region coordinates', () => {
    expect(() =>
      defineDeployment({
        image: 'img:tag',
        complianceLogBucketName: 'shared-compliance-logs',
        targets: [
          { stage: 'dev', env: { account: '111111111111', region: 'eu-west-1' } },
          { stage: 'prod', env: { account: '222222222222', region: 'us-east-1' } },
        ],
      }),
    ).toThrow(/assigned to both 111111111111\/eu-west-1 and 222222222222\/us-east-1/);
  });
});
