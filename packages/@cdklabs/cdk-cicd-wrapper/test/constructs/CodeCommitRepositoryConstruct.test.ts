// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { GlobalResources, ResourceContext } from '../../src/common';
import { CodeCommitRepositoryConstruct } from '../../src/constructs/CodeCommitRepositoryConstruct';
import { ParameterProvider } from '../../src/resource-providers';
import { TestAppConfig, TestRepositoryConfigCodeCommit } from '../TestConfig';

describe('codecommit-repository-construct', () => {
  const stack = new cdk.Stack();

  const parameterProvider = new ParameterProvider();
  const resourceProviders = {
    [GlobalResources.PARAMETER_STORE]: parameterProvider,
  };

  new ResourceContext(new cdk.App(), new cdk.Stack(), { ...TestAppConfig, resourceProviders });

  new CodeCommitRepositoryConstruct(stack, 'CodeCommit', {
    applicationName: TestAppConfig.applicationName,
    applicationQualifier: TestAppConfig.applicationQualifier,
    ...TestRepositoryConfigCodeCommit,
    pr: {
      codeGuruReviewer: true,
      buildSpec: codebuild.BuildSpec.fromObject({}),
      codeBuildOptions: {},
    },
  });

  const template = Template.fromStack(stack);

  test('Check if CodeCommit repo exists', () => {
    template.resourceCountIs('AWS::CodeCommit::Repository', 1);
    template.hasResourceProperties('AWS::CodeCommit::Repository', {
      RepositoryName: TestRepositoryConfigCodeCommit.name,
    });
  });

  test('Check if CfnRepositoryAssociation exists', () => {
    template.resourceCountIs('AWS::CodeGuruReviewer::RepositoryAssociation', 1);
    template.hasResourceProperties('AWS::CodeGuruReviewer::RepositoryAssociation', {
      Type: 'CodeCommit',
    });
  });

  test('Check if ApprovalRuleTemplate exists', () => {
    template.resourceCountIs('Custom::ApprovalRuleTemplate', 1);
    template.hasResourceProperties('Custom::ApprovalRuleTemplate', {
      Template: {
        Approvers: {
          NumberOfApprovalsNeeded: 1,
        },
      },
    });
  });

  test('Check if ApprovalRuleTemplateRepositoryAssociation exists', () => {
    template.resourceCountIs('Custom::ApprovalRuleTemplateRepositoryAssociation', 1);
    template.hasResourceProperties('Custom::ApprovalRuleTemplateRepositoryAssociation', {});
  });
});
