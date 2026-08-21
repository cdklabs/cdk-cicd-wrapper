// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Unit tests for deploy's pure argv builder. The full synth->drift->deploy orchestration (spawns cdk
// and aws) is proven end to end by the m3-verify real-AWS gate.

import * as path from 'path';
import { assertPromotedAssembly, deployArgs } from '../../src/cmds/v3/DeployCommand';

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
