// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { IAspect, Aspects } from 'aws-cdk-lib';
import { Effect, PolicyStatement, AnyPrincipal } from 'aws-cdk-lib/aws-iam';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { PluginBase, ResourceContext } from '../../common';

/**
 * Plugin to enforce encryption in transit for an S3 bucket.
 */
export class EncryptBucketOnTransitPlugin extends PluginBase {
  readonly name: string = 'EncryptBucketOnTransitPlugin';

  readonly version: string = '1.0';

  afterStage(scope: Construct, _: ResourceContext): void {
    Aspects.of(scope).add(new EncryptBucketOnTransitAspect());
  }
}

class EncryptBucketOnTransitAspect implements IAspect {
  constructor() {}

  visit(node: Construct): void {
    if (node instanceof Bucket) {
      // Enforce encryption in transit for S3 bucket objects
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
    }
  }
}
