// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// A meaningful-complexity payload stack used to PROVE the security plugins fire on a plain
// `cdk deploy` (issue #241). It is ordinary CDK -- no wrapper import here. The wrapper's Aspects are
// applied in bin/app.ts via CdkCicd.attach, exactly as a user's own bin/ would on a plain deploy.
//
// The resource mix is chosen so each default-on plugin has something to act on:
//   - SNS Topic            -> EncryptSNSTopicOnTransit adds the NoHTTPSubscriptions / HTTPS-only policy
//   - S3 Bucket            -> EncryptBucketOnTransit adds the aws:SecureTransport deny policy
//   - Lambda + LogGroup    -> LogRetention forces a retention on the function's log group
//   - DynamoDB + API GW    -> real application surface (and cdk-nag has resources to evaluate)

import * as cdk from 'aws-cdk-lib';
import { CfnOutput, Duration } from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

export class OrderApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, 'Orders', {
      partitionKey: { name: 'orderId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // The SNS topic the EncryptSNSTopicOnTransit plugin hardens with the HTTPS-only policy.
    const events = new sns.Topic(this, 'OrderEvents');

    // The S3 bucket the EncryptBucketOnTransit plugin hardens with the aws:SecureTransport deny.
    const receipts = new s3.Bucket(this, 'Receipts', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const handler = new lambda.Function(this, 'CreateOrder', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: Duration.seconds(10),
      environment: {
        TABLE_NAME: table.tableName,
        TOPIC_ARN: events.topicArn,
        BUCKET_NAME: receipts.bucketName,
      },
      code: lambda.Code.fromInline(
        [
          'exports.handler = async (event) => {',
          '  const orderId = String(Date.now());',
          '  return { statusCode: 201, body: JSON.stringify({ orderId }) };',
          '};',
        ].join('\n'),
      ),
    });

    table.grantReadWriteData(handler);
    events.grantPublish(handler);
    receipts.grantPut(handler);

    const api = new apigw.RestApi(this, 'OrderApi', {
      deployOptions: { stageName: 'v1' },
    });
    api.root.addResource('orders').addMethod('POST', new apigw.LambdaIntegration(handler));

    new CfnOutput(this, 'ApiUrl', { value: api.url });
    new CfnOutput(this, 'TopicArn', { value: events.topicArn });
  }
}
