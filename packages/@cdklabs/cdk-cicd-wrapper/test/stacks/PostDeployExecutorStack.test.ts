// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ResourceContext, Stage } from '../../src/common';
import { PostDeployExecutorStack } from '../../src/stacks';
import { TestAppConfig } from '../TestConfig';

describe('post-deploy-role-stack-test', () => {
  const app = new cdk.App();

  new ResourceContext(app, new cdk.Stack(), { ...TestAppConfig, resourceProviders: {}, plugins: {} });
  ResourceContext.instance().initStage(Stage.DEV);

  const template = Template.fromStack(
    new PostDeployExecutorStack(app, 'PostDeployExecutorStack', {
      env: TestAppConfig.deploymentDefinition.DEV.env,
      resAccount: TestAppConfig.deploymentDefinition.RES.env.account,
      stageName: Stage.DEV,
      name: TestAppConfig.applicationName,
    }),
  );

  test('Check if role exists', () => {
    template.resourceCountIs('AWS::IAM::Role', 1);
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: { Statement: [{ Action: 'sts:AssumeRole', Effect: 'Allow' }] },
    });
  });

  test('Check if output exists', () => {
    template.hasOutput('RoleArnCfnOutput', {
      Value: 'arn:aws:iam::234567890123:role/post-deploy-234567890123-eu-west-1-CICDWrapper-DEV',
    });
  });

  test('Check if role arn is added to the context', () => {
    expect(ResourceContext.instance().get(PostDeployExecutorStack.POST_DEPLOY_ROLE_ARN)).toBe(
      'arn:aws:iam::234567890123:role/post-deploy-234567890123-eu-west-1-CICDWrapper-DEV',
    );
  });
});
