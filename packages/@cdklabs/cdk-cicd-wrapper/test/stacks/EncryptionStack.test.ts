// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Stage } from '../../src/common';
import { EncryptionStack } from '../../src/stacks';
import { TestAppConfig } from '../TestConfig';

describe('encryption-stack-test', () => {
  const app = new cdk.App();

  const template = Template.fromStack(
    new EncryptionStack(app, 'EncryptionStack', {
      env: TestAppConfig.deploymentDefinition.RES.env,
      applicationName: TestAppConfig.applicationName,
      stageName: Stage.RES,
    }),
  );

  test('Check if KMS Key exists', () => {
    template.resourceCountIs('AWS::KMS::Key', 1);
    template.hasResourceProperties('AWS::KMS::Key', {});
  });

  test('Check if KMS Alias exists', () => {
    template.resourceCountIs('AWS::KMS::Alias', 1);
    template.hasResourceProperties('AWS::KMS::Alias', {
      AliasName: `alias/${TestAppConfig.applicationName}-${Stage.RES}-key`,
    });
  });

  test('Check if Stack Output exists', () => {
    template.hasOutput('KeyArnCfnOutput', {
      Export: {
        Name: `${TestAppConfig.applicationName}-${Stage.RES}-kms-key-arn`,
      },
    });
  });
});
