/* eslint-disable prettier/prettier */
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';
import { S3RepositoryConstruct, S3RepositoryConstructProps } from '../../src/constructs/S3RepositoryConstruct';


test('S3RepositoryConstruct with optional properties', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'TestStack');

  const encryptionKey = new kms.Key(stack, 'EncryptionKey');

  const props: S3RepositoryConstructProps = {
    bucketName: 'test-bucket',
    encryptionKey: encryptionKey,
    branch: 'develop',
    prefix: 'test-prefix',
    removalPolicy: cdk.RemovalPolicy.RETAIN,
    roles: ['arn:aws:iam::123456789012:role/test-role'],
    autoDeleteObjects: false,
  };

  const s3Repository = new S3RepositoryConstruct(stack, 'TestS3RepositoryConstruct', props);

  s3Repository.bucket.onCloudTrailWriteObject('TestCloudTrailEvent', {
    target: new eventsTargets.CloudWatchLogGroup(new logs.LogGroup(stack, 'TestLogGroup')),
  });

  const template = Template.fromStack(stack);

  expect(template.resourceCountIs('AWS::S3::Bucket', 1));
  expect(template.hasResourceProperties('AWS::S3::Bucket', {
    BucketName: 'test-bucket',
  }));
  expect(template.hasResourceProperties('AWS::Events::Rule', {
    EventPattern: {
      source: ['aws.s3'],
      'detail-type': [
        "Object Created",
        "Object Restore Completed"
      ],
      detail: {
        bucket: {
          name: [{
            Ref: 'TestS3RepositoryConstructGitRepoBucketB703A0DB'
          }]
        },
        object: {
          key: ['test-prefix/refs/heads/develop/repo.zip']
        }
      },
    },
  }));
});
