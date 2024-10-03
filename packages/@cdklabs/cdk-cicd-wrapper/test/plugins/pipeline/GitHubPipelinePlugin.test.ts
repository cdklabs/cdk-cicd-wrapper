// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { ICIDefinition, GlobalResources, ResourceContext, GitHubPipelinePlugin, Stage } from '../../../src';
import { TestAppConfig } from '../../TestConfig';
import { BuildSpec } from 'aws-cdk-lib/aws-codebuild';
import { Template } from 'aws-cdk-lib/assertions';

describe('GitHubPipelinePlugin', () => {
  let mockCIDefinition: ICIDefinition;
  let resourceProviders: { [key: string]: any };
  let context: ResourceContext;

  beforeEach(() => {
    // mock
    mockCIDefinition = {
      provideBuildSpec: jest.fn(() => BuildSpec.fromObject({})),
      append: jest.fn(),
      provideCodeBuildDefaults: jest.fn(() => ({})),
      additionalPolicyStatements: jest.fn(),
    };

    resourceProviders = {
      [GlobalResources.CI_DEFINITION]: { provide: () => mockCIDefinition },
    };

    context = new ResourceContext(new cdk.App(), new cdk.Stack(), { ...TestAppConfig, resourceProviders, plugins: {} });
  });

  test('GitHubPipelinePlugin defines repository and pipeline resources', () => {
    const plugin = new GitHubPipelinePlugin({
        repositoryName: 'test/repository'
    });

    plugin.create(context);

    context.initStage(Stage.RES);
    expect(context.get(GlobalResources.PIPELINE)).toBeDefined();
    expect(context.get(GlobalResources.REPOSITORY)).toBeDefined();
  });

  test('GitHubPipelinePlugin defines role with OIDC', () => {
    const plugin = new GitHubPipelinePlugin({
        repositoryName: 'test/repository'
    });

    plugin.create(context);

    context.initStage(Stage.RES);
    expect(context.get(GlobalResources.REPOSITORY)).toBeDefined();

    Template.fromStack(context.get(GlobalResources.REPOSITORY))
        .hasResourceProperties('AWS::IAM::Role', {
            AssumeRolePolicyDocument: {
                Statement: [
                    {
                        Action: 'sts:AssumeRoleWithWebIdentity',
                        Condition: {
                            StringLike: {
                                'token.actions.githubusercontent.com:sub': ['repo:test/repository:*']
                            }
                        },
                        Effect: 'Allow'
                    }
                ]
            }
        });
  });

  test('GitHubPipelinePlugin defines role with specific role name and additional policies', () => {
    const plugin = new GitHubPipelinePlugin({
        repositoryName: 'test/repository',
        roleName: 'my-github-role',
    });

    mockCIDefinition.provideCodeBuildDefaults = () => ({
        rolePolicy: [
            new iam.PolicyStatement({
                actions: ['ec2:*'],
                resources: ['*'],
            }),
        ],
    });

    plugin.create(context);

    context.initStage(Stage.RES);
    expect(context.get(GlobalResources.REPOSITORY)).toBeDefined();

    const template = Template.fromStack(context.get(GlobalResources.REPOSITORY));
    template.hasResourceProperties('AWS::IAM::Role', {
            RoleName: 'my-github-role',
            AssumeRolePolicyDocument: {
                Statement: [
                    {
                        Action: 'sts:AssumeRoleWithWebIdentity',
                        Condition: {
                            StringLike: {
                                'token.actions.githubusercontent.com:sub': ['repo:test/repository:*']
                            }
                        },
                        Effect: 'Allow'
                    }
                ]
            }
        });
    template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
            Statement: [
                {
                    Action: 'ec2:*',
                    Effect: 'Allow',
                    Resource: '*'
                }
            ]
        }
    });
  });

});