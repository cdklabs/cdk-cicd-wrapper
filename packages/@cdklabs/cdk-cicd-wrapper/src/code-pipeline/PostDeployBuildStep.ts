// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as iam from 'aws-cdk-lib/aws-iam';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { CDKPipeline } from './CDKPipeline';

/**
 * A class that represents a post-deployment build step in a CDK pipeline.
 * This step is responsible for running commands after a successful deployment.
 */
export class PostDeployBuildStep extends pipelines.CodeBuildStep {
  /**
   * Constructs a new instance of the PostDeployBuildStep class.
   *
   * @param stage The stage of the pipeline in which this step is executed.
   * @param props The properties for the CodeBuild step.
   * @param applicationName The name of the application.
   * @param logRetentionInDays The number of days to retain logs.
   * @param logRetentionRoleArn The ARN of the role used for log retention.
   */
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
        /**
         * The stage of the pipeline in which this step is executed.
         */
        STAGE: stage,
        /**
         * The name of the application.
         */
        CDK_APP_NAME: applicationName,
        /**
         * The number of days to retain logs.
         */
        LOG_RETENTION_DAYS: logRetentionInDays,
        /**
         * The ARN of the role used for log retention.
         */
        LOG_RETENTIONS_ROLE: logRetentionRoleArn,
      },
      /**
       * The list of commands to run in the CodeBuild step. It includes commands to install dependencies and any additional commands specified in the `props.commands` parameter.
       */
      commands: [...CDKPipeline.installCommands, ...props.commands],
      /**
       * The IAM policy statements to be added to the CodeBuild project role.
       * In this case, it allows the CodeBuild project to assume the log retention role.
       */
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
