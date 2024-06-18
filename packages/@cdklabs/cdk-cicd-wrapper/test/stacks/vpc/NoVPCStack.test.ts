// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { NoVPCStack } from '../../../src/stacks';

describe('NoVPCStack', () => {
  const vpcStack = new NoVPCStack();

  test('Check if VPC is omitted', () => {
    expect(vpcStack.vpc).toBeUndefined();
  });

  test('Check if SecurityGroup is omitted', () => {
    expect(vpcStack.securityGroup).toBeUndefined();
  });

  test('Check if VPC Endpoints are omitted', () => {
    expect(vpcStack.codeBuildVPCInterfaces).toHaveLength(0);
  });
});
