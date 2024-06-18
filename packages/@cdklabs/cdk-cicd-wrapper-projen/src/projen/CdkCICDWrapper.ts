// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// eslint-disables-next-line
import * as projen from 'projen';
import { CDKCommands } from './CDKCommands';
import { CICommands, SecurityScanOptions } from './CICommands';
import { DevBox } from './DevBoxFile';
import { DotEnvFile } from './DotEnvFile';
import { TaskFile } from './TaskFile';

/**
 * Represents the type of repository for the project.
 */
export type REPOSITORY_TYPE = 'GITHUB' | 'CODECOMMIT';

/**
 * Options for configuring the CdkCICDWrapper component.
 */
export interface CdkCICDWrapperOptions {
  /**
   * CDK Qualifier used to bootstrap your project.
   */
  cdkQualifier: string;

  /**
   * The name of the repository.
   * @default project name
   */
  repositoryName?: string;

  /**
   * The type of repository.
   * @default 'CODECOMMIT'
   */
  repositoryType?: REPOSITORY_TYPE;

  cicdVpcType?: 'NO_VPC' | 'VPC' | 'VPC_FROM_LOOK_UP';

  cicdVpcId?: string;

  cicdVpcCidr?: string;

  cicdVpcCidrMask?: string;

  cicdVpcMaxAZs?: number;

  securityScan?: boolean;

  securityScanOptions?: SecurityScanOptions;

  stages?: string[];

  workbenchStage?: string;

  taskfile?: boolean;

  devbox?: boolean;
}

/**
 * A component that wraps the CDK CI/CD pipeline for a project.
 */
export class CdkCICDWrapper extends projen.Component {
  /**
   * The CDK Qualifier used to bootstrap the project.
   */
  readonly cdkQualifier: string;

  /**
   * The name of the repository.
   */
  readonly repositoryName: string;

  /**
   * The type of repository.
   */
  readonly repositoryType: REPOSITORY_TYPE;

  readonly stages: string[];

  readonly workbenchStage: string;

  constructor(project: projen.awscdk.AwsCdkTypeScriptApp, options: CdkCICDWrapperOptions) {
    super(project);

    this.cdkQualifier = options.cdkQualifier;
    this.repositoryName = options.repositoryName ?? project.name;
    this.repositoryType = options.repositoryType ?? 'CODECOMMIT';
    this.stages = options.stages ?? ['DEV', 'INT'];
    this.workbenchStage = options.workbenchStage ?? 'DEV';

    if (!this.stages.find((stage) => stage === this.workbenchStage)) {
      new Error(`The workbenchStage ${this.workbenchStage} is missing form the list of stages ${this.stages}.`);
    }

    project.addDeps(
      '@cdklabs/cdk-cicd-wrapper',
      '@cdklabs/cdk-cicd-wrapper-cli',
      '@cdklabs/cdk-cicd-wrapper-projen',
      'cdk-nag',
    );

    project.cdkConfig.json.patch(projen.JsonPatch.add('/toolkitStackName', `CdkToolkit-${this.cdkQualifier}`));
    project.cdkConfig.json.patch(
      projen.JsonPatch.add('/context', {
        '@aws-cdk/core:bootstrapQualifier': this.cdkQualifier,
      }),
    );

    project.package.addField('config', {
      cdkQualifier: this.cdkQualifier,
      repositoryName: this.repositoryName,
      repositoryType: this.repositoryType,
      cicdVpcType: options.cicdVpcType || 'NO_VPC',
      ...(options.cicdVpcId ? { cicdVpcId: options.cicdVpcId } : {}),
      ...(options.cicdVpcCidr ? { cicdVpcCidr: options.cicdVpcCidr } : {}),
      ...(options.cicdVpcCidrMask ? { cicdVpcCidrMask: options.cicdVpcCidrMask } : {}),
      ...(options.cicdVpcMaxAZs ? { cicdVpcMaxAZs: options.cicdVpcMaxAZs } : {}),
    });

    new CICommands(project, {
      securityScan: options.securityScan || true,
      securityScanOptions: options.securityScanOptions,
    });

    new DotEnvFile(project, {
      stages: this.stages,
      workbenchStage: this.workbenchStage,
    });

    if (options.taskfile) {
      new TaskFile(project);
    }

    if (options.devbox) {
      new DevBox(project);
    }

    new CDKCommands(project, {
      dotenv: !options.taskfile,
      stages: this.stages,
      workbenchStage: this.workbenchStage,
      workbench: true,
      cdkQualifier: this.cdkQualifier,
    });
  }
}
