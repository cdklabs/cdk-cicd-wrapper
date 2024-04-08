// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as iam from 'aws-cdk-lib/aws-iam';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { CDKPipeline } from './CDKPipeline';

export class PostDeployBuildStep extends pipelines.CodeBuildStep {
  constructor(
    stage: string,
    props: pipelines.CodeBuildStepProps,
    applicationName: string,
    logRetentionInDays: string,
    logRetentionRoleArn: string,
  ) {
    super(`PostDeploy${stage}`, {
      ...props,
      env: {
        ...props.env,
        STAGE: stage,
        CDK_APP_NAME: applicationName,
        LOG_RETENTION_DAYS: logRetentionInDays,
        LOG_RETENTIONS_ROLE: logRetentionRoleArn,
      },
      commands: [...CDKPipeline.installCommands, ...props.commands],
      rolePolicyStatements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['sts:AssumeRole'],
          resources: [logRetentionRoleArn],
        }),
      ],
    });

    this.discoverReferencedOutputs({
      env: this.env,
      rolePolicyStatements: this.rolePolicyStatements,
    });
  }
}
