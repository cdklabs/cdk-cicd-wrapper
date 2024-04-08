// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import { CodeStarConnectionConstruct, CodeStarConfig } from '../constructs/CodeStarConnectionConstruct';
import { IRepositoryStack } from '../resource-providers';

export interface CodeStarConnectRepositoryStackProps extends cdk.StackProps, CodeStarConfig {
  readonly applicationName: string;
  readonly applicationQualifier: string;
}

export class CodeStarConnectRepositoryStack extends cdk.Stack implements IRepositoryStack {
  readonly pipelineInput: pipelines.IFileSetProducer;
  readonly pipelineEnvVars: { [key in string]: string };
  readonly repositoryBranch: string;

  constructor(scope: Construct, id: string, props: CodeStarConnectRepositoryStackProps) {
    super(scope, id, props);
    const codeStarConnectionConstruct = new CodeStarConnectionConstruct(
      this,
      'CodeStar',
      props,
    );
    this.pipelineInput = codeStarConnectionConstruct.pipelineInput;
    this.repositoryBranch = props.branch;
    this.pipelineEnvVars = {
      CODESTAR_CONNECTION_ARN: codeStarConnectionConstruct.codeStarConnectionArn,
    };
  }

}
