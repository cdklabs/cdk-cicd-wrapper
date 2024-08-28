// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as pipelines from 'aws-cdk-lib/pipelines';
import { IConstruct } from 'constructs';
import { ICodeBuildFactory } from './CodeBuildFactoryProvider';
import { RepositoryType, GlobalResources, ResourceContext, IResourceProvider, RepositoryConfig } from '../common';
import { CodeStarConnectRepositoryStack } from '../stacks';
import { CodeCommitRepositoryStack } from '../stacks/CodeCommitRepositoryStack';

/**
 * Default configuration for repository provider.
 */
const defaultRepositoryConfig: BaseRepositoryProviderProps = {
  repositoryType: process.env.npm_package_config_repositoryType as RepositoryType,
  name: process.env.npm_package_config_repositoryName!,
  branch: 'main', // Default branch is 'main'
  codeStarConnectionArn: process.env.CODESTAR_CONNECTION_ARN,
  codeGuruReviewer: true, // Default value for codeGuruReviewer is true
};

/**
 * Represents a repository stack in the pipeline.
 */
export interface IRepositoryStack extends IConstruct {
  readonly pipelineInput: pipelines.IFileSetProducer;
  readonly pipelineEnvVars: { [key: string]: string };
  readonly repositoryBranch: string;
}

/**
 * Provider for repository resources.
 */
export type RepositoryProvider = IResourceProvider;

/**
 * Base properties for repository provider.
 */
export interface BaseRepositoryProviderProps extends RepositoryConfig {
  readonly codeStarConnectionArn?: string;
  readonly codeGuruReviewer?: boolean;
}

/**
 * Basic implementation of repository provider.
 */
export class BasicRepositoryProvider implements RepositoryProvider {
  constructor(readonly config: BaseRepositoryProviderProps = defaultRepositoryConfig) {}

  /**
   * Provides a repository stack based on the configuration.
   * @param context The resource context.
   * @returns The repository stack.
   */
  provide(context: ResourceContext): any {
    const { applicationName, deploymentDefinition, applicationQualifier } = context.blueprintProps;

    const codebuildFactory: ICodeBuildFactory = context.get(GlobalResources.CODEBUILD_FACTORY)!;
    const ciDefinition = context.get(GlobalResources.CI_DEFINITION)!;

    switch (this.config.repositoryType) {
      case 'GITHUB': {
        if (!this.config.codeStarConnectionArn) {
          throw new Error('CodeStar connection ARN is required for CodeStarConnection based repository');
        }

        return new CodeStarConnectRepositoryStack(context.scope, `${applicationName}Repository`, {
          env: { account: deploymentDefinition.RES.env.account, region: deploymentDefinition.RES.env.region },
          applicationName: applicationName,
          applicationQualifier: applicationQualifier,
          codeStarConnectionArn: this.config.codeStarConnectionArn,
          ...this.config,
        });
      }
      case 'CODECOMMIT': {
        return new CodeCommitRepositoryStack(context.scope, `${applicationName}Repository`, {
          env: {
            account: deploymentDefinition.RES.env.account,
            region: deploymentDefinition.RES.env.region,
          },
          applicationName: applicationName,
          applicationQualifier: applicationQualifier,
          ...this.config,
          pr: {
            codeGuruReviewer: this.config.codeGuruReviewer || false, // Default value is false
            codeBuildOptions: codebuildFactory.provideCodeBuildOptions(),
            buildSpec: ciDefinition,
          },
        });
      }
      default: {
        throw new Error(`Unsupported repository type: ${this.config.repositoryType}`);
      }
    }
  }
}
