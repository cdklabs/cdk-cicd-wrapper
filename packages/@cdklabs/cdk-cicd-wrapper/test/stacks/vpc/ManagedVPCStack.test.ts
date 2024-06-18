// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ManagedVPCStack } from '../../../src/stacks';
import { TestAppConfig, TestComplianceLogBucketName } from '../../TestConfig';

describe('vpc-stack-test-with-proxy', () => {
  const app = new cdk.App();

  const vpcStack = new ManagedVPCStack(app, 'ManagedVPCStack', {
    env: TestAppConfig.deploymentDefinition.RES.env,
    cidrBlock: '172.31.0.0/20',
    subnetCidrMask: 24,
    maxAzs: 2,
    useProxy: true,
    flowLogsBucketName: TestComplianceLogBucketName.RES,
  });

  const template = Template.fromStack(vpcStack);

  test('Check if VPC exists', () => {
    template.resourceCountIs('AWS::EC2::VPC', 1);
    template.hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: '172.31.0.0/20',
    });
  });

  test('Check if Subnets exist', () => {
    template.resourceCountIs('AWS::EC2::Subnet', 2);
    template.hasResourceProperties('AWS::EC2::Subnet', {
      CidrBlock: '172.31.0.0/24',
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

  const vpcStack = new ManagedVPCStack(app, 'VPCStack', {
    env: TestAppConfig.deploymentDefinition.RES.env,
    cidrBlock: '172.31.0.0/20',
    subnetCidrMask: 24,
    maxAzs: 2,
    useProxy: false,
    flowLogsBucketName: TestComplianceLogBucketName.RES,
  });

  const template = Template.fromStack(vpcStack);

  test('Check if VPC exists', () => {
    template.resourceCountIs('AWS::EC2::VPC', 1);
    template.hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: '172.31.0.0/20',
    });
  });

  test('Check if Subnets exist', () => {
    template.resourceCountIs('AWS::EC2::Subnet', 4);
    template.hasResourceProperties('AWS::EC2::Subnet', {
      CidrBlock: '172.31.0.0/24',
    });
  });
});
