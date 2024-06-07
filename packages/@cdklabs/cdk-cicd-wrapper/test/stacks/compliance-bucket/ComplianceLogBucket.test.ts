// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { IVpcConfig } from '../../../src/resource-providers';
import { VPCStack } from '../../../src/stacks';
import { ComplianceLogBucketStack } from '../../../src/stacks/compliance-bucket/ComplianceBucketStack';
import { TestAppConfig, TestComplianceLogBucketName } from '../../TestConfig';

describe('compliance-log-bucket-stack-test-without-vpc', () => {
  const app = new cdk.App();

  const template = Template.fromStack(
    new ComplianceLogBucketStack(app, 'ComplianceLogBucketStackWithoutVpc', {
      env: TestAppConfig.deploymentDefinition.RES.env,
      complianceLogBucketName: 'compliance-log-bucket',
    }),
  );

  test('Check if Lambda Function exists and has no VPC Configured', () => {
    template.resourceCountIs('AWS::Lambda::Function', 2);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'make-compliance-log-bucket.handler',
      Runtime: 'python3.12',
      VpcConfig: Match.absent(),
    });
  });

  test('Check if Custom Resource exists', () => {
    template.resourceCountIs('AWS::CloudFormation::CustomResource', 1);
  });
});

describe('compliance-log-bucket-stack-test-with-vpc', () => {
  const app = new cdk.App();

  const vpcConfig: IVpcConfig = {
    vpcType: 'VPC',
    vpc: {
      cidrBlock: '172.31.0.0/20',
      subnetCidrMask: 24,
      maxAzs: 2,
    },
  };

  const vpcStack = new VPCStack(app, 'VPCStackComplianceLogBucket', {
    env: TestAppConfig.deploymentDefinition.RES.env,
    vpcConfig: vpcConfig,
    useProxy: false,
    flowLogsBucketName: TestComplianceLogBucketName.RES,
  });

  const template = Template.fromStack(
    new ComplianceLogBucketStack(app, 'ComplianceLogBucketStackWithVpc', {
      env: TestAppConfig.deploymentDefinition.RES.env,
      complianceLogBucketName: 'compliance-log-bucket',
      vpc: vpcStack.vpc,
      securityGroup: vpcStack.securityGroup,
      subnetSelection: vpcStack.vpc?.selectSubnets({
        subnetType: vpcStack.subnetType,
      }),
    }),
  );

  test('Check if Lambda Function exists and has VPC Configured', () => {
    template.resourceCountIs('AWS::Lambda::Function', 2);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'make-compliance-log-bucket.handler',
      Runtime: 'python3.12',
      VpcConfig: Match.anyValue(),
    });
  });

  test('Check if Custom Resource exists', () => {
    template.resourceCountIs('AWS::CloudFormation::CustomResource', 1);
  });
});
