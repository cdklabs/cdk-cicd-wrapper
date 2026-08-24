// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { App, Aspects, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { EncryptBucketOnTransitAspect } from '../../src/support/EncryptBucketOnTransitAspect';

function stack(): Stack {
  return new Stack(new App(), 'BucketStack');
}

describe('m9-migrate-security-plugins: EncryptBucketOnTransitAspect', () => {
  test('denies non-TLS PutObject on every L2 bucket it visits', () => {
    const s = stack();
    Aspects.of(s).add(new EncryptBucketOnTransitAspect());
    new s3.Bucket(s, 'Bucket');

    Template.fromStack(s).hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: [
          {
            Sid: 'DenyHTTP',
            Effect: 'Deny',
            Principal: { AWS: '*' },
            Action: 's3:PutObject',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          },
        ],
      },
    });
  });

  test('ignores non-bucket constructs', () => {
    const s = stack();
    expect(() => Aspects.of(s).add(new EncryptBucketOnTransitAspect())).not.toThrow();
    Template.fromStack(s).resourceCountIs('AWS::S3::BucketPolicy', 0);
  });

  test('denies non-TLS PutObject on a bucket built from a second, independently-loaded copy of aws-cdk-lib', () => {
    // `jest.isolateModules` re-executes `aws-cdk-lib` (and everything it depends on) in a fresh
    // module registry, so the `Bucket` class it returns is a distinct class object from the one
    // imported at the top of this file -- mirroring the two physical `aws-cdk-lib` copies this dev
    // tree actually resolves (root `node_modules` vs. this package's own nested `node_modules`), the
    // module-identity boundary that made `node instanceof Bucket` silently false against a real
    // deploy. The aspect must recognize the bucket structurally, not by class identity.
    let otherBucket!: s3.Bucket;
    let otherTemplate!: unknown;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const otherCdkLib = require('aws-cdk-lib');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const otherS3 = require('aws-cdk-lib/aws-s3');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const otherAssertions = require('aws-cdk-lib/assertions');
      const otherStack = new otherCdkLib.Stack(new otherCdkLib.App(), 'OtherCopyStack');
      otherBucket = new otherS3.Bucket(otherStack, 'Bucket');
      new EncryptBucketOnTransitAspect().visit(otherBucket);
      otherTemplate = otherAssertions.Template.fromStack(otherStack);
    });

    // Proves the object really did come from a different class -- otherwise this test would pass
    // trivially without exercising the cross-copy boundary at all.
    expect(otherBucket instanceof s3.Bucket).toBe(false);

    (otherTemplate as Template).hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: [
          {
            Sid: 'DenyHTTP',
            Effect: 'Deny',
          },
        ],
      },
    });
  });
});
