// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import { ICIDefinition, GlobalResources, ResourceContext } from '../../../src';
import { CodeArtifactPlugin, CodeArtifactRepositoryTypes } from '../../../src/plugins/utils/CodeArtifactPlugin';
import { TestAppConfig } from '../../TestConfig';

describe('CodeArtifactPlugin', () => {
  let mockCIDefinition: ICIDefinition;
  let resourceProviders: { [key: string]: any };
  let context: ResourceContext;

  beforeEach(() => {
    // mock
    mockCIDefinition = {
      provideBuildSpec: jest.fn(),
      append: jest.fn(),
      provideCodeBuildDefaults: jest.fn(),
      additionalPolicyStatements: jest.fn(),
    };

    resourceProviders = {
      [GlobalResources.CI_DEFINITION]: { provide: () => mockCIDefinition },
    };

    context = new ResourceContext(new cdk.App(), new cdk.Stack(), { ...TestAppConfig, resourceProviders, plugins: {} });
  });

  test('Check if account RES account number is used by default', () => {
    const plugin = new CodeArtifactPlugin({
      domain: 'test-domain',
      repositoryName: 'test-repo',
    });

    plugin.create(context);

    expect(mockCIDefinition.append).toHaveBeenCalledWith(
      codebuild.BuildSpec.fromObject({
        phases: {
          pre_build: {
            commands: [
              `aws codeartifact login --domain test-domain --domain-owner ${TestAppConfig.deploymentDefinition.RES.env.account} --repository test-repo --tool npm`,
            ],
          },
        },
      }),
    );

    expect(mockCIDefinition.additionalPolicyStatements).toHaveBeenCalledWith([
      new iam.PolicyStatement({
        actions: ['codeartifact:GetAuthorizationToken'],
        resources: [
          `arn:aws:codeartifact:${TestAppConfig.deploymentDefinition.RES.env.region}:${TestAppConfig.deploymentDefinition.RES.env.account}:domain/test-domain`,
        ],
      }),
      new iam.PolicyStatement({
        actions: ['codeartifact:GetRepositoryEndpoint', 'codeartifact:ReadFromRepository'],
        resources: [
          `arn:aws:codeartifact:${TestAppConfig.deploymentDefinition.RES.env.region}:${TestAppConfig.deploymentDefinition.RES.env.account}:repository/test-domain/test-repo`,
        ],
      }),
      new iam.PolicyStatement({
        actions: ['sts:GetServiceBearerToken'],
        resources: ['*'],
        conditions: { StringEquals: { 'sts:AWSServiceName': 'codeartifact.amazonaws.com' } },
      }),
    ]);
  });

  test('Check if account RES account number is used by default', () => {
    const plugin = new CodeArtifactPlugin({
      domain: 'test-domain',
      repositoryName: 'test-repo',
      repositoryTypes: [CodeArtifactRepositoryTypes.NPM, CodeArtifactRepositoryTypes.PIP],
    });

    plugin.create(context);

    expect(mockCIDefinition.append).toHaveBeenCalledWith(
      codebuild.BuildSpec.fromObject({
        phases: {
          pre_build: {
            commands: [
              `aws codeartifact login --domain test-domain --domain-owner ${TestAppConfig.deploymentDefinition.RES.env.account} --repository test-repo --tool npm`,
              `aws codeartifact login --domain test-domain --domain-owner ${TestAppConfig.deploymentDefinition.RES.env.account} --repository test-repo --tool pip`,
            ],
          },
        },
      }),
    );

    expect(mockCIDefinition.additionalPolicyStatements).toHaveBeenCalledWith([
      new iam.PolicyStatement({
        actions: ['codeartifact:GetAuthorizationToken'],
        resources: [
          `arn:aws:codeartifact:${TestAppConfig.deploymentDefinition.RES.env.region}:${TestAppConfig.deploymentDefinition.RES.env.account}:domain/test-domain`,
        ],
      }),
      new iam.PolicyStatement({
        actions: ['codeartifact:GetRepositoryEndpoint', 'codeartifact:ReadFromRepository'],
        resources: [
          `arn:aws:codeartifact:${TestAppConfig.deploymentDefinition.RES.env.region}:${TestAppConfig.deploymentDefinition.RES.env.account}:repository/test-domain/test-repo`,
        ],
      }),
      new iam.PolicyStatement({
        actions: ['sts:GetServiceBearerToken'],
        resources: ['*'],
        conditions: { StringEquals: { 'sts:AWSServiceName': 'codeartifact.amazonaws.com' } },
      }),
    ]);
  });
});
