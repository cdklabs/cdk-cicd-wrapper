// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as pipelines from 'aws-cdk-lib/pipelines';
import { IConstruct } from 'constructs';
import { ICodeBuildFactory } from './CodeBuildFactoryProvider';
import { logger } from './LoggingProvider';
import { RepositoryType, GlobalResources, ResourceContext, IResourceProvider, RepositoryConfig } from '../common';
import { CodeStarConnectRepositoryStack } from '../stacks';
import { CodeCommitRepositoryStack } from '../stacks/CodeCommitRepositoryStack';

/**
 * Default configuration for repository provider.
 */
const defaultRepositoryConfig: BaseRepositoryProviderProps = {
  repositoryType: (process.env.npm_package_config_repositoryType as RepositoryType | undefined) || 'CODECOMMIT',
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
    const repositorySource =
      context.blueprintProps.repositorySource || RepositorySource.basedType(this.config.repositoryType, this.config);

    return repositorySource.produceSourceConfig(context);
  }
}

/**
 * Represents a repository source.
 */
export abstract class RepositorySource {

  /**
   * Creates a new CodeCommit repository source.
   * 
   * @param options The repository source options.
   * @returns 
   */
  static codecommit(options?: CodeCommitRepositorySourceOptions): RepositorySource {
    return new CodeCommitRepositorySource(options);
  }

  /**
   * Creates a new Github - CodeStar connection repository source.
   * 
   * @param options The repository source options.
   * @returns 
   */
  static github(options?: CodeStarConnectionRepositorySourceOptions): RepositorySource {
    return new CodeStarConnectionRepositorySource(options);
  }

  /**
   * Creates a new CodeStar connection repository source.
   * 
   * @param options The repository source options.
   * @returns 
   */
  static codestarConnection(options?: CodeStarConnectionRepositorySourceOptions): RepositorySource {
    return new CodeStarConnectionRepositorySource(options);
  }

  static basedType(type: RepositoryType, config?: BaseRepositoryProviderProps): RepositorySource {
    switch (type) {
      case 'GITHUB':
        return this.github({
          repositoryName: config?.name,
          branch: config?.branch,
          description: config?.description,
          codeStarConnectionArn: config?.codeStarConnectionArn,
        });
      case 'CODECOMMIT':
        return this.codecommit({
          repositoryName: config?.name,
          branch: config?.branch,
          description: config?.description,
          enableCodeGuruReviewer: config?.codeGuruReviewer,
          enablePullRequestChecks: true,
        });
      default:
        throw new Error(`Unsupported repository type: ${type}`);
    }
  }

  protected constructor() {}

  abstract produceSourceConfig(context: ResourceContext): IRepositoryStack;
}

export class CodeCommitRepositorySource extends RepositorySource {
  constructor(private options: CodeCommitRepositorySourceOptions = {}) {
    super();
  }

  produceSourceConfig(context: ResourceContext): IRepositoryStack {
    const { applicationName, deploymentDefinition, applicationQualifier } = context.blueprintProps;

    let prConfig = {};

    if (this.options.enablePullRequestChecks ?? true) {
      const codebuildFactory: ICodeBuildFactory = context.get(GlobalResources.CODEBUILD_FACTORY)!;
      const ciDefinition = context.get(GlobalResources.CI_DEFINITION)!;

      prConfig = {
        pr: {
          codeGuruReviewer: this.options.enableCodeGuruReviewer || false, // Default value is false
          codeBuildOptions: codebuildFactory.provideCodeBuildOptions(),
          buildSpec: ciDefinition,
        },
      };
    }

    return new CodeCommitRepositoryStack(context.scope, `${applicationName}Repository`, {
      env: {
        account: deploymentDefinition.RES.env.account,
        region: deploymentDefinition.RES.env.region,
      },
      applicationName: applicationName,
      applicationQualifier: applicationQualifier,
      repositoryType: 'CODECOMMIT',
      name: this.options.repositoryName || defaultRepositoryConfig.name || applicationName,
      branch: this.options.branch || defaultRepositoryConfig.branch,
      codeBuildCloneOutput: this.options.codeBuildCloneOutput || false,
      ...prConfig,
    });
  }
}

export class CodeStarConnectionRepositorySource extends RepositorySource {
  constructor(private options: CodeStarConnectionRepositorySourceOptions = {}) {
    super();
  }

  produceSourceConfig(context: ResourceContext): IRepositoryStack {
    const { applicationName, deploymentDefinition, applicationQualifier } = context.blueprintProps;

    const codeStarConnectionArn = this.options.codeStarConnectionArn || defaultRepositoryConfig.codeStarConnectionArn;

    if (!codeStarConnectionArn) {
      logger.error('CodeStarConnectionArn is required for CodeStarConnectionRepositorySource');
      throw new Error('CodeStarConnectionArn is required for CodeStarConnectionRepositorySource');
    }

    return new CodeStarConnectRepositoryStack(context.scope, `${applicationName}Repository`, {
      env: { account: deploymentDefinition.RES.env.account, region: deploymentDefinition.RES.env.region },
      applicationName: applicationName,
      applicationQualifier: applicationQualifier,
      codeStarConnectionArn: codeStarConnectionArn,
      repositoryType: 'GITHUB',
      name: this.options.repositoryName || defaultRepositoryConfig.name || applicationName,
      branch: this.options.branch || defaultRepositoryConfig.branch,
      codeBuildCloneOutput: this.options.codeBuildCloneOutput || false,
    });
  }
}

/**
 * Represents the configuration for a repository source.
 */
export interface RepositorySourceOptions {
  /**
   * The name of the repository.
   * @default - The name of the application.
   * 
   * other options to configure:
   * in  package.json file
   * 
   * "config": {
   *  "repositoryName": "my-repo",
   * }
   */
  readonly repositoryName?: string;

  /**
   * The branch of the repository.
   * @default - 'main'
   */
  readonly branch?: string;

  /**
   * The description of the repository.
   * @default - No description.
   */
  readonly description?: string;

  /**
   * Enforce full clone for the repository.
   * Tools like semgrep and pre-commit hooks require a full clone.
   * 
   * @default - false
   */
  readonly codeBuildCloneOutput?: boolean;
}

export interface CodeCommitRepositorySourceOptions extends RepositorySourceOptions {
  /**
   * Enable pull request checks.
   * 
   * @default - true
   */
  readonly enablePullRequestChecks?: boolean;

  /**
   * Enable CodeGuru Reviewer.
   * 
   * @default - false
   */
  readonly enableCodeGuruReviewer?: boolean;
}

export interface CodeStarConnectionRepositorySourceOptions extends RepositorySourceOptions {
  /**
   * The ARN of the CodeStar connection.
   * 
   * @default - The value of the CODESTAR_CONNECTION_ARN environment variable.
   */
  readonly codeStarConnectionArn?: string;
}
