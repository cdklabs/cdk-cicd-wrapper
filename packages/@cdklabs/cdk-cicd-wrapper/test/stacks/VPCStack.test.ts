// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { IVpcConfig } from '../../src/resource-providers';
import { VPCStack } from '../../src/stacks';
import { TestAppConfig, TestComplianceLogBucketName } from '../TestConfig';

describe('vpc-stack-test-with-proxy', () => {
  const app = new cdk.App();

  const vpcConfig: IVpcConfig = {
    vpcType: 'VPC',
    vpc: {
      cidrBlock: '172.31.0.0/20',
      subnetCidrMask: 24,
      maxAzs: 2,
    },
  };

  const vpcStack = new VPCStack(app, 'VPCStack', {
    env: TestAppConfig.deploymentDefinition.RES.env,
    vpcConfig: vpcConfig,
    useProxy: true,
    flowLogsBucketName: TestComplianceLogBucketName.RES,
  });

  const template = Template.fromStack(vpcStack);

  test('Check if VPC exists', () => {
    template.resourceCountIs('AWS::EC2::VPC', 1);
    template.hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: vpcConfig.vpc?.cidrBlock,
    });
  });

  test('Check if Subnets exist', () => {
    template.resourceCountIs('AWS::EC2::Subnet', 2);
    template.hasResourceProperties('AWS::EC2::Subnet', {
      CidrBlock: `${vpcConfig.vpc?.cidrBlock.substring(0, 11)}${vpcConfig.vpc?.subnetCidrMask}`,
    });
  });

  test('Check if VPC Endpoints exist', () => {
    template.resourceCountIs('AWS::EC2::VPCEndpoint', 7);
    ['ssm', 'sts', 'logs', 'cloudformation', 'secretsmanager'].forEach((service) => {
      template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
        ServiceName: `com.amazonaws.${TestAppConfig.deploymentDefinition.RES.env.region}.${service}`,
      });
    });
  });

  test('Check if SecurityGroup exists', () => {
    template.resourceCountIs('AWS::EC2::SecurityGroup', 1);
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      SecurityGroupEgress: [
        {
          CidrIp: '0.0.0.0/0',
        },
      ],
    });
  });
});

describe('vpc-stack-test-without-proxy', () => {
  const app = new cdk.App();

  const vpcConfig: IVpcConfig = {
    vpcType: 'VPC',
    vpc: {
      cidrBlock: '172.31.0.0/20',
      subnetCidrMask: 24,
      maxAzs: 2,
    },
  };

  const vpcStack = new VPCStack(app, 'VPCStack', {
    env: TestAppConfig.deploymentDefinition.RES.env,
    vpcConfig: vpcConfig,
    useProxy: false,
    flowLogsBucketName: TestComplianceLogBucketName.RES,
  });

  const template = Template.fromStack(vpcStack);

  test('Check if VPC exists', () => {
    template.resourceCountIs('AWS::EC2::VPC', 1);
    template.hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: vpcConfig.vpc?.cidrBlock,
    });
  });

  test('Check if Subnets exist', () => {
    template.resourceCountIs('AWS::EC2::Subnet', 4);
    template.hasResourceProperties('AWS::EC2::Subnet', {
      CidrBlock: `${vpcConfig.vpc?.cidrBlock.substring(0, 11)}${vpcConfig.vpc?.subnetCidrMask}`,
    });
  });
});

describe('vpc-stack-test-omission', () => {
  const app = new cdk.App();

  const vpcConfig: IVpcConfig = {
    vpcType: 'NO_VPC',
  };

  const template = Template.fromStack(
    new VPCStack(app, 'VPCStack', {
      env: TestAppConfig.deploymentDefinition.RES.env,
      vpcConfig,
      useProxy: false,
      flowLogsBucketName: TestComplianceLogBucketName.RES,
    }),
  );

  test('Check if VPC is omitted', () => {
    template.resourceCountIs('AWS::EC2::VPC', 0);
  });

  test('Check if SecurityGroup is omitted', () => {
    template.resourceCountIs('AWS::EC2::SecurityGroup', 0);
  });

  test('Check if VPC Endpoints are omitted', () => {
    template.resourceCountIs('AWS::EC2::VPCEndpoint', 0);
  });
});

describe('vpc-stack-from-lookup', () => {
  const app = new cdk.App();

  const vpcConfig: IVpcConfig = {
    vpcType: 'VPC_FROM_LOOK_UP',
    vpcFromLookUp: {
      vpcId: 'vpc-12345',
    },
  };

  const vpcStack = new VPCStack(app, 'VPCStackFromLookUp', {
    env: TestAppConfig.deploymentDefinition.RES.env,
    vpcConfig,
    useProxy: false,
    flowLogsBucketName: TestComplianceLogBucketName.RES,
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

  const vpcStack2 = new VPCStack(app, 'VPCStackFromLookUpFromSsm', {
    env: TestAppConfig.deploymentDefinition.RES.env,
    vpcConfig: {
      vpcType: 'VPC_FROM_LOOK_UP',
      vpcFromLookUp: {
        vpcId: 'resolve:ssm:/ssm/path',
      },
    },
    useProxy: false,
    flowLogsBucketName: TestComplianceLogBucketName.RES,
  });

  const template = Template.fromStack(vpcStack2);

  test('Check if VPC is looked up through ssm', () => {
    template.resourceCountIs('AWS::EC2::VPC', 0);

    expect(vpcStack2.vpc).toBeDefined();
    expect(vpcStack2.vpc!.vpcId).toEqual('vpc-23456');
  });
});
