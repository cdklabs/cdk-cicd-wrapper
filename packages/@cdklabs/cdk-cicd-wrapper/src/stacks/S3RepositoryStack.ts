/* eslint-disable prettier/prettier */
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as pipelines from 'aws-cdk-lib/pipelines';
import * as nag from 'cdk-nag';
import { Construct } from 'constructs';
import { S3RepositoryConstruct } from '../constructs/S3RepositoryConstruct';
import { IRepositoryStack } from '../resource-providers/RepositoryProvider';

/**
 * Properties for the S3RepositoryStack.
 */
export interface S3RepositoryStackProps extends cdk.StackProps {
  readonly bucketName: string;
  readonly prefix?: string;
  readonly branch: string;
  readonly roles?: string[];
  readonly encryptionKey: kms.IKey;
  /**
   * The removal policy for the S3 bucket.
   */
  readonly removalPolicy?: cdk.RemovalPolicy;
}

/**
 * A stack containing an S3 bucket configured for an S3-based Git repository.
 */
export class S3RepositoryStack extends cdk.Stack implements IRepositoryStack {
  readonly pipelineInput: pipelines.IFileSetProducer;
  readonly pipelineEnvVars: { [key: string]: string } = {};
  readonly repositoryBranch: string;

  constructor(scope: Construct, id: string, props: S3RepositoryStackProps) {
    super(scope, id, props);

    this.repositoryBranch = props.branch;

    const s3Repository = new S3RepositoryConstruct(this, 'S3Repository', {
      bucketName: props.bucketName,
      prefix: props.prefix,
      branch: props.branch,
      roles: props.roles,
      encryptionKey: props.encryptionKey,
      removalPolicy: props.removalPolicy,
      autoDeleteObjects: props.removalPolicy === cdk.RemovalPolicy.DESTROY,
    });

    this.pipelineInput = s3Repository.pipelineInput;

    nag.NagSuppressions.addResourceSuppressionsByPath(this, `/${this.stackName}/BucketNotificationsHandler050a0587b7544547bf325f094a3db834/Role`, [{
      id: 'AwsSolutions-IAM4',
      reason: 'The AWS Lambda Basic managed policy is used by the Bucket Notification Handler to write to the bucket.',
    }, {
      id: 'AwsSolutions-IAM5',
      reason: 'The Bucket Notification Handler has to be able to read the bucket.',
    }], true);
  }

}
