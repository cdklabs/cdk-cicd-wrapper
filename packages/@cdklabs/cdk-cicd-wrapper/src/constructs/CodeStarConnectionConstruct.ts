// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as pipelines from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import { RepositoryConfig } from '../common';

/**
 * Configuration properties for the CodeStarConnectionConstruct.
 * @extends RepositoryConfig
 */
export interface CodeStarConfig extends RepositoryConfig {
  /**
   * The Amazon Resource Name (ARN) of the CodeStar connection.
   */
  readonly codeStarConnectionArn: string;
}

/**
 * Constructs an AWS CodeStar connection for use in a CodePipeline.
 */
export class CodeStarConnectionConstruct extends Construct {
  /**
   * The input source for the CodePipeline.
   */
  readonly pipelineInput: pipelines.IFileSetProducer;

  /**
   * The Amazon Resource Name (ARN) of the CodeStar connection.
   */
  readonly codeStarConnectionArn: string;

  /**
   * Constructs a new instance of the CodeStarConnectionConstruct class.
   *
   * @param scope - The scope in which to define this construct.
   * @param id - The unique identifier for this construct.
   * @param props - The configuration properties for the construct.
   */
  constructor(scope: Construct, id: string, props: CodeStarConfig) {
    super(scope, id);

    /**
     * The pipelineInput is initialized with a CodePipelineSource.connection instance,
     * which sets up a connection to the specified Git repository using the given
     * connection ARN, repository name, and branch.
     */
    this.pipelineInput = pipelines.CodePipelineSource.connection(props.name, props.branch, {
      connectionArn: props.codeStarConnectionArn,
      codeBuildCloneOutput: props.codeBuildCloneOutput,
    });

    /**
     * The codeStarConnectionArn property is assigned the value from the props object.
     */
    this.codeStarConnectionArn = props.codeStarConnectionArn;
  }
}
