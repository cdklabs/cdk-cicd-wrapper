// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import { CodeStarConnectionConstruct, CodeStarConfig } from '../constructs/CodeStarConnectionConstruct';
import { IRepositoryStack } from '../resource-providers';

/**
 * Properties for the CodeStarConnectRepositoryStack.
 */
export interface CodeStarConnectRepositoryStackProps extends cdk.StackProps, CodeStarConfig {
  /**
   * The name of the application.
   */
  readonly applicationName: string;

  /**
   * The qualifier for the application.
   */
  readonly applicationQualifier: string;
}

/**
 * Stack that sets up a CodeStar connection and provides the pipeline input and environment variables.
 */
export class CodeStarConnectRepositoryStack extends cdk.Stack implements IRepositoryStack {
  /**
   * The pipeline input (file set producer) for this stack.
   */
  readonly pipelineInput: pipelines.IFileSetProducer;

  /**
   * The environment variables to be used by the pipeline.
   */
  readonly pipelineEnvVars: { [key: string]: string };

  /**
   * The branch of the repository.
   */
  readonly repositoryBranch: string;

  /**
   * Constructs a new instance of the CodeStarConnectRepositoryStack.
   * @param scope The scope in which the stack is created.
   * @param id The ID of the stack.
   * @param props The properties for the stack.
   */
  constructor(scope: Construct, id: string, props: CodeStarConnectRepositoryStackProps) {
    super(scope, id, props);

    const codeStarConnectionConstruct = new CodeStarConnectionConstruct(this, 'CodeStar', props);
    this.pipelineInput = codeStarConnectionConstruct.pipelineInput;
    this.repositoryBranch = props.branch;
    this.pipelineEnvVars = {
      CODESTAR_CONNECTION_ARN: codeStarConnectionConstruct.codeStarConnectionArn,
    };
  }
}
