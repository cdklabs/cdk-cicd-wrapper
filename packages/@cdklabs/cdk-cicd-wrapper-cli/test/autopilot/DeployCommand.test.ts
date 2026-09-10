// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Unit tests for deploy's pure argv builder. The full synth->drift->deploy orchestration (spawns cdk
// and aws) is proven end to end by the m3-verify real-AWS gate.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  assertDeployRoleOverrideAllowed,
  assertDeploymentModeOptions,
  assertPromotedAssembly,
  deployArgs,
  deploymentEnvironment,
  driftAccountForTarget,
  effectiveBootstrapQualifier,
  expectedSynthesizedRole,
  RegionalDeploymentResult,
  runRegionalDeployments,
  planFromAssembly,
} from '../../src/cmds/autopilot/DeployCommand';
import { CFN_EXEC_ROLE_FLAG, DEPLOY_ROLE_FLAG } from '../../src/cmds/autopilot/ExecCommand';

describe('m3-deploy: deployArgs', () => {
  test('deploys the assembly with no approval prompt and no role when none is configured', () => {
    expect(deployArgs('cdk.out/dev/us-west-2')).toEqual([
      'cdk',
      'deploy',
      '--app',
      'cdk.out/dev/us-west-2',
      '**',
      '--require-approval',
      'never',
    ]);
  });

  test('uses the recursive stack selector instead of CDK --all, which is top-level-only', () => {
    expect(deployArgs('cdk.out/dev/us-west-2')).toContain('**');
    expect(deployArgs('cdk.out/dev/us-west-2')).not.toContain('--all');
  });

  test('never passes a deployment role as CDK --role-arn', () => {
    const env = deploymentEnvironment({}, 'arn:aws:iam::111111111111:role/Deploy');
    expect(env[DEPLOY_ROLE_FLAG]).toBe('arn:aws:iam::111111111111:role/Deploy');
    expect(deployArgs('cdk.out/prod/us-west-1')).not.toContain('--role-arn');
  });

  test('a present-but-empty Repo 2 role override survives into synthesis to clear an image-baked role', () => {
    const ambient = { [DEPLOY_ROLE_FLAG]: '' };
    expect(deploymentEnvironment(ambient)).toBe(ambient);
    expect(deploymentEnvironment(ambient)[DEPLOY_ROLE_FLAG]).toBe('');
  });

  test('express mode adds --express (rollback stays disabled -- --rollback conflicts with express + nested stacks)', () => {
    const args = deployArgs('cdk.out/dev/us-west-2', undefined, true);
    expect(args).toContain('--express');
    expect(args).not.toContain('--rollback');
  });

  test('express is off by default (proven path unchanged)', () => {
    expect(deployArgs('cdk.out/dev/us-west-2')).not.toContain('--express');
  });

  test('prepare mode (change set) takes precedence over express -- no --express with --no-execute', () => {
    const args = deployArgs('cdk.out/dev/us-west-2', 'cdk-cicd-9', true);
    expect(args).toContain('--no-execute');
    expect(args).not.toContain('--express');
  });
});

describe('m4-deploy-observer: deployArgs prepare mode', () => {
  test('a change-set name turns deploy into prepare-without-executing', () => {
    const args = deployArgs('cdk.out/dev/us-west-2', 'cdk-cicd-42');
    // --no-execute is the whole point: assets get published and the change set created, then cdk returns
    // instead of holding the build container for the CloudFormation wait.
    expect(args).toContain('--no-execute');
    expect(args.slice(args.indexOf('--change-set-name'))).toEqual(['--change-set-name', 'cdk-cicd-42']);
  });

  test('without a change-set name the argv is unchanged, so the proven path is untouched', () => {
    expect(deployArgs('cdk.out/dev/us-west-2')).not.toContain('--no-execute');
  });
});

