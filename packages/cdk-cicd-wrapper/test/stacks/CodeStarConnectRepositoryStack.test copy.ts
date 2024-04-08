// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CodeStarConnectRepositoryStack } from '../../src/stacks';
import { TestAppConfig, TestRepositoryConfigGithub } from '../TestConfig';

describe('repository-stack-test-codestarconnect', () => {
  const app = new cdk.App();
  const stack = new CodeStarConnectRepositoryStack(app, 'RepositoryStack', {
    env: TestAppConfig.deploymentDefinition.RES.env,
    applicationName: TestAppConfig.applicationName,
    applicationQualifier: TestAppConfig.applicationQualifier,
    ...TestRepositoryConfigGithub,
    codeStarConnectionArn: TestRepositoryConfigGithub.codeStarConnectionArn!,
  });

  const template = Template.fromStack(stack);
  test('Check if resources should not exist', () => {
    expect(template.toJSON()).not.toHaveProperty('Resources');
  });
});
