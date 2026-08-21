// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Unit tests for deploy's pure argv builder. The full synth->drift->deploy orchestration (spawns cdk
// and aws) is proven end to end by the m3-verify real-AWS gate.

import * as path from 'path';
import { assertPromotedAssembly, deployArgs, planFromAssembly } from '../../src/cmds/v3/DeployCommand';

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

describe('m4-deploy-observer: planFromAssembly', () => {
  const stack = (deps: string[] = [], stackName?: string) => ({
    type: 'aws:cloudformation:stack',
    dependencies: deps,
    properties: stackName ? { stackName } : {},
  });

  test('orders stacks so a dependency is executed before the stack that needs it', () => {
    // Ordering is load-bearing, not cosmetic: a stack consuming another's export must be executed after
    // it. `cdk deploy` does this for us; the driver executes change sets itself, so we must do it here.
    const manifest = {
      artifacts: {
        Consumer: stack(['Producer'], 'consumer-stack'),
        Producer: stack([], 'producer-stack'),
        Assets: { type: 'cdk:asset-manifest' },
      },
    };
    expect(planFromAssembly(manifest, 'us-west-2', 'cs-1').map((e) => e.stackName)).toEqual([
      'producer-stack',
      'consumer-stack',
    ]);
  });

  test('ignores non-stack artifacts and carries region + change-set name onto every entry', () => {
    const manifest = {
      artifacts: { A: stack([], 'a'), Tree: { type: 'cdk:tree' }, B: stack(['A'], 'b') },
    };
    const plan = planFromAssembly(manifest, 'eu-west-1', 'cs-9');
    expect(plan).toEqual([
      { stackName: 'a', changeSetName: 'cs-9', region: 'eu-west-1' },
      { stackName: 'b', changeSetName: 'cs-9', region: 'eu-west-1' },
    ]);
  });

  test('falls back to the artifact id when the manifest carries no stackName', () => {
    expect(planFromAssembly({ artifacts: { OnlyId: stack() } }, 'us-west-2', 'cs')[0].stackName).toEqual('OnlyId');
  });

  test('a dependency cycle still terminates instead of hanging the build', () => {
    // Defensive: CDK should never emit one, but a topological walk that trusts its input is how a synth
    // bug becomes an infinite loop inside a deploy action.
    const manifest = { artifacts: { A: stack(['B'], 'a'), B: stack(['A'], 'b') } };
    expect(
      planFromAssembly(manifest, 'us-west-2', 'cs')
        .map((e) => e.stackName)
        .sort(),
    ).toEqual(['a', 'b']);
  });

  test('an assembly with no stacks yields an empty plan, not a crash', () => {
    expect(planFromAssembly({ artifacts: { Tree: { type: 'cdk:tree' } } }, 'us-west-2', 'cs')).toEqual([]);
    expect(planFromAssembly({}, 'us-west-2', 'cs')).toEqual([]);
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
