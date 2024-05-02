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

/**
 * Properties for the ComplianceLogBucketStack.
 */
export interface ComplianceLogBucketStackProps extends cdk.StackProps {
  /**
   * The name of the compliance log bucket to be created.
   */
  readonly complianceLogBucketName: string;
}

/**
 * Stack for creating a compliance log bucket.
 * Implements the IComplianceBucketConfig interface to provide the bucket name.
 */
export class ComplianceLogBucketStack extends cdk.Stack implements IComplianceBucketConfig {
  /**
   * The name of the bucket created by this stack.
   */
  readonly bucketName: string;

  /**
   * Constructs a new instance of the ComplianceLogBucketStack.
   *
   * @param scope The scope in which to define this construct.
   * @param id The unique identifier for this construct.
   * @param props The properties for the ComplianceLogBucketStack.
   */
  constructor(scope: Construct, id: string, props: ComplianceLogBucketStackProps) {
    super(scope, id, props);

    this.bucketName = props.complianceLogBucketName;

    /**
     * Lambda function to create the compliance log bucket.
     */
    const lambdaFunction = new lambda.Function(this, 'LambdaFunction', {
      runtime: lambda.Runtime.PYTHON_3_12, // Default runtime for the Lambda function
      handler: 'make-compliance-log-bucket.handler', // Default handler for the Lambda function
      code: lambda.Code.fromAsset(path.resolve(__dirname, './lambda-functions')), // Path to the Lambda function code
      timeout: cdk.Duration.seconds(30), // Default timeout for the Lambda function
      initialPolicy: [
        new iam.PolicyStatement({
          actions: ['s3:CreateBucket', 's3:GetBucketLocation', 's3:PutBucketPolicy'],
          resources: [`arn:aws:s3:::${props.complianceLogBucketName}`],
        }),
      ],
    });

    /**
     * Provider for the custom resource that creates the compliance log bucket.
     */
    const provider = new Provider(this, 'Provider', {
      onEventHandler: lambdaFunction,
    });

    /**
     * Custom resource that triggers the creation of the compliance log bucket.
     */
    new cdk.CustomResource(this, 'CustomResource', {
      serviceToken: provider.serviceToken,
      properties: {
        BucketName: props.complianceLogBucketName,
      },
    });

    /**
     * Suppress specific NagSuppressions for the stack.
     */
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

    /**
     * Suppress specific NagSuppressions for resources in the stack.
     */
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
