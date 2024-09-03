// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { BuildSpec } from 'aws-cdk-lib/aws-codebuild';
import { GlobalResources, IPlugin, ResourceContext } from '../../common';

export enum CodeArtifactRepositoryTypes {
  NPM = 'npm',
  PYPI = 'pypi',
  MAVEN = 'maven',
}

export interface CodeArtifactBucketPluginProps {
  readonly domain: string;

  readonly account?: string;

  readonly repositoryName: string;

  readonly repositoryTypes?: CodeArtifactRepositoryTypes[];
}

/**
 * Plugin to enable key rotation for KMS keys.
 */
export class CodeArtifactBucketPlugin implements IPlugin {
  readonly name: string = 'CodeArtifactBucketPlugin';

  readonly version: string = '1.0';

  constructor(private readonly options: CodeArtifactBucketPluginProps) {}

  create(context: ResourceContext): void {
    const { domain, repositoryName } = this.options;
    const account = this.options.account || context.blueprintProps.deploymentDefinition.RES.env.account;
    const region = context.blueprintProps.deploymentDefinition.RES.env.region;
    const repositoryTypes = this.options.repositoryTypes || [CodeArtifactRepositoryTypes.NPM];

    const commands = repositoryTypes.map(
      (type) =>
        `aws codeartifact login--domain ${domain} --domain-owner ${account} --repository ${repositoryName} --tool ${type}`,
    );

    const ciDefinition = context.get(GlobalResources.CI_DEFINITION);

    ciDefinition.append(
      BuildSpec.fromObject({
        phases: {
          pre_build: {
            commands: commands,
          },
        },
      }),
    );

    ciDefinition.additionalPolicyStatements([
      {
        Effect: 'Allow',
        Action: ['codeartifact:GetAuthorizationToken'],
        Resource: `arn:aws:codeartifact:${region}:${account}:domain/${domain}`,
      },
      {
        Effect: 'Allow',
        Action: ['codeartifact:GetRepositoryEndpoint', 'codeartifact:ReadFromRepository'],
        Resource: `arn:aws:codeartifact:${region}:${account}:repository/${domain}/${repositoryName}`,
      },
      {
        Effect: 'Allow',
        Action: 'sts:GetServiceBearerToken',
        Resource: '*',
        Condition: { StringEquals: { 'sts:AWSServiceName': 'codeartifact.amazonaws.com' } },
      },
    ]);
  }
}
