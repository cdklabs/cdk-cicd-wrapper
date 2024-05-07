// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

/**
 * Properties for the SSMParameterStack.
 */
export interface SSMParameterStackProps extends cdk.StackProps {
  /**
   * The qualifier to use for the application.
   */
  readonly applicationQualifier: string;

  /**
   * An optional object containing key-value pairs representing the parameters to create in the SSM Parameter Store.
   * @default - No parameters are created.
   */
  readonly parameter?: {
    [key: string]: string;
  };
}

/**
 * A stack for creating and managing AWS Systems Manager (SSM) Parameters.
 */
export class SSMParameterStack extends cdk.Stack {
  readonly applicationQualifier: string;

  constructor(scope: Construct, id: string, props: SSMParameterStackProps) {
    super(scope, id, props);

    this.applicationQualifier = props.applicationQualifier;

    if (props.parameter) {
      Object.entries(props.parameter).forEach(([parameterName, parameterValue]) => {
        this.createParameterInSSMParameterStack(parameterName, parameterValue);
      });
    }
  }

  /**
   * Creates a new String Parameter in the SSM Parameter Store within this stack.
   *
   * @param parameterName - The name of the parameter.
   * @param parameterValue - The value of the parameter.
   * @returns The created SSM String Parameter resource.
   */
  createParameterInSSMParameterStack(parameterName: string, parameterValue: string): ssm.StringParameter {
    return new ssm.StringParameter(this, `${parameterName}Parameter`, {
      parameterName: `/${this.applicationQualifier}/${parameterName}`,
      stringValue: parameterValue,
    });
  }

  /**
   * Creates a new String Parameter in the SSM Parameter Store within the provided scope.
   *
   * @param scope - The scope in which to create the parameter.
   * @param parameterName - The name of the parameter.
   * @param parameterValue - The value of the parameter.
   * @returns The created SSM String Parameter resource.
   */
  createParameter(scope: Construct, parameterName: string, parameterValue: string): ssm.StringParameter {
    return new ssm.StringParameter(scope, `${parameterName}Parameter`, {
      parameterName: `/${this.applicationQualifier}/${parameterName}`,
      stringValue: parameterValue,
    });
  }

  /**
   * Provides an IAM Policy Statement that grants permissions to retrieve parameters from the SSM Parameter Store.
   *
   * @returns The IAM Policy Statement granting access to the SSM Parameters.
   */
  provideParameterPolicyStatement(): iam.PolicyStatement {
    const parameterArn: string = cdk.Arn.format({
      partition: 'aws',
      service: 'ssm',
      region: this.region,
      account: this.account,
      resource: 'parameter',
      resourceName: `${this.applicationQualifier}/*`,
    });
    return new iam.PolicyStatement({
      actions: ['ssm:GetParameter', 'ssm:GetParameters', 'ssm:GetParametersByPath'],
      resources: [parameterArn],
    });
  }
}
