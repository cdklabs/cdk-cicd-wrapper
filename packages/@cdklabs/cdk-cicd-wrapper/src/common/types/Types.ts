// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { Step } from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import { PipelineOptions } from '../../code-pipeline';
import { BuildOptions, RepositorySource } from '../../resource-providers';
import { IVpcConfig } from '../../resource-providers/VPCProvider';
import { ResourceContext } from '../spi';

/**
 * Represents a stage in the pipeline.
 * Valid stages are: 'RES', 'DEV', 'INT', 'PROD', or any other string value.
 */
export type IStage = 'RES' | 'DEV' | 'INT' | 'PROD' | string;

/**
 * Represents an environment with an account and region.
 */
export interface Environment {
  /**
   * The account ID.
   */
  readonly account: string;

  /**
   * The region.
   */
  readonly region: string;
}

/**
 * A type that maps each stage (key) to a value of type T.
 */
export type AllStage<T> = { [key in IStage]: T };

/**
 * A type that maps each stage (key) to a value of type T, with the 'RES' stage being required.
 */
export type RequiredRESStage<T> = AllStage<T> & { RES: T };

/**
 * Represents the stages in the pipeline.
 */
export class Stage {
  /**
   * The 'RES' stage.
   */
  public static readonly RES = 'RES';

  /**
   * The 'DEV' stage.
   */
  public static readonly DEV = 'DEV';

  /**
   * The 'INT' stage.
   */
  public static readonly INT = 'INT';

  /**
   * The 'PROD' stage.
   */
  public static readonly PROD = 'PROD';
}

/**
 * Represents the severity thresholds for CodeGuru.
 */
export enum CodeGuruSeverityThreshold {
  /**
   * Information severity threshold.
   */
  INFO = 'Info',

  /**
   * Low severity threshold.
   */
  LOW = 'Low',

  /**
   * Medium severity threshold.
   */
  MEDIUM = 'Medium',

  /**
   * High severity threshold.
   */
  HIGH = 'High',

  /**
   * Critical severity threshold.
   */
  CRITICAL = 'Critical',
}

/**
 * Represents the configuration for an NPM registry.
 */
export interface NPMRegistryConfig {
  /**
   * The URL of the NPM registry.
   */
  readonly url: string;

  /**
   * The ARN of the secret containing the basic auth credentials for the NPM registry.
   */
  readonly basicAuthSecretArn: string;

  /**
   * The scope for the NPM registry (optional).
   */
  readonly scope?: string;
}

/**
 * Represents the configuration for a vanilla pipeline.
 */
export interface IPipelineConfig {
  /**
   * The name of the application.
   */
  applicationName: string;

  /**
   * The qualifier for the application.
   */
  applicationQualifier: string;

  /**
   * The configuration for the NPM registry (optional).
   */
  npmRegistry?: NPMRegistryConfig;

  /**
   * The deployment definition for each stage.
   */
  deploymentDefinition: AllStage<DeploymentDefinition>;

  /**
   * The number of days to retain logs.
   */
  logRetentionInDays: string;

  /**
   * The environment settings for CodeBuild.
   */
  codeBuildEnvSettings: codebuild.BuildEnvironment;

  /**
   * The severity threshold for CodeGuru scans (optional).
   */
  codeGuruScanThreshold?: CodeGuruSeverityThreshold;

  /**
   * The phases in the pipeline.
   */
  phases: IPipelinePhases;

  /**
   * The build specification for the Synth phase.
   *
   * The buildSpec takes precedence over the phases.
   */
  buildSpec?: codebuild.BuildSpec;

  /**
   * The primary output directory for the pipeline.
   */
  primaryOutputDirectory: string;

  /**
   * The configuration for the workbench (optional).
   */
  workbench?: WorkbenchConfig;

  /**
   * Additional pipelineOptions.
   */
  pipelineOptions?: PipelineOptions;

  /**
   * Additional buildOptions.
   */
  buildOptions?: BuildOptions;

  /**
   * The repository source for the pipeline.
   */
  repositorySource?: RepositorySource;
}

/**
 * Represents the configuration for a workbench.
 */
export interface WorkbenchConfig {
  /**
   * The stack provider for the workbench.
   */
  readonly stackProvider: IStackProvider;

  /**
   * The options for the workbench.
   */
  readonly options: WorkbenchOptions;
}

/**
 * Represents the options for a workbench.
 */
export interface WorkbenchOptions {
  /**
   * The stage to use for the workbench (optional).
   */
  readonly stageToUse?: string;

  /**
   * The prefix for the workbench (optional).
   */
  readonly workbenchPrefix?: string;
}

/**
 * Represents the phases in a pipeline.
 */
export interface IPipelinePhases {
  /**
   * The commands to run during the initialize phase (optional).
   */
  initialize?: IPhaseCommand[];