describe('promoted assembly role contract', () => {
  test('rejects --deploy-role with --from-assembly because the promoted manifest owns the roles', () => {
    expect(() => assertDeployRoleOverrideAllowed(true, 'arn:aws:iam::111111111111:role/Deploy')).toThrow(
      /--deploy-role cannot be used with --from-assembly.*already embedded/s,
    );
  });

  test('allows a role override only when synthesis still runs', () => {
    expect(() => assertDeployRoleOverrideAllowed(false, 'arn:aws:iam::111111111111:role/Deploy')).not.toThrow();
    expect(() => assertDeployRoleOverrideAllowed(true, undefined)).not.toThrow();
  });
});

describe('synthesized role expectations', () => {
  const target = {
    account: '111111111111',
    region: 'eu-west-1',
    qualifier: 'hnb659fds',
  };

  test('uses the configured stage roles when no environment override is present', () => {
    expect(expectedSynthesizedRole({}, DEPLOY_ROLE_FLAG, ' arn:aws:iam::111111111111:role/Deploy ', target)).toBe(
      'arn:aws:iam::111111111111:role/Deploy',
    );
    expect(expectedSynthesizedRole({}, CFN_EXEC_ROLE_FLAG, 'arn:aws:iam::111111111111:role/CfnExec', target)).toBe(
      'arn:aws:iam::111111111111:role/CfnExec',
    );
  });

  test('an environment role override is authoritative and normalized like the runtime synthesizer', () => {
    expect(
      expectedSynthesizedRole(
        { [DEPLOY_ROLE_FLAG]: ' arn:aws:iam::222222222222:role/Override ' },
        DEPLOY_ROLE_FLAG,
        'arn:aws:iam::111111111111:role/Configured',
        target,
      ),
    ).toBe('arn:aws:iam::222222222222:role/Override');
  });

  test('a present empty environment value explicitly clears the configured role expectation', () => {
    expect(
      expectedSynthesizedRole(
        { [DEPLOY_ROLE_FLAG]: '   ' },
        DEPLOY_ROLE_FLAG,
        'arn:aws:iam::111111111111:role/Configured',
        target,
      ),
    ).toBeUndefined();
  });

  test('a promoted assembly ignores ambient role flags and preserves the configured role expectation', () => {
    const configured = 'arn:aws:iam::111111111111:role/Configured';
    expect(
      expectedSynthesizedRole({ [DEPLOY_ROLE_FLAG]: '' }, DEPLOY_ROLE_FLAG, configured, target, 'promoted-assembly'),
    ).toBe(configured);
    expect(
      expectedSynthesizedRole(
        { [DEPLOY_ROLE_FLAG]: 'arn:aws:iam::111111111111:role/Ambient' },
        DEPLOY_ROLE_FLAG,
        configured,
        target,
        'promoted-assembly',
      ),
    ).toBe(configured);
  });

  test('specializes the exact role template CDK emits for the target while preserving its partition token', () => {
    expect(
      expectedSynthesizedRole(
        {},
        DEPLOY_ROLE_FLAG,
        'arn:${AWS::Partition}:iam::${AWS::AccountId}:role/cdk-${Qualifier}-deploy-${AWS::Region}-${AWS::Region}',
        target,
      ),
    ).toBe('arn:${AWS::Partition}:iam::111111111111:role/cdk-hnb659fds-deploy-eu-west-1-eu-west-1');
  });

  test('uses the configured bootstrap qualifier when specializing a role template', () => {
    expect(
      expectedSynthesizedRole(
        {},
        CFN_EXEC_ROLE_FLAG,
        'arn:aws:iam::${AWS::AccountId}:role/cdk-${Qualifier}-cfn-exec-${AWS::Region}',
        { ...target, qualifier: 'shop123' },
      ),
    ).toBe('arn:aws:iam::111111111111:role/cdk-shop123-cfn-exec-eu-west-1');
  });
});

