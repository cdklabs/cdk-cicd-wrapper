// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { Stage } from '../common';

/**
 * Properties for the LogRetentionRoleStack.
 */
export interface LogRetentionRoleStackProps extends cdk.StackProps {
  /**
   * The AWS account ID where the resources will be deployed.
   */
  readonly resAccount: string;

  /**
   * The name of the deployment stage (e.g., 'prod', 'test').
   */
  readonly stageName: string;

  /**
   * The name of the application.
   */
  readonly applicationName: string;

  /**
   * The KMS encryption key to use for encrypting resources.
   */
  readonly encryptionKey: kms.IKey;
}

/**
 * Stack for creating an IAM role used for log retention.
 */
export class LogRetentionRoleStack extends cdk.Stack {
  /**
   * Generates the name for the IAM role based on the provided parameters.
   *
   * @param account The AWS account ID.
   * @param region The AWS region.
   * @param stageName The deployment stage name.
   * @param applicationName The application name.
   * @returns The generated role name.
   */
  static getRoleName(account: string, region: string, stageName: Stage, applicationName: string): string {
    return `log-retention-${account}-${region}-${applicationName}-${stageName}`;
  }

  /**
   * Generates the ARN for the IAM role based on the provided parameters.
   *
   * @param account The AWS account ID.
   * @param region The AWS region.
   * @param stageName The deployment stage name.
   * @param applicationName The application name.
   * @returns The generated role ARN.
   */
  static getRoleArn(account: string, region: string, stageName: Stage, applicationName: string): string {
    return cdk.Arn.format({
      partition: 'aws',
      service: 'iam',
      account,
      region: '',
      resource: 'role',
      resourceName: LogRetentionRoleStack.getRoleName(account, region, stageName, applicationName),
    });
  }
  /**
   * The ARN of the created IAM role.
   */
  readonly roleArn: string;

  constructor(scope: Construct, id: string, props: LogRetentionRoleStackProps) {
    super(scope, id, props);

    const role = new iam.Role(this, 'Role', {
      roleName: LogRetentionRoleStack.getRoleName(this.account, this.region, props.stageName, props.applicationName),
      assumedBy: new iam.AccountPrincipal(props.resAccount),
      inlinePolicies: {
        logRetentionOperation: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'logs:PutRetentionPolicy',
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
                'logs:GetLogEvents',
                'logs:AssociateKmsKey',
                'logs:Describe*',
                'cloudformation:Get*',
                'cloudformation:Describe*',
                'cloudformation:List*',
              ],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt', 'kms:GenerateDataKey', 'kms:DescribeKey'],
              resources: [props.encryptionKey.keyArn],
            }),
          ],
        }),
      },
    });

    this.roleArn = role.roleArn;

    new cdk.CfnOutput(this, 'RoleArnCfnOutput', {
      value: this.roleArn,
    });

    NagSuppressions.addResourceSuppressions(
      role,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'This is default IAM role for lambda function. Suppress this warning.',
        },
      ],
      true,
    );
  }
}
