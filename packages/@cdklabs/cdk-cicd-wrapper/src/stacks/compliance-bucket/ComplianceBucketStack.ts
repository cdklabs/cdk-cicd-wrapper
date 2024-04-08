// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { IComplianceBucketConfig } from '../../resource-providers';

export interface ComplianceLogBucketStackProps extends cdk.StackProps {
  readonly complianceLogBucketName: string;
}

export class ComplianceLogBucketStack extends cdk.Stack implements IComplianceBucketConfig {
  readonly bucketName: string;

  constructor(scope: Construct, id: string, props: ComplianceLogBucketStackProps) {
    super(scope, id, props);

    this.bucketName = props.complianceLogBucketName;

    const lambdaFunction = new lambda.Function(this, 'LambdaFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'make-compliance-log-bucket.handler',
      code: lambda.Code.fromAsset(path.resolve(__dirname, './lambda-functions')),
      timeout: cdk.Duration.seconds(30),
      initialPolicy: [
        new iam.PolicyStatement({
          actions: ['s3:CreateBucket', 's3:GetBucketLocation', 's3:PutBucketPolicy'],
          resources: [`arn:aws:s3:::${props.complianceLogBucketName}`],
        }),
      ],
    });

    const provider = new Provider(this, 'Provider', {
      onEventHandler: lambdaFunction,
    });

    new cdk.CustomResource(this, 'CustomResource', {
      serviceToken: provider.serviceToken,
      properties: {
        BucketName: props.complianceLogBucketName,
      },
    });

    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-L1',
        reason:
          'Suppress AwsSolutions-L1 - The framework-onEvent Lambda function for the custom resource provider is not using the latest runtime version, which is acceptable for our use case.',
      },
      {
        id: 'AwsSolutions-IAM5',
        reason:
          'Suppress AwsSolutions-IAM5 - The IAM role for the framework-onEvent Lambda function contains wildcard permissions as necessary for its operation.',
        appliesTo: [
          {
            regex: '/^Resource::(.*)/g',
          },
        ],
      },
    ]);

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      [
        `${cdk.Stack.of(this)}/LambdaFunction/ServiceRole/Resource`,
        `${cdk.Stack.of(this)}/Provider/framework-onEvent/ServiceRole/Resource`,
      ],
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Suppress AwsSolutions-IAM4 approved managed policies',
          appliesTo: [
            {
              regex: '/(.*)(AWSLambdaBasicExecutionRole)(.*)$/g',
            },
          ],
        },
      ],
      true,
    );
  }
}