describe('effective bootstrap qualifier', () => {
  test('explicit config wins over context', () => {
    expect(
      effectiveBootstrapQualifier('configured', '.', {
        CDK_CONTEXT_JSON: JSON.stringify({ '@aws-cdk/core:bootstrapQualifier': 'context' }),
      }),
    ).toBe('configured');
  });

  test('uses the qualifier from merged CDK context when config omits it', () => {
    expect(
      effectiveBootstrapQualifier(undefined, '.', {
        CDK_CONTEXT_JSON: JSON.stringify({ '@aws-cdk/core:bootstrapQualifier': 'ctxqual' }),
      }),
    ).toBe('ctxqual');
  });

  test('uses CDK on-disk context precedence when no context environment is present', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-qualifier-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'cdk.json'),
        JSON.stringify({ context: { '@aws-cdk/core:bootstrapQualifier': 'fromjson' } }),
      );
      fs.writeFileSync(
        path.join(dir, 'cdk.context.json'),
        JSON.stringify({ '@aws-cdk/core:bootstrapQualifier': 'ctxfile' }),
      );
      expect(effectiveBootstrapQualifier(undefined, dir, {})).toBe('ctxfile');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('uses the standard CDK qualifier when config and context omit it', () => {
    expect(effectiveBootstrapQualifier(undefined, '.', { CDK_CONTEXT_JSON: '{}' })).toBe('hnb659fds');
  });

  test('promoted assemblies ignore ambient context injection and use repository context', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-promoted-qualifier-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'cdk.json'),
        JSON.stringify({ context: { '@aws-cdk/core:bootstrapQualifier': 'repoqual' } }),
      );
      expect(
        effectiveBootstrapQualifier(
          undefined,
          dir,
          { CDK_CONTEXT_JSON: JSON.stringify({ '@aws-cdk/core:bootstrapQualifier': 'ambient' }) },
          'promoted-assembly',
        ),
      ).toBe('repoqual');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('deploy mode contracts', () => {
  const direct = {
    fromImage: false,
    fromAssembly: false,
    prepareOnly: false,
  };

  test('rejects promoted-assembly and role flags in image mode instead of ignoring them', () => {
    expect(() =>
      assertDeploymentModeOptions({
        ...direct,
        fromImage: true,
        fromAssembly: true,
        deployRole: 'arn:aws:iam::111111111111:role/Deploy',
      }),
    ).toThrow(/--from-image cannot be combined with --from-assembly, --deploy-role/);
  });

  test('rejects direct-mode flags that image mode does not consume', () => {
    expect(() =>
      assertDeploymentModeOptions({
        ...direct,
        fromImage: true,
        stage: 'dev',
        region: 'eu-west-1',
        prepareOnly: true,
        planParameter: '/plan',
      }),
    ).toThrow(/--stage, --region, --prepare-only, --plan-parameter/);
  });

  test('rejects image-only and prepare-only companion flags in direct mode', () => {
    expect(() => assertDeploymentModeOptions({ ...direct, target: 'dev' })).toThrow(/require --from-image/);
    expect(() => assertDeploymentModeOptions({ ...direct, planParameter: '/plan' })).toThrow(/requires --prepare-only/);
  });
});

describe('deploy drift account selection', () => {
  test('an explicit cross-account target wins over the ambient pipeline account', () => {
    expect(driftAccountForTarget('222222222222', '111111111111')).toBe('222222222222');
  });

  test('ambient identity is used only for a genuinely account-agnostic target', () => {
    expect(driftAccountForTarget(undefined, '111111111111')).toBe('111111111111');
    expect(() => driftAccountForTarget(undefined, undefined)).toThrow(/without an ambient STS account/);
  });
});

