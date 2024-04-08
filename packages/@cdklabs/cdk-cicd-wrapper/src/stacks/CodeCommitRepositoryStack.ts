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

interface RepositoryProps extends cdk.StackProps, CodeCommitRepositoryConstructProps {
  applicationName: string;
  applicationQualifier: string;
}

export class CodeCommitRepositoryStack extends cdk.Stack implements IRepositoryStack {
  readonly pipelineInput: pipelines.IFileSetProducer;
  readonly pipelineEnvVars: { [key in string]: string };
  readonly repositoryBranch: string;

  constructor(scope: Construct, id: string, props: RepositoryProps) {
    super(scope, id, props);
    this.pipelineInput = new CodeCommitRepositoryConstruct(this, 'CodeCommit', props).pipelineInput;
    this.repositoryBranch = props.branch;
    this.pipelineEnvVars = {};
  }
}
