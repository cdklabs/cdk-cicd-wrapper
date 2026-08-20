// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Unit tests for deploy's pure argv builder. The full synth->drift->deploy orchestration (spawns cdk
// and aws) is proven end to end by the m3-verify real-AWS gate.

import { deployArgs } from '../../src/cmds/v3/DeployCommand';

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
