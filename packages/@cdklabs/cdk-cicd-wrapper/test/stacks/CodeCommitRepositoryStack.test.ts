// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { GlobalResources, ResourceContext } from '../../src/common';
import { ParameterProvider } from '../../src/resource-providers';
import { CodeCommitRepositoryStack } from '../../src/stacks/CodeCommitRepositoryStack';
import { TestAppConfig, TestRepositoryConfigCodeCommit } from '../TestConfig';

describe('repository-stack-test-codecommit', () => {
  const app = new cdk.App();

  const parameterProvider = new ParameterProvider();
  const resourceProviders = {
    [GlobalResources.PARAMETER_STORE]: parameterProvider,
  };

  new ResourceContext(app, new cdk.Stack(), { ...TestAppConfig, resourceProviders });

  const template = Template.fromStack(
    new CodeCommitRepositoryStack(app, 'RepositoryStack', {
      env: TestAppConfig.deploymentDefinition.RES.env,
      applicationName: TestAppConfig.applicationName,
      applicationQualifier: TestAppConfig.applicationQualifier,
      ...TestRepositoryConfigCodeCommit,
    }),
  );

  test('Check if CodeCommitRepository construct present', () => {
    template.resourceCountIs('AWS::CodeCommit::Repository', 1);
    template.hasResourceProperties('AWS::CodeCommit::Repository', {
      RepositoryName: TestRepositoryConfigCodeCommit.name,
    });
  });
});