describe('regional deploy ordering', () => {
  const plan = (region: string) => [{ stackName: `stack-${region}`, changeSetName: 'cs', region }];

  test('parallel launches every region, then selects failures and plans in configured order', async () => {
    const regions = ['eu-west-1', 'us-east-1', 'ap-southeast-2', 'sa-east-1'];
    const started: string[] = [];
    const pending = new Map<string, (result: RegionalDeploymentResult) => void>();
    const deployment = runRegionalDeployments(regions, 'parallel', (region) => {
      started.push(region);
      return new Promise<RegionalDeploymentResult>((resolve) => pending.set(region, resolve));
    });

    expect(started).toEqual(regions);
    pending.get('sa-east-1')!({ code: 0, plan: plan('sa-east-1') });
    pending.get('ap-southeast-2')!({ code: 7, plan: [] });
    pending.get('us-east-1')!({ code: 5, plan: [] });
    pending.get('eu-west-1')!({ code: 0, plan: plan('eu-west-1') });

    const result = await deployment;
    expect(result.code).toBe(5);
    expect(result.results.map((entry) => entry.code)).toEqual([0, 5, 7, 0]);
    expect(result.plan.map((entry) => entry.region)).toEqual(['eu-west-1', 'sa-east-1']);
  });

  test('sequential preserves order and does not start regions after a failure', async () => {
    const started: string[] = [];
    const result = await runRegionalDeployments(
      ['eu-west-1', 'us-east-1', 'ap-southeast-2'],
      'sequential',
      async (region) => {
        started.push(region);
        return region === 'us-east-1' ? { code: 2, plan: [] } : { code: 0, plan: plan(region) };
      },
    );

    expect(started).toEqual(['eu-west-1', 'us-east-1']);
    expect(result.code).toBe(2);
    expect(result.plan.map((entry) => entry.region)).toEqual(['eu-west-1']);
  });
});

