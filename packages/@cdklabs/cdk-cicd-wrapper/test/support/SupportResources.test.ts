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

  describe('m9-migrate-vpc: vpcNetworking', () => {
    test('undefined when no vpc config was passed -- provisions nothing', () => {
      const s = stack();
      const support = new SupportResources(s, 'Support');
      expect(support.vpcNetworking).toBeUndefined();
      Template.fromStack(s).resourceCountIs('AWS::EC2::VPC', 0);
    });

    test('resolves a managed VPC from the vpc config on read', () => {
      const s = stack();
      const support = new SupportResources(s, 'Support', { vpc: { managedVpc: {} } });

      const networking = support.vpcNetworking;

      expect(networking?.vpc).toBeDefined();
      Template.fromStack(s).resourceCountIs('AWS::EC2::VPC', 1);
    });

    test('provisions no VPC when vpcNetworking is never read', () => {
      const s = stack();
      new SupportResources(s, 'Support', { vpc: { managedVpc: {} } });
      Template.fromStack(s).resourceCountIs('AWS::EC2::VPC', 0);
    });

    test('repeated reads return the same networking rather than resolving twice', () => {
      const s = stack();
      const support = new SupportResources(s, 'Support', { vpc: { managedVpc: {} } });
      expect(support.vpcNetworking).toBe(support.vpcNetworking);
      Template.fromStack(s).resourceCountIs('AWS::EC2::VPC', 1);
    });

    test('useProxy is threaded through to the managed VPC (isolated subnets, no NAT)', () => {
      const s = stack();
      const support = new SupportResources(s, 'Support', { vpc: { managedVpc: {} }, useProxy: true });
      expect(support.vpcNetworking).toBeDefined();
      Template.fromStack(s).resourceCountIs('AWS::EC2::NatGateway', 0);
    });
  });

  describe('m9-migrate-compliance-bucket: complianceLogBucket', () => {
    test('reading complianceLogBucket without complianceLogBucketName throws', () => {
      const s = stack();
      const support = new SupportResources(s, 'Support');
      expect(() => support.complianceLogBucket).toThrow(/complianceLogBucketName/);
    });

    test('reading complianceLogBucket provisions a bucket with the configured name', () => {
      const s = stack();
      const support = new SupportResources(s, 'Support', { complianceLogBucketName: 'my-compliance-bucket' });
      expect(support.complianceLogBucket).toBeDefined();

      const t = Template.fromStack(s);
      t.resourceCountIs('AWS::S3::Bucket', 1);
      t.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'my-compliance-bucket',
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });

    test('grants the S3 log-delivery service principal write access', () => {
      const s = stack();
      const support = new SupportResources(s, 'Support', { complianceLogBucketName: 'my-compliance-bucket' });
      expect(support.complianceLogBucket).toBeDefined();

      Template.fromStack(s).hasResourceProperties('AWS::S3::BucketPolicy', {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: 'S3ServerAccessLogsPolicy',
              Effect: 'Allow',
              Principal: { Service: 'logging.s3.amazonaws.com' },
              Action: 's3:PutObject',
            }),
          ]),
        }),
      });
    });

    test('denies non-TLS access -- the TLS half of the 0b7ae02 fix', () => {
      const s = stack();
      const support = new SupportResources(s, 'Support', { complianceLogBucketName: 'my-compliance-bucket' });
      expect(support.complianceLogBucket).toBeDefined();

      Template.fromStack(s).hasResourceProperties('AWS::S3::BucketPolicy', {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Deny',
              Principal: { AWS: '*' },
              Condition: { Bool: { 'aws:SecureTransport': 'false' } },
            }),
          ]),
        }),
      });
    });

    test(
      'denies PutObject with no encryption header at all -- the SSE correctness the 0b7ae02 fix made ' +
        '(a Bool condition on a header that is absent from the request context never matches, so it must ' +
        'use Null instead)',
      () => {
        const s = stack();
        const support = new SupportResources(s, 'Support', { complianceLogBucketName: 'my-compliance-bucket' });
        expect(support.complianceLogBucket).toBeDefined();

        Template.fromStack(s).hasResourceProperties('AWS::S3::BucketPolicy', {
          PolicyDocument: Match.objectLike({
            Statement: Match.arrayWith([
              Match.objectLike({
                Sid: 'EnforceEncryptionAtRest',
                Effect: 'Deny',
                Action: 's3:PutObject',
                Condition: { Null: { 's3:x-amz-server-side-encryption': 'true' } },
              }),
            ]),
          }),
        });
      },
    );

    test('repeated reads return the same bucket rather than a second one', () => {
      const s = stack();
      const support = new SupportResources(s, 'Support', { complianceLogBucketName: 'my-compliance-bucket' });
      expect(support.complianceLogBucket).toBe(support.complianceLogBucket);
      Template.fromStack(s).resourceCountIs('AWS::S3::Bucket', 1);
    });

    test('provisions NOTHING when complianceLogBucket is never read', () => {
      const s = stack();
      new SupportResources(s, 'Support', { complianceLogBucketName: 'my-compliance-bucket' });
      Template.fromStack(s).resourceCountIs('AWS::S3::Bucket', 0);
    });
  });
});
