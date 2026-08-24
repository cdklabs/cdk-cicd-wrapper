// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { App, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { SupportResources } from '../../src/support/SupportResources';

function stack(): Stack {
  return new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
}

describe('m4-support-resources: SupportResources', () => {
  test('provisions NOTHING when no resource is referenced', () => {
    const s = stack();
    new SupportResources(s, 'Support');

    const t = Template.fromStack(s);
    // The whole point of the lazy shape: an unreferenced support construct is free.
    t.resourceCountIs('AWS::KMS::Key', 0);
    t.resourceCountIs('AWS::S3::Bucket', 0);
  });

  test('reading artifactBucket provisions the bucket and the key it is encrypted with', () => {
    const s = stack();
    const support = new SupportResources(s, 'Support');
    expect(support.artifactBucket).toBeDefined();

    const t = Template.fromStack(s);
    t.resourceCountIs('AWS::S3::Bucket', 1);
    t.resourceCountIs('AWS::KMS::Key', 1);
    t.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          Match.objectLike({
            ServerSideEncryptionByDefault: Match.objectLike({
              SSEAlgorithm: 'aws:kms',
              // The CMK, not the account's aws/s3 managed key -- pins BucketEncryption.KMS over
              // KMS_MANAGED, which would otherwise satisfy the algorithm alone.
              KMSMasterKeyID: { 'Fn::GetAtt': [Match.stringLikeRegexp('SupportEncryptionKey'), 'Arn'] },
            }),
          }),
        ],
      },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test('the encryption key rotates', () => {
    const s = stack();
    expect(new SupportResources(s, 'Support').encryptionKey).toBeDefined();
    Template.fromStack(s).hasResourceProperties('AWS::KMS::Key', { EnableKeyRotation: true });
  });

  test('repeated reads return the same resource rather than a second one', () => {
    const s = stack();
    const support = new SupportResources(s, 'Support');
    expect(support.artifactBucket).toBe(support.artifactBucket);
    expect(support.encryptionKey).toBe(support.encryptionKey);
    Template.fromStack(s).resourceCountIs('AWS::S3::Bucket', 1);
  });

  test('the default removal policy RETAINs the bucket and the key', () => {
    const s = stack();
    expect(new SupportResources(s, 'Support').artifactBucket).toBeDefined();

    const t = Template.fromStack(s);
    t.hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Retain' });
    t.hasResource('AWS::KMS::Key', { DeletionPolicy: 'Retain' });
    // No auto-delete custom resource when the bucket is retained.
    t.resourceCountIs('Custom::S3AutoDeleteObjects', 0);
  });

  test('DESTROY makes the bucket disposable, emptying it so a stack delete can complete', () => {
    const s = stack();
    expect(new SupportResources(s, 'Support', { removalPolicy: RemovalPolicy.DESTROY }).artifactBucket).toBeDefined();

    const t = Template.fromStack(s);
    t.hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Delete' });
    t.hasResource('AWS::KMS::Key', { DeletionPolicy: 'Delete' });
    t.resourceCountIs('Custom::S3AutoDeleteObjects', 1);
  });
});
