// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import {
  defineDeployment,
  deploymentPipelineShapeFingerprint,
  RegionOrder,
  Repository,
  ResolvedDeploymentConfig,
} from '@cdklabs/cdk-cicd-wrapper';
import {
  assertPipelineShape,
  parseStagePlans,
  pipelineTarget,
  planOutput,
  planStages,
  readPipelineContext,
  StagePlan,
  targetFingerprint,
} from '../../src/cmds/autopilot/DeploymentFingerprint';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;

/**
 * The environment `deploy-ci` gives the CD pipeline's CodeBuild projects for `config`, synthesized in
 * account 111111111111 / eu-west-1 with the default qualifier. The wrapper's DeploymentPipeline tests
 * assert the synthesized projects carry exactly these values.
 */
function pipelineEnvironment(config: ResolvedDeploymentConfig): NodeJS.ProcessEnv {
  const qualifier = config.qualifier ?? 'hnb659fds';
  const environments = Object.fromEntries(
    config.targets.map((target) => [
      target.stage,
      {
        account: target.env.account ?? '111111111111',
        regions: target.env.regions.length > 0 ? target.env.regions : ['eu-west-1'],
      },
    ]),
  );
  return {
    EXPECTED_DEPLOYMENT_TOPOLOGY: deploymentPipelineShapeFingerprint(config, environments, 'aws', qualifier),
    CDK_CICD_TARGET_ENVIRONMENTS: JSON.stringify(environments),
    CDK_CICD_QUALIFIER: qualifier,
    CDK_CICD_PARTITION: 'aws',
  };
}

/** A deploy.config as `cdk-cicd` loads it from the checked-out repository: plain JSON-shaped data. */
const asLoaded = (config: ResolvedDeploymentConfig): ResolvedDeploymentConfig => JSON.parse(JSON.stringify(config));

const parallelConfig = () =>
  asLoaded({
    ...defineDeployment({
      application: 'shop',
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app',
      repository: Repository.codecommit('cfg'),
      targets: [
        {
          stage: 'dev',
          env: { account: '111111111111', regions: ['eu-west-1', 'us-east-1'], regionOrder: RegionOrder.PARALLEL },
        },
      ],
    }),
    // A custom standard-bootstrap qualifier is part of the pipeline shape.
    qualifier: 'shopqual',
  });

describe('pipeline shape check (synth and CLI agree)', () => {
  test('passes for the config the pipeline was synthesized from', () => {
    const config = parallelConfig();
    expect(() => assertPipelineShape(config, readPipelineContext(pipelineEnvironment(config)))).not.toThrow();
  });

  test.each([
    ['the qualifier', (c: any) => ({ ...c, qualifier: 'changedq' })],
    ['the source branch', (c: any) => ({ ...c, repository: { ...c.repository, branch: 'release' } })],
    [
      'a parallel region',
      (c: any) => ({
        ...c,
        targets: [
          { ...c.targets[0], env: { ...c.targets[0].env, regions: [...c.targets[0].env.regions, 'ap-southeast-2'] } },
        ],
      }),
    ],
    [
      'a target',
      (c: any) => ({
        ...c,
        targets: [
          ...c.targets,
          { stage: 'prod', env: { regions: ['eu-west-1'], regionOrder: 'sequential' }, manualApproval: true },
        ],
      }),
    ],
    [
      'alwaysApprove',
      (c: any) => ({ ...c, targets: [{ ...c.targets[0], manualApproval: true, alwaysApprove: true }] }),
    ],
  ])('fails, naming deploy-ci, when deploy.config changes %s', (_what, change) => {
    const config = parallelConfig();
    const context = readPipelineContext(pipelineEnvironment(config));
    expect(() => assertPipelineShape(change(config), context)).toThrow(
      're-run cdk-cicd deploy-ci to update its actions and permissions',
    );
  });

  test('a role ARN written with placeholders and the same ARN written concretely are one shape', () => {
    const withRoles = (deployRole: string, cfnExecutionRole: string) =>
      asLoaded(
        defineDeployment({
          qualifier: 'shopq',
          image: 'example.com/app:1',
          repository: Repository.codecommit('cfg'),
          targets: [
            {
              stage: 'prod',
              env: { account: '222222222222', region: 'eu-west-1' },
              deployment: { deployRole, cfnExecutionRole },
            },
          ],
        }),
      );
    const placeholder = withRoles(
      'arn:${AWS::Partition}:iam::${AWS::AccountId}:role/cdk-${Qualifier}-deployer-${AWS::Region}',
      'arn:${AWS::Partition}:iam::${AWS::AccountId}:role/cdk-${Qualifier}-cfn-exec-${AWS::Region}',
    );
    const concrete = withRoles(
      'arn:aws:iam::222222222222:role/cdk-shopq-deployer-eu-west-1',
      'arn:aws:iam::222222222222:role/cdk-shopq-cfn-exec-eu-west-1',
    );
    expect(() => assertPipelineShape(concrete, readPipelineContext(pipelineEnvironment(placeholder)))).not.toThrow();
  });

  test('refuses to run outside the CD pipeline', () => {
    expect(() => readPipelineContext({})).toThrow(/EXPECTED_DEPLOYMENT_TOPOLOGY.*not set/);
  });
});

