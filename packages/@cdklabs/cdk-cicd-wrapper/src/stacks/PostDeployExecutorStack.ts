// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { ResourceContext } from '../common';
/**
 * Properties for the PostDeployExecutorStack.
 */
export interface PostDeployExecutorStackProps extends cdk.StackProps {
  /**
   * The prefix to use for resource names.
   */
  readonly prefix?: string;
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
  readonly name: string;

  /**
   * A list of named policies to inline into this role. These policies will be
   * created with the role, whereas those added by ``addToPolicy`` are added
   * using a separate CloudFormation resource (allowing a way around circular
   * dependencies that could otherwise be introduced).
   *
   * @default - No policy is inlined in the Role resource.
   */
  readonly inlinePolicies?: {
    [name: string]: iam.PolicyDocument;
  };
}

/**
 * Stack for creating an IAM role used for Post Deploy command executions.
 */
export class PostDeployExecutorStack extends cdk.Stack {
  public static POST_DEPLOY_ROLE_ARN = 'postDeployRoleArn';

  /**
   * The prefix to use for resource names.
   */
  readonly prefix: string;
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
  readonly name: string;

  /**
   * The name of the created IAM role.
   */
  readonly roleName: string;

  /**
   * The ARN of the created IAM role.
   */
  readonly roleArn: string;

  /**
   * The IAM role used for Post Deploy command executions.
   */
  readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: PostDeployExecutorStackProps) {
    super(scope, id, props);

    this.prefix = props.prefix ?? 'post-deploy';
    this.resAccount = props.resAccount;
    this.stageName = props.stageName;
    this.name = props.name;

    this.roleName = this.generate();

    this.role = new iam.Role(this, 'Role', {
      roleName: this.roleName,
      assumedBy: new iam.AccountPrincipal(props.resAccount),
      inlinePolicies: props.inlinePolicies,
    });

    this.roleArn = cdk.Arn.format({
      partition: 'aws',
      service: 'iam',
      account: this.account,
      region: '',
      resource: 'role',
      resourceName: this.roleName,
    });

    new cdk.CfnOutput(this, 'RoleArnCfnOutput', {
      value: this.roleArn,
    });

    ResourceContext.instance().add(PostDeployExecutorStack.POST_DEPLOY_ROLE_ARN, this.roleArn);

    NagSuppressions.addResourceSuppressions(
      this.role,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'This is default IAM role for lambda function. Suppress this warning.',
        },
      ],
      true,
    );
  }

  /**
   * Generates the name for the IAM role based on the provided parameters.
   *
   * @returns The generated role name.
   */
  private generate(): string {
    return `${this.prefix}-${this.account}-${this.region}-${this.name}-${this.stageName}`;
  }
}
