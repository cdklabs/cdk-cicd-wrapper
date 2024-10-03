// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { BuildSpec } from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import { GlobalResources, PluginBase, ResourceContext } from '../../common';

export enum CodeArtifactRepositoryTypes {
  NPM = 'npm',
  PIP = 'pip',
  NUGET = 'nuget',
  SWIFT = 'swift',
  DOTNET = 'dotnet',
  TWINE = 'twine',
}

export interface CodeArtifactPluginProps {
  readonly domain: string;

  readonly account?: string;

  readonly repositoryName: string;

  readonly repositoryTypes?: CodeArtifactRepositoryTypes[];

  readonly npmScope?: string;

  readonly region?: string;
}

/**
 * Plugin to enable key rotation for KMS keys.
 */
export class CodeArtifactPlugin extends PluginBase {
  readonly name: string = 'CodeArtifactPlugin';

  readonly version: string = '1.0';

  constructor(private readonly options: CodeArtifactPluginProps) {
    super();
  }

  create(context: ResourceContext): void {
    const { domain, repositoryName } = this.options;
    const account = this.options.account || context.blueprintProps.deploymentDefinition.RES.env.account;
    const region = this.options.region ?? context.blueprintProps.deploymentDefinition.RES.env.region;
    const repositoryTypes = this.options.repositoryTypes || [CodeArtifactRepositoryTypes.NPM];

    const commands = repositoryTypes.map((type) =>
      type === CodeArtifactRepositoryTypes.NPM && this.options.npmScope
        ? `aws codeartifact login --domain ${domain} --domain-owner ${account} --region ${region} --repository ${repositoryName} --tool ${type} --namespace ${this.options.npmScope}`
        : `aws codeartifact login --domain ${domain} --domain-owner ${account} --region ${region} --repository ${repositoryName} --tool ${type}`,
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
      new iam.PolicyStatement({
        actions: ['codeartifact:GetAuthorizationToken'],
        resources: [`arn:aws:codeartifact:${region}:${account}:domain/${domain}`],
      }),
      new iam.PolicyStatement({
        actions: ['codeartifact:GetRepositoryEndpoint', 'codeartifact:ReadFromRepository'],
        resources: [`arn:aws:codeartifact:${region}:${account}:repository/${domain}/${repositoryName}`],
      }),
      new iam.PolicyStatement({
        actions: ['sts:GetServiceBearerToken'],
        resources: ['*'],
        conditions: { StringEquals: { 'sts:AWSServiceName': 'codeartifact.amazonaws.com' } },
      }),
    ]);
  }
}
