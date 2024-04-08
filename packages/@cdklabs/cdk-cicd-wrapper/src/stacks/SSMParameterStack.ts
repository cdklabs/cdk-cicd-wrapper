// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface SSMParameterStackProps extends cdk.StackProps {
  readonly applicationQualifier: string;
  readonly parameter?: {
    [key in string]: string;
  };
}

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

  createParameterInSSMParameterStack(parameterName: string, parameterValue: string) {
    return new ssm.StringParameter(this, `${parameterName}Parameter`, {
      parameterName: `/${this.applicationQualifier}/${parameterName}`,
      stringValue: parameterValue,
    });
  }

  createParameter(scope: Construct, parameterName: string, parameterValue: string) {
    return new ssm.StringParameter(scope, `${parameterName}Parameter`, {
      parameterName: `/${this.applicationQualifier}/${parameterName}`,
      stringValue: parameterValue,
    });
  }

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