describe('targetFingerprint', () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'cdk-cicd-fingerprint-'));
    mkdirSync(path.join(cwd, 'config'));
    writeFileSync(path.join(cwd, 'config', 'dev.json'), JSON.stringify({ version: '1.2.3' }));
    writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { cli: '1.0.0' } }));
    writeFileSync(path.join(cwd, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }));
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  const config = parallelConfig();
  const target = config.targets[0];
  const lookups: Array<[string, string]> = [];
  const fingerprint = (digest = DIGEST_A, overrides: Partial<ResolvedDeploymentConfig['targets'][0]> = {}) =>
    targetFingerprint(config, { ...target, ...overrides }, 'eu-west-1', cwd, {
      resolveDigest: (repository, tag) => (lookups.push([repository.repositoryName, tag]), digest),
    });
  const write = (file: string, value: unknown) =>
    writeFileSync(path.join(cwd, file), typeof value === 'string' ? value : JSON.stringify(value));

  test('resolves a tag to its digest, so re-pushing the same tag is a change', () => {
    lookups.length = 0;
    const first = fingerprint();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(lookups).toEqual([['app', '1.2.3']]);
    expect(fingerprint(DIGEST_B)).not.toBe(first);
    expect(fingerprint()).toBe(first);
  });

  test('a digest-pinned image needs no lookup', () => {
    lookups.length = 0;
    fingerprint(DIGEST_A, { image: `111111111111.dkr.ecr.eu-west-1.amazonaws.com/app@${DIGEST_A}` });
    expect(lookups).toEqual([]);
  });

  test('a non-ECR image needs no AWS call', () => {
    const nonEcr = { ...config, image: 'registry.example.com/team/app:base' };
    expect(
      targetFingerprint(nonEcr, nonEcr.targets[0], undefined, cwd, {
        resolveDigest: () => {
          throw new Error('AWS must not be called');
        },
      }),
    ).toMatch(/^[0-9a-f]{64}$/);
  });

  test('the version, stage configuration, manifest and lockfile are all inputs', () => {
    const base = fingerprint();
    write('config/dev.json', { version: '1.2.4' });
    expect(fingerprint()).not.toBe(base);
    write('config/dev.json', { version: '1.2.3', greeting: 'alpha' });
    const alpha = fingerprint();
    expect(alpha).not.toBe(base);
    write('config/dev.json', { version: '1.2.3', greeting: 'bravo' });
    expect(fingerprint()).not.toBe(alpha);
    // A version-only file contributes nothing beyond the version.
    write('config/dev.json', { version: '1.2.3' });
    expect(fingerprint()).toBe(base);

    write('package.json', { dependencies: { cli: '1.0.1' } });
    expect(fingerprint()).not.toBe(base);
    write('package.json', { dependencies: { cli: '1.0.0' } });
    write('package-lock.json', { lockfileVersion: 3, packages: {} });
    expect(fingerprint()).not.toBe(base);
  });

  test('fails on a malformed stage file instead of hiding it behind a skip', () => {
    write('config/dev.json', '{');
    expect(() => fingerprint()).toThrow('exists but could not be read as JSON');
    write('config/dev.json', { version: ' 1.2.3 ' });
    expect(() => fingerprint()).toThrow('must contain a non-empty string version field');
  });

  test('an autoDeploy target fingerprints the newest pushed image', () => {
    const seen: string[] = [];
    const auto = { ...target, autoDeploy: true };
    const run = (newest: string) =>
      targetFingerprint(config, auto, 'eu-west-1', cwd, {
        resolveLatestImage: (image) => (seen.push(image), `111111111111.dkr.ecr.eu-west-1.amazonaws.com/app@${newest}`),
        resolveDigest: () => {
          throw new Error('a pinned digest needs no tag lookup');
        },
      });
    const first = run(DIGEST_A);
    expect(seen).toEqual(['111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1.2.3']);
    expect(run(DIGEST_B)).not.toBe(first);
  });
});

