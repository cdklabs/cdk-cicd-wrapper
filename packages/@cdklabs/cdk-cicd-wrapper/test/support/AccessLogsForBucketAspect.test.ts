// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { App, Aspects, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { AccessLogsForBucketAspect } from '../../src/support/AccessLogsForBucketAspect';

function stack(region = 'us-west-2', account = '111111111111'): Stack {
  return new Stack(new App(), 'BucketStack', { env: { account, region } });
}

function aspect(destinationBucket?: s3.IBucket): AccessLogsForBucketAspect {
  return new AccessLogsForBucketAspect({
    complianceLogBucketName: 'compliance-bucket',
    complianceLogBucketAccount: '111111111111',
    complianceLogBucketRegion: 'us-west-2',
    complianceLogBucket: destinationBucket,
  });
}

describe('m9-migrate-security-plugins: AccessLogsForBucketAspect', () => {
  test('configures logging to the compliance bucket on a bucket with none set', () => {
    const s = stack();
    Aspects.of(s).add(aspect());
    new s3.Bucket(s, 'Bucket');

    Template.fromStack(s).hasResourceProperties('AWS::S3::Bucket', {
      LoggingConfiguration: {
        DestinationBucketName: 'compliance-bucket',
      },
    });
  });

  test('fails closed for a source bucket in a different region', () => {
    const s = stack('us-west-1');
    Aspects.of(s).add(aspect());
    new s3.Bucket(s, 'Bucket');

    expect(() => Template.fromStack(s)).toThrow(/same account and region/);
  });

  test('fails closed for a source bucket in a different account', () => {
    const s = stack('us-west-2', '222222222222');
    Aspects.of(s).add(aspect());
    new s3.Bucket(s, 'Bucket');

    expect(() => Template.fromStack(s)).toThrow(/same account and region/);
  });

  test('never configures the compliance destination bucket to log to itself', () => {
    const s = stack();
    Aspects.of(s).add(aspect());
    new s3.Bucket(s, 'Compliance', { bucketName: 'compliance-bucket' });

    const bucket = Object.values(Template.fromStack(s).findResources('AWS::S3::Bucket'))[0];
    expect(bucket.Properties.LoggingConfiguration).toBeUndefined();
  });

  test('preserves an already-set log file prefix but still redirects the destination bucket', () => {
    const s = stack();
    Aspects.of(s).add(aspect());
    const bucket = new s3.CfnBucket(s, 'Bucket', {
      loggingConfiguration: { destinationBucketName: 'some-other-bucket', logFilePrefix: 'my-prefix/' },
    });

    Template.fromStack(s).hasResourceProperties('AWS::S3::Bucket', {
      LoggingConfiguration: {
        DestinationBucketName: 'compliance-bucket',
        LogFilePrefix: 'my-prefix/',
      },
    });
    expect(bucket).toBeDefined();
  });

  test('redirects an existing logging destination without a prefix to the compliance bucket', () => {
    const s = stack();
    Aspects.of(s).add(aspect());
    new s3.CfnBucket(s, 'Bucket', {
      loggingConfiguration: { destinationBucketName: 'some-other-bucket' },
    });

    const bucket = Object.values(Template.fromStack(s).findResources('AWS::S3::Bucket'))[0];
    expect(bucket.Properties.LoggingConfiguration).toEqual({
      DestinationBucketName: 'compliance-bucket',
      LogFilePrefix: expect.any(String),
    });
  });

  test('ignores non-bucket constructs', () => {
    const s = stack();
    expect(() => Aspects.of(s).add(aspect())).not.toThrow();
    Template.fromStack(s).resourceCountIs('AWS::S3::Bucket', 0);
  });

  test('adds same-stack dependencies on the concrete destination bucket and policy', () => {
    const s = stack();
    const destination = new s3.Bucket(s, 'Compliance', { bucketName: 'compliance-bucket' });
    destination.addToResourcePolicy(
      new PolicyStatement({
        actions: ['s3:PutObject'],
        resources: [destination.arnForObjects('*')],
        principals: [new ServicePrincipal('logging.s3.amazonaws.com')],
      }),
    );
    Aspects.of(s).add(aspect(destination));
    new s3.CfnBucket(s, 'Source', {
      loggingConfiguration: { destinationBucketName: 'some-other-bucket' },
    });

    const resources = Template.fromStack(s).findResources('AWS::S3::Bucket');
    const source = Object.entries(resources).find(([, resource]) => resource.Properties.BucketName === undefined);
    const compliance = Object.entries(resources).find(
      ([, resource]) => resource.Properties.BucketName === 'compliance-bucket',
    );
    expect(source?.[1].DependsOn).toEqual(
      expect.arrayContaining([expect.stringMatching(/Compliance/), expect.stringMatching(/Policy/)]),
    );
    expect(source?.[1].Properties.LoggingConfiguration.DestinationBucketName).toBe('compliance-bucket');
    expect(compliance?.[1].DependsOn).toBeUndefined();
  });

  test('configures a CfnBucket built from a second independently loaded aws-cdk-lib copy', () => {
    let otherBucket!: s3.CfnBucket;
    let otherTemplate!: Template;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const otherCdk = require('aws-cdk-lib');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const otherS3 = require('aws-cdk-lib/aws-s3');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const otherAssertions = require('aws-cdk-lib/assertions');
      const otherStack = new otherCdk.Stack(new otherCdk.App(), 'OtherCopyStack', {
        env: { account: '111111111111', region: 'us-west-2' },
      });
      otherBucket = new otherS3.CfnBucket(otherStack, 'Bucket');
      aspect().visit(otherBucket);
      otherTemplate = otherAssertions.Template.fromStack(otherStack);
    });

    expect(otherBucket instanceof s3.CfnBucket).toBe(false);
    otherTemplate.hasResourceProperties('AWS::S3::Bucket', {
      LoggingConfiguration: {
        DestinationBucketName: 'compliance-bucket',
      },
    });
  });
});
