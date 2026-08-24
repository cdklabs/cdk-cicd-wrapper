// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { App, Aspects, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { AccessLogsForBucketAspect } from '../../src/support/AccessLogsForBucketAspect';

function stack(region = 'us-west-2'): Stack {
  return new Stack(new App(), 'BucketStack', { env: { region } });
}

describe('m9-migrate-security-plugins: AccessLogsForBucketAspect', () => {
  test('configures logging to the compliance bucket on a bucket with none set', () => {
    const s = stack();
    Aspects.of(s).add(
      new AccessLogsForBucketAspect({ complianceLogBucketName: 'compliance-bucket', mainRegion: 'us-west-2' }),
    );
    new s3.Bucket(s, 'Bucket');

    Template.fromStack(s).hasResourceProperties('AWS::S3::Bucket', {
      LoggingConfiguration: {
        DestinationBucketName: 'compliance-bucket',
      },
    });
  });

  test('rewrites the bucket name for a stack deployed to a different region', () => {
    const s = stack('us-west-1');
    Aspects.of(s).add(
      new AccessLogsForBucketAspect({
        complianceLogBucketName: 'compliance-bucket-us-west-2',
        mainRegion: 'us-west-2',
      }),
    );
    new s3.Bucket(s, 'Bucket');

    Template.fromStack(s).hasResourceProperties('AWS::S3::Bucket', {
      LoggingConfiguration: {
        DestinationBucketName: 'compliance-bucket-us-west-1',
      },
    });
  });

  test('preserves an already-set log file prefix but still redirects the destination bucket', () => {
    const s = stack();
    Aspects.of(s).add(
      new AccessLogsForBucketAspect({ complianceLogBucketName: 'compliance-bucket', mainRegion: 'us-west-2' }),
    );
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

  test('leaves a bucket that sets a logging destination but no prefix untouched', () => {
    const s = stack();
    Aspects.of(s).add(
      new AccessLogsForBucketAspect({ complianceLogBucketName: 'compliance-bucket', mainRegion: 'us-west-2' }),
    );
    new s3.CfnBucket(s, 'Bucket', {
      loggingConfiguration: { destinationBucketName: 'some-other-bucket' },
    });

    Template.fromStack(s).hasResourceProperties('AWS::S3::Bucket', {
      LoggingConfiguration: {
        DestinationBucketName: 'some-other-bucket',
      },
    });
  });

  test('ignores non-bucket constructs', () => {
    const s = stack();
    expect(() =>
      Aspects.of(s).add(
        new AccessLogsForBucketAspect({ complianceLogBucketName: 'compliance-bucket', mainRegion: 'us-west-2' }),
      ),
    ).not.toThrow();
    Template.fromStack(s).resourceCountIs('AWS::S3::Bucket', 0);
  });
});
