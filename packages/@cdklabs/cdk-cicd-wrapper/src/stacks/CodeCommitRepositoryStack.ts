// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import {
  CodeCommitRepositoryConstruct,
  CodeCommitRepositoryConstructProps,
} from '../constructs/CodeCommitRepositoryConstruct';
import { IRepositoryStack } from '../resource-providers';

/**
 * Properties for the CodeCommit Repository Stack.
 */
interface RepositoryProps extends cdk.StackProps, CodeCommitRepositoryConstructProps {
  /**
   * The name of the application.
   */
  applicationName: string;

  /**
   * The qualifier for the application.
   */
  applicationQualifier: string;
}

/**
 * Stack for creating a CodeCommit repository for an application.
 */
export class CodeCommitRepositoryStack extends cdk.Stack implements IRepositoryStack {
  /**
   * The input for the pipeline.
   */
  readonly pipelineInput: pipelines.IFileSetProducer;

  /**
   * The environment variables for the pipeline.
   */
  readonly pipelineEnvVars: { [key: string]: string };

  /**
   * The branch of the repository.
   */
  readonly repositoryBranch: string;

  constructor(scope: Construct, id: string, props: RepositoryProps) {
    super(scope, id, props);

    /**
     * Create a CodeCommit repository construct with the provided properties.
     */
    this.pipelineInput = new CodeCommitRepositoryConstruct(this, 'CodeCommit', props).pipelineInput;
    this.repositoryBranch = props.branch;
    this.pipelineEnvVars = {};
  }
}
