// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { ResourceContext } from '../spi';

export type IStage = 'RES' | 'DEV' | 'INT' | 'PROD' | string;

export type DeploymentStage = Exclude<IStage, 'PROD'>; // remove Exclude statement to add PROD stage to deployments

export interface Environment {
  readonly account: string;
  readonly region: string;
}

export type AllStage<T> = { [key in IStage]: T };
export type RequiredRESStage<T> = AllStage<T> & { RES: T };

export class Stage {
  public static readonly RES = 'RES';

  public static readonly DEV = 'DEV';

  public static readonly INT = 'INT';

  public static readonly PROD = 'PROD';
}

export enum CodeGuruSeverityThreshold {
  INFO = 'Info',
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  CRITICAL = 'Critical',
}

export interface NPMRegistryConfig {
  readonly url: string;
  readonly basicAuthSecretArn: string;
  readonly scope?: string;
}

export interface IVanillaPipelineConfig {
  applicationName: string;
  applicationQualifier: string;
  npmRegistry?: NPMRegistryConfig;
  deploymentDefinition: AllStage<DeploymentDefinition>;
  logRetentionInDays: string;
  codeBuildEnvSettings: codebuild.BuildEnvironment;
  codeGuruScanThreshold?: CodeGuruSeverityThreshold;
  phases: IPipelinePhases;
  primaryOutputDirectory: string;
}

export interface IPipelinePhases {
  initialize?: IPhaseCommand[];
  preBuild?: IPhaseCommand[];
  runBuild?: IPhaseCommand[];
  testing?: IPhaseCommand[];
  preDeploy?: IPhaseCommand[];
  postDeploy?: IPhaseCommand[];
}

export interface IStackProvider {
  provide(context: ResourceContext): void;
}

export interface DeploymentDefinition {
  readonly env: Environment;
  readonly stacksProviders: IStackProvider[];
}

export interface IStageDefinition {
  stage: string;
  account?: string;
  region?: string;
}

export type RepositoryType = 'GITHUB' | 'CODECOMMIT';

export interface ICodeCommitConfig {
  name: string;
  description: string;
  branch: string;
  codeGuruReviewer: boolean;
}

export interface RepositoryConfig {
  readonly repositoryType: RepositoryType;
  readonly branch: string;
  readonly name: string;
  readonly description?: string;
}

export enum PipelinePhases {
  INITIALIZE = 'initialize',
  PRE_BUILD = 'preBuild',
  BUILD = 'runBuild',
  TESTING = 'testing',
  PRE_DEPLOY = 'preDeploy',
  POST_DEPLOY = 'postDeploy',
}

export const INTEGRATION_PHASES = [
  PipelinePhases.INITIALIZE,
  PipelinePhases.PRE_BUILD,
  PipelinePhases.BUILD,
  PipelinePhases.TESTING,
];

export interface IPhaseCommand {
  readonly command: string;
}