  /**
   * The commands to run during the pre-build phase (optional).
   */
  preBuild?: IPhaseCommand[];

  /**
   * The commands to run during the run-build phase (optional).
   */
  runBuild?: IPhaseCommand[];

  /**
   * The commands to run during the testing phase (optional).
   */
  testing?: IPhaseCommand[];

  /**
   * The commands to run during the pre-deploy phase (optional).
   */
  preDeploy?: IPhaseCommand[];

  /**
   * The commands to run during the post-deploy phase (optional).
   */
  postDeploy?: IPhaseCommand[];
}

/**
 * Represents the configuration for deployment hooks.
 */
export interface DeploymentHookConfig {
  /**
   * The pre-deployment steps (optional).
   */
  readonly pre?: Step[];

  /**
   * The post-deployment steps (optional).
   */
  readonly post?: Step[];
}

/**
 * Represents a stack provider interface.
 */
export interface IStackProvider {
  /**
   * Provides the deployment hook configuration or void.
   * @param context The resource context.
   */
  provide(context: ResourceContext): void;
}

/**
 * Represents a deployment definition.
 */
export interface DeploymentDefinition {
  /**
   * The environment for the deployment.
   */
  readonly env: Environment;

  /**
   * The stack providers for the deployment.
   */
  readonly stacksProviders: IStackProvider[];

  /**
   * Manual approval is required or not.
   *
   * @default for DEV stage it is false otherwise true
   */
  readonly manualApprovalRequired: boolean;

  /**
   * The complianceLogBucketName Name
   */
  readonly complianceLogBucketName?: string;

  /**
   * The VPC configuration for the deployment.
   */
  readonly vpc?: IVpcConfig;
}

/**
 * Represents a stage definition.
 */
export interface IStageDefinition {
  /**
   * The name of the stage.
   */
  stage: string;

  /**
   * The account for the stage (optional).
   */
  account?: string;

  /**
   * The region for the stage (optional).
   */
  region?: string;

  /**
   * Manual approval is required or not.
   *
   * @default for DEV stage it is false otherwise true
   */
  manualApprovalRequired?: boolean;

  /**
   * The complianceBucket Name
   */
  complianceLogBucketName?: string;

  /**
   * The VPC configuration for the stage.
   */
  vpc?: IVpcConfig;
}

/**
 * Represents the type of a repository.
 */
export type RepositoryType = 'GITHUB' | 'CODECOMMIT';

/**
 * Represents the configuration for a repository.
 */
export interface RepositoryConfig {
  /**
   * The type of the repository.
   */
  readonly repositoryType: RepositoryType;

  /**
   * The branch for the repository.
   */
  readonly branch: string;

  /**
   * The name of the repository.
   */
  readonly name: string;

  /**
   * The description of the repository (optional).
   */
  readonly description?: string;

  /**
   * Enforce full clone for the repository.
   */
  readonly codeBuildCloneOutput?: boolean;
}

/**
 * Represents the phases in a pipeline.
 */
export enum PipelinePhases {
  /**
   * The initialize phase.
   */
  INITIALIZE = 'initialize',

  /**
   * The pre-build phase.
   */
  PRE_BUILD = 'preBuild',

  /**
   * The build phase.
   */
  BUILD = 'runBuild',

  /**
   * The testing phase.
   */
  TESTING = 'testing',

  /**
   * The pre-deploy phase.
   */
  PRE_DEPLOY = 'preDeploy',

  /**
   * The post-deploy phase.
   */
  POST_DEPLOY = 'postDeploy',
}

/**
 * The phases in an integration pipeline.
 */
export const INTEGRATION_PHASES = [PipelinePhases.PRE_BUILD, PipelinePhases.BUILD, PipelinePhases.TESTING];

/**
 * Represents a phase command.
 */
export interface IPhaseCommand {
  /**
   * The command to run during the phase.
   */
  readonly command: string;
}

/**
 * Represents a pipeline plugin
 */
export interface IPlugin {
  /**
   * The name of the plugin.
   */
  readonly name: string;

  /**
   * The version of the plugin.
   */
  readonly version: string;

  /**
   * The method called when the Pipeline configuration finalized.
   */
  create(context: ResourceContext): void;

  /**
   * The method called before the stage is created.
   */
  beforeStage(scope: Construct, context: ResourceContext): void;

  /**
   * The method called after the stage is created.
   */
  afterStage(scope: Construct, context: ResourceContext): void;
}

export abstract class PluginBase implements IPlugin {
  abstract readonly name: string;

  abstract readonly version: string;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //@ts-ignore
  create(context: ResourceContext): void {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //@ts-ignore
  beforeStage(scope: Construct, context: ResourceContext): void {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //@ts-ignore
  afterStage(scope: Construct, context: ResourceContext): void {
    return;
  }
}
