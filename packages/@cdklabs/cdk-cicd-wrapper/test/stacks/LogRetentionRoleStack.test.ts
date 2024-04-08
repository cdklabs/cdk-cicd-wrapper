// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Stage } from '../../src/common';
import { EncryptionStack, LogRetentionRoleStack } from '../../src/stacks';
import { TestAppConfig } from '../TestConfig';

describe('log-retention-role-stack-test', () => {
  const app = new cdk.App();

  const encryptionStack = new EncryptionStack(app, 'EncryptionStack', {
    env: TestAppConfig.deploymentDefinition.RES.env,
    applicationName: TestAppConfig.applicationName,
    stageName: Stage.RES,
  });

  const template = Template.fromStack(
    new LogRetentionRoleStack(app, 'LogRetentionRoleStack', {
      env: TestAppConfig.deploymentDefinition.RES.env,
      resAccount: TestAppConfig.deploymentDefinition.RES.env.account,
      stageName: Stage.RES,
      applicationName: TestAppConfig.applicationName,
      encryptionKey: encryptionStack.kmsKey,
    }),
  );

  test('Check if role exists', () => {
    template.resourceCountIs('AWS::IAM::Role', 1);
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: { Statement: [{ Action: 'sts:AssumeRole', Effect: 'Allow' }] },
    });
  });

  test('Check if output exists', () => {
    const roleName = Object.keys(template.findResources('AWS::IAM::Role'))[0];
    template.hasOutput('RoleArnCfnOutput', {
      Value: { 'Fn::GetAtt': [roleName, 'Arn'] },
    });
  });
});