describe('pipelineTarget', () => {
  test('a sequential action for a target that became parallel fails, naming deploy-ci', () => {
    expect(() => pipelineTarget(parallelConfig(), 'dev', undefined)).toThrow('now needs parallel region actions');
    expect(pipelineTarget(parallelConfig(), 'dev', 'eu-west-1').stage).toBe('dev');
    expect(() => pipelineTarget(parallelConfig(), 'nope', undefined)).toThrow('no deployment target named nope');
  });
});

describe('planStages', () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'cdk-cicd-plan-'));
    mkdirSync(path.join(cwd, 'config'));
    writeFileSync(path.join(cwd, 'config', 'dev.json'), JSON.stringify({ version: '1.0.0' }));
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  const config = asLoaded(
    defineDeployment({
      image: 'registry.example.com/team/app:base',
      repository: Repository.codecommit('cfg'),
      targets: [
        { stage: 'dev', env: { account: '111111111111', region: 'eu-west-1' } },
        { stage: 'prod', env: { account: '111111111111', region: 'eu-west-1' }, manualApproval: true },
      ],
    }),
  );
  const plans: StagePlan[] = [
    { variable: 'CDK_CICD_RUN_1', stage: 'Deploy-1', units: [{ target: 'dev', parameter: '/state/dev' }] },
    { variable: 'CDK_CICD_RUN_2', stage: 'Deploy-2', units: [{ target: 'prod', parameter: '/state/prod' }] },
  ];
  const current = (stage: string) =>
    targetFingerprint(
      config,
      config.targets.find((t) => t.stage === stage)!,
      undefined,
      cwd,
    );

  test('skips a stage whose stored fingerprint matches and runs one that changed or never deployed', () => {
    const state: Record<string, string> = { '/state/dev': current('dev'), '/state/prod': '' };
    const decisions = planStages(config, plans, cwd, (name) => state[name]);
    expect(decisions.map((d) => [d.stage, d.run])).toEqual([
      ['Deploy-1', false],
      ['Deploy-2', true],
    ]);
    expect(decisions[1].reasons).toEqual(['prod: never deployed']);
    expect(planOutput(decisions)).toBe('CDK_CICD_RUN_1=false\nCDK_CICD_RUN_2=true\n');

    state['/state/prod'] = 'f'.repeat(64);
    expect(planStages(config, plans, cwd, (name) => state[name])[1].reasons).toEqual(['prod: changed']);
  });

  test('a unit it cannot check runs, so its deploy action reports the real error', () => {
    writeFileSync(path.join(cwd, 'config', 'dev.json'), '{');
    const decisions = planStages(config, plans, cwd, () => {
      throw new Error('AccessDenied');
    });
    expect(decisions.every((d) => d.run)).toBe(true);
    expect(decisions[0].reasons[0]).toMatch(
      /^dev: could not be checked \(.*could not be read as JSON.*\); running it$/,
    );
    expect(decisions[1].reasons[0]).toContain('AccessDenied');
  });

  test('a stage runs when any of its units changed', () => {
    const state: Record<string, string> = { '/state/dev': current('dev'), '/state/prod': current('prod') };
    const both: StagePlan[] = [
      { variable: 'CDK_CICD_RUN_1', stage: 'Deploy-1', units: [...plans[0].units, ...plans[1].units] },
    ];
    expect(planStages(config, both, cwd, (name) => state[name])[0].run).toBe(false);
    state['/state/prod'] = '';
    expect(planStages(config, both, cwd, (name) => state[name])[0].run).toBe(true);
  });

  test('only accepts the variable names the pipeline exports', () => {
    expect(parseStagePlans(JSON.stringify(plans))).toHaveLength(2);
    expect(() => parseStagePlans(JSON.stringify([{ ...plans[0], variable: 'PATH' }]))).toThrow(/invalid stage entry/);
    expect(() => parseStagePlans(undefined)).toThrow(/CDK_CICD_PLAN is not set/);
  });
});
