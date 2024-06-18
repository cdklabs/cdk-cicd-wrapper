// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { VPCFromLookUpStack } from '../../../src/stacks';
import { TestAppConfig } from '../../TestConfig';

describe('vpc-stack-from-lookup', () => {
  const app = new cdk.App();

  const vpcStack = new VPCFromLookUpStack(app, 'VPCStackFromLookUp', {
    env: TestAppConfig.deploymentDefinition.RES.env,
    vpcId: 'vpc-12345',
  });

  const template = Template.fromStack(vpcStack);

  test('Check if VPC is looked up', () => {
    template.resourceCountIs('AWS::EC2::VPC', 0);

    expect(vpcStack.vpc).toBeDefined();
    expect(vpcStack.vpc!.vpcId).toEqual('vpc-12345');
  });
});

describe('vpc-stack-from-lookup-with-ssm', () => {
  const app = new cdk.App({
    context: {
      [`ssm:account=${TestAppConfig.deploymentDefinition.RES.env.account}:parameterName=/ssm/path:region=${TestAppConfig.deploymentDefinition.RES.env.region}`]:
        'vpc-23456',
      [`vpc-provider:account=${TestAppConfig.deploymentDefinition.RES.env.account}:filter.vpc-id=vpc-23456:region=${TestAppConfig.deploymentDefinition.RES.env.region}:returnAsymmetricSubnets=true`]:
        {
          vpcId: 'vpc-23456',
        },
    },
  });

  const vpcStack2 = new VPCFromLookUpStack(app, 'VPCStackFromLookUpFromSsm', {
    env: TestAppConfig.deploymentDefinition.RES.env,
    vpcId: 'resolve:ssm:/ssm/path',
  });

  const template = Template.fromStack(vpcStack2);

  test('Check if VPC is looked up through ssm', () => {
    template.resourceCountIs('AWS::EC2::VPC', 0);

    expect(vpcStack2.vpc).toBeDefined();
    expect(vpcStack2.vpc!.vpcId).toEqual('vpc-23456');
  });
});
