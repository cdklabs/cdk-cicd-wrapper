// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { aws_kms, IAspect, Names, RemovalPolicy } from 'aws-cdk-lib';
import { CfnSubnet } from 'aws-cdk-lib/aws-ec2';
import { AnyPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { CfnKey, Key } from 'aws-cdk-lib/aws-kms';
import { CfnLogGroup } from 'aws-cdk-lib/aws-logs';
import { Bucket, CfnBucket } from 'aws-cdk-lib/aws-s3';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { IConstruct } from 'constructs';
import { Stage } from '../common';

export class SecurityControls implements IAspect {
  private encryptionKey: aws_kms.Key;
  private readonly stage: string;
  private readonly logRetentionInDays: string;
  private readonly complianceLogBucketName: string;

  constructor(kmsKey: aws_kms.Key, stage: string, logRetentionInDays: string, complianceLogBucketName: string) {
    this.encryptionKey = kmsKey;
    this.stage = stage;
    this.logRetentionInDays = logRetentionInDays;
    this.complianceLogBucketName = complianceLogBucketName;
  }

  public visit(node: IConstruct): void {
    if (node instanceof CfnLogGroup) {
      if (node.retentionInDays === undefined) {
        node.retentionInDays = Number(this.logRetentionInDays);
        node.kmsKeyId = this.encryptionKey.keyArn;
      }
    } else if (node instanceof CfnBucket) {
      node.loggingConfiguration = {
        destinationBucketName: this.complianceLogBucketName,
        logFilePrefix: Names.uniqueId(node),
      };
    } else if (node instanceof Key) {
      if (this.stage !== Stage.PROD) {
        node.applyRemovalPolicy(RemovalPolicy.DESTROY);
      }
    } else if (node instanceof CfnKey) {
      node.enableKeyRotation = true;
    } else if (node instanceof CfnSubnet) {
      node.mapPublicIpOnLaunch = false;
    } else if (node instanceof Bucket) {
      node.addToResourcePolicy(
        new PolicyStatement({
          sid: 'DenyHTTP',
          effect: Effect.DENY,
          principals: [new AnyPrincipal()],
          actions: ['s3:PutObject'],
          resources: [`${node.bucketArn}/*`],
          conditions: {
            Bool: {
              'aws:SecureTransport': 'false',
            },
          },
        }),
      );
    } else if (node instanceof Topic) {
      // Apply Topic policy to enforce encryption of data in transit
      node.addToResourcePolicy(
        new PolicyStatement({
          sid: 'NoHTTPSubscriptions',
          resources: [`${node.topicArn}`],
          principals: [new AnyPrincipal()],
          effect: Effect.DENY,
          actions: [
            'SNS:Subscribe',
            'SNS:Receive',
          ],
          conditions: {
            StringEquals: {
              'SNS:Protocol': 'http',
            },
          },
        }),
      );
      node.addToResourcePolicy(
        new PolicyStatement({
          sid: 'HttpsOnly',
          resources: [`${node.topicArn}`],
          actions: [
            'SNS:Publish',
            'SNS:RemovePermission',
            'SNS:SetTopicAttributes',
            'SNS:DeleteTopic',
            'SNS:ListSubscriptionsByTopic',
            'SNS:GetTopicAttributes',
            'SNS:Receive',
            'SNS:AddPermission',
            'SNS:Subscribe',
          ],
          principals: [new AnyPrincipal()],
          effect: Effect.DENY,
          conditions: {
            Bool: {
              'aws:SecureTransport': 'false',
            },
          },
        }),
      );
    }
  }
}

