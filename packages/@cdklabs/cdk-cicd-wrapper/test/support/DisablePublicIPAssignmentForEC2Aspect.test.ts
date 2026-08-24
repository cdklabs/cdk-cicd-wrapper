// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { App, Aspects, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { DisablePublicIPAssignmentForEC2Aspect } from '../../src/support/DisablePublicIPAssignmentForEC2Aspect';

function stack(): Stack {
  return new Stack(new App(), 'SubnetStack');
}

describe('m9-migrate-security-plugins: DisablePublicIPAssignmentForEC2Aspect', () => {
  test('forces MapPublicIpOnLaunch to false on every subnet it visits', () => {
    const s = stack();
    Aspects.of(s).add(new DisablePublicIPAssignmentForEC2Aspect());
    new ec2.CfnSubnet(s, 'Subnet', {
      cidrBlock: '10.0.0.0/24',
      vpcId: 'vpc-12345',
      mapPublicIpOnLaunch: true,
    });

    Template.fromStack(s).hasResourceProperties('AWS::EC2::Subnet', {
      MapPublicIpOnLaunch: false,
    });
  });

  test('ignores non-subnet constructs', () => {
    const s = stack();
    expect(() => Aspects.of(s).add(new DisablePublicIPAssignmentForEC2Aspect())).not.toThrow();
    Template.fromStack(s).resourceCountIs('AWS::EC2::Subnet', 0);
  });
});