describe('m4-deploy-observer: planFromAssembly', () => {
  const stack = (deps: string[] = [], stackName?: string, environment?: string) => ({
    type: 'aws:cloudformation:stack',
    dependencies: deps,
    properties: stackName ? { stackName } : {},
    ...(environment === undefined ? {} : { environment }),
  });
  // A reader mapping directory -> manifest, so nested assemblies are modelled without touching disk.
  const reader = (manifests: { [dir: string]: any }) => (dir: string) => {
    if (!(dir in manifests)) throw new Error(`no manifest at ${dir}`);
    return manifests[dir];
  };

  test('orders stacks so a dependency is executed before the stack that needs it', () => {
    // Ordering is load-bearing: a stack consuming another's export must be executed after it. cdk deploy
    // does this for us; the driver executes change sets itself, so we must reproduce it.
    const r = reader({
      o: {
        artifacts: {
          Consumer: stack(['Producer'], 'consumer-stack'),
          Producer: stack([], 'producer-stack'),
          Assets: { type: 'cdk:asset-manifest' },
        },
      },
    });
    expect(planFromAssembly('o', 'us-west-2', 'cs-1', r).map((e) => e.stackName)).toEqual([
      'producer-stack',
      'consumer-stack',
    ]);
  });

  test('ignores non-stack artifacts and carries region + change-set name onto every entry', () => {
    const r = reader({ o: { artifacts: { A: stack([], 'a'), Tree: { type: 'cdk:tree' }, B: stack(['A'], 'b') } } });
    expect(planFromAssembly('o', 'eu-west-1', 'cs-9', r)).toEqual([
      { stackName: 'a', changeSetName: 'cs-9', region: 'eu-west-1' },
      { stackName: 'b', changeSetName: 'cs-9', region: 'eu-west-1' },
    ]);
  });

  test("carries each stack artifact's actual region instead of stamping the invocation region", () => {
    const r = reader({
      o: {
        artifacts: {
          East: stack([], 'east-stack', 'aws://111111111111/us-east-1'),
          Europe: stack(['East'], 'europe-stack', 'aws://111111111111/eu-west-1'),
          Agnostic: stack(['Europe'], 'agnostic-stack', 'aws://unknown-account/unknown-region'),
        },
      },
    });
    expect(planFromAssembly('o', 'us-west-2', 'cs', r)).toEqual([
      { stackName: 'east-stack', changeSetName: 'cs', region: 'us-east-1' },
      { stackName: 'europe-stack', changeSetName: 'cs', region: 'eu-west-1' },
      { stackName: 'agnostic-stack', changeSetName: 'cs', region: 'us-west-2' },
    ]);
  });

  test('RECURSES into nested cloud assemblies (cdk.Stage) -- else those stacks silently never deploy', () => {
    // A cdk.Stage synthesizes into a nested assembly. A flat scan of the top manifest misses its stacks,
    // the driver executes nothing for them, and the action goes green having deployed part (or none).
    const r = reader({
      o: {
        artifacts: {
          Prod: {
            type: 'cdk:cloud-assembly',
            dependencies: [],
            properties: { directoryName: 'assembly-Prod' },
          },
          Top: stack([], 'top-stack'),
        },
      },
      'o/assembly-Prod': { artifacts: { S1: stack([], 'prod-s1'), S2: stack(['S1'], 'prod-s2') } },
    });
    expect(planFromAssembly('o', 'us-west-2', 'cs', r).map((e) => e.stackName)).toEqual([
      'prod-s1',
      'prod-s2',
      'top-stack',
    ]);
  });

  test('matches the installed CDK Stage schema and stacksRecursively API', () => {
    // aws-cdk-lib is the wrapper package's installed peer and is used here only as the schema oracle.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, import/no-extraneous-dependencies
    const cdk: any = require('aws-cdk-lib');
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-plan-stage-'));
    try {
      const app = new cdk.App({ outdir: outDir });
      const stage = new cdk.Stage(app, 'Prod', {
        env: { account: '222222222222', region: 'eu-west-1' },
      });
      new cdk.Stack(stage, 'Nested', { stackName: 'nested-prod-stack' });
      const assembly = app.synth();

      const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf-8'));
      const nestedArtifact = Object.values<any>(manifest.artifacts).find(
        (artifact) => artifact.type === 'cdk:cloud-assembly',
      );
      expect(nestedArtifact).toMatchObject({
        type: 'cdk:cloud-assembly',
        properties: { directoryName: expect.any(String) },
      });

      const plan = planFromAssembly(outDir, 'us-west-2', 'cs');
      expect(plan.map((entry) => entry.stackName)).toEqual(
        assembly.stacksRecursively.map((artifact: any) => artifact.stackName),
      );
      expect(plan).toEqual([{ stackName: 'nested-prod-stack', changeSetName: 'cs', region: 'eu-west-1' }]);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  test('falls back to the artifact id when the manifest carries no stackName', () => {
    const r = reader({ o: { artifacts: { OnlyId: stack() } } });
    expect(planFromAssembly('o', 'us-west-2', 'cs', r)[0].stackName).toEqual('OnlyId');
  });

  test('a dependency cycle fails closed instead of hanging or inventing an order', () => {
    const r = reader({ o: { artifacts: { A: stack(['B'], 'a'), B: stack(['A'], 'b') } } });
    expect(() => planFromAssembly('o', 'us-west-2', 'cs', r)).toThrow(/artifact dependency cycle/);
  });

  test('an assembly with no stacks fails closed instead of producing a green empty deployment', () => {
    expect(() =>
      planFromAssembly('o', 'us-west-2', 'cs', reader({ o: { artifacts: { Tree: { type: 'cdk:tree' } } } })),
    ).toThrow(/contains no deployable CloudFormation stacks/);
    expect(() => planFromAssembly('o', 'us-west-2', 'cs', reader({ o: {} }))).toThrow(
      /contains no deployable CloudFormation stacks/,
    );
  });
});

describe('m4-assembly-promotion: assertPromotedAssembly', () => {
  test('accepts a directory holding a synthesized assembly', () => {
    const seen: string[] = [];
    expect(() =>
      assertPromotedAssembly('cdk.out/dev/us-west-2', (p) => {
        seen.push(p);
        return true;
      }),
    ).not.toThrow();
    // Keyed on manifest.json, not the directory: CodePipeline materializes an input artifact as a tree,
    // so the stage/region directory can exist while holding nothing.
    expect(seen).toEqual([path.join('cdk.out/dev/us-west-2', 'manifest.json')]);
  });

  test('a directory with no manifest is a clear failure, never a silent re-synth', () => {
    // The dangerous alternative: falling back to synthesizing would turn broken artifact wiring into a
    // slow success and quietly undo the whole point of promoting one assembly.
    expect(() => assertPromotedAssembly('cdk.out/prod/us-west-1', () => false)).toThrow(
      /holds no synthesized assembly .*no manifest.json.*publish cdk.out/s,
    );
  });
});
