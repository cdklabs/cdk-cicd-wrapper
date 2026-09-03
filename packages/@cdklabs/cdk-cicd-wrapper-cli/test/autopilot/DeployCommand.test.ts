// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Unit tests for deploy's pure argv builder. The full synth->drift->deploy orchestration (spawns cdk
// and aws) is proven end to end by the m3-verify real-AWS gate.

import * as path from 'path';
import {
  assertPromotedAssembly,
  deployArgs,
  RegionalDeploymentResult,
  runRegionalDeployments,
  planFromAssembly,
} from '../../src/cmds/autopilot/DeployCommand';

describe('m3-deploy: deployArgs', () => {
  test('deploys the assembly with no approval prompt and no role when none is configured', () => {
    expect(deployArgs('cdk.out/dev/us-west-2')).toEqual([
      'cdk',
      'deploy',
      '--app',
      'cdk.out/dev/us-west-2',
      '--all',
      '--require-approval',
      'never',
    ]);
  });

  test('appends --role-arn when the stage has a forced deploy role', () => {
    const args = deployArgs('cdk.out/prod/us-west-1', 'arn:aws:iam::111111111111:role/Deploy');
    expect(args.slice(-2)).toEqual(['--role-arn', 'arn:aws:iam::111111111111:role/Deploy']);
  });

  test('an empty role string is treated as no role', () => {
    expect(deployArgs('cdk.out/dev/us-west-2', '')).not.toContain('--role-arn');
  });

  test('express mode adds --express (rollback stays disabled -- --rollback conflicts with express + nested stacks)', () => {
    const args = deployArgs('cdk.out/dev/us-west-2', undefined, undefined, true);
    expect(args).toContain('--express');
    expect(args).not.toContain('--rollback');
  });

  test('express is off by default (proven path unchanged)', () => {
    expect(deployArgs('cdk.out/dev/us-west-2')).not.toContain('--express');
  });

  test('prepare mode (change set) takes precedence over express -- no --express with --no-execute', () => {
    const args = deployArgs('cdk.out/dev/us-west-2', undefined, 'cdk-cicd-9', true);
    expect(args).toContain('--no-execute');
    expect(args).not.toContain('--express');
  });
});

describe('m4-deploy-observer: deployArgs prepare mode', () => {
  test('a change-set name turns deploy into prepare-without-executing', () => {
    const args = deployArgs('cdk.out/dev/us-west-2', undefined, 'cdk-cicd-42');
    // --no-execute is the whole point: assets get published and the change set created, then cdk returns
    // instead of holding the build container for the CloudFormation wait.
    expect(args).toContain('--no-execute');
    expect(args.slice(args.indexOf('--change-set-name'))).toEqual(['--change-set-name', 'cdk-cicd-42']);
  });

  test('without a change-set name the argv is unchanged, so the proven path is untouched', () => {
    expect(deployArgs('cdk.out/dev/us-west-2')).not.toContain('--no-execute');
    expect(deployArgs('cdk.out/dev/us-west-2', 'arn:aws:iam::111111111111:role/D')).not.toContain('--no-execute');
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
  const stack = (deps: string[] = [], stackName?: string) => ({
    type: 'aws:cloudformation:stack',
    dependencies: deps,
    properties: stackName ? { stackName } : {},
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

  test('RECURSES into nested cloud assemblies (cdk.Stage) -- else those stacks silently never deploy', () => {
    // A cdk.Stage synthesizes into a nested assembly. A flat scan of the top manifest misses its stacks,
    // the driver executes nothing for them, and the action goes green having deployed part (or none).
    const r = reader({
      o: {
        artifacts: {
          Prod: { type: 'aws:cloud-assembly', dependencies: [], properties: { directory: 'assembly-Prod' } },
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

  test('falls back to the artifact id when the manifest carries no stackName', () => {
    const r = reader({ o: { artifacts: { OnlyId: stack() } } });
    expect(planFromAssembly('o', 'us-west-2', 'cs', r)[0].stackName).toEqual('OnlyId');
  });

  test('a dependency cycle still terminates instead of hanging the build', () => {
    const r = reader({ o: { artifacts: { A: stack(['B'], 'a'), B: stack(['A'], 'b') } } });
    expect(
      planFromAssembly('o', 'us-west-2', 'cs', r)
        .map((e) => e.stackName)
        .sort(),
    ).toEqual(['a', 'b']);
  });

  test('an assembly with no stacks yields an empty plan, not a crash', () => {
    expect(
      planFromAssembly('o', 'us-west-2', 'cs', reader({ o: { artifacts: { Tree: { type: 'cdk:tree' } } } })),
    ).toEqual([]);
    expect(planFromAssembly('o', 'us-west-2', 'cs', reader({ o: {} }))).toEqual([]);
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
