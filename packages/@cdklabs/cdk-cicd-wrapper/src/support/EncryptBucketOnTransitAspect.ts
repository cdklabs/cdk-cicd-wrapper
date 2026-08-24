// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// v2 shipped this as `EncryptBucketOnTransitPlugin`, on by default (m9-migrate-security-plugins).
// v3 has no plugin registry -- it is a plain `IAspect`, wired tree-wide by the runtime injection
// hook (m2-attach/m2-register) alongside cdk-nag, tags and log retention.

import { CfnResource, IAspect, Resource } from 'aws-cdk-lib';
import { Effect, PolicyStatement, AnyPrincipal } from 'aws-cdk-lib/aws-iam';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { IConstruct } from 'constructs';

const BUCKET_RESOURCE_TYPE = 'AWS::S3::Bucket';

/**
 * True when `node` is an L2 resource construct whose default child is a CFN resource of
 * `cfnResourceType`. Checked structurally -- `Resource.isResource` (a `Symbol.for` marker shared
 * through the global symbol registry) plus `CfnResource.isCfnResource`'s `cfnResourceType` duck-type
 * (same pattern as `RotateEncryptionKeysAspect`/`LogRetentionAspect`) -- rather than `instanceof
 * Bucket`, which silently misses a match when the app resolves a second, physically distinct copy of
 * `aws-cdk-lib` (confirmed against a real deploy -- see m9-migrate-security-plugins in task.md). The
 * node itself still has every real `Bucket` method at runtime; only its class identity differs from
 * this module's own `Bucket` class.
 */
function isL2ResourceOfType(node: IConstruct, cfnResourceType: string): boolean {
  const defaultChild = Resource.isResource(node) ? node.node.defaultChild : undefined;
  return CfnResource.isCfnResource(defaultChild) && defaultChild.cfnResourceType === cfnResourceType;
}

/**
 * Denies non-TLS `s3:PutObject` on every L2 `Bucket` it visits, matching v2's default-on
 * `EncryptBucketOnTransitPlugin`. Only reaches the L2 `Bucket` construct (not `CfnBucket`), same as
 * v2, since the resource policy is applied via `addToResourcePolicy`.
 */
export class EncryptBucketOnTransitAspect implements IAspect {
  public visit(node: IConstruct): void {
    if (isL2ResourceOfType(node, BUCKET_RESOURCE_TYPE)) {
      const bucket = node as unknown as IBucket;
      bucket.addToResourcePolicy(
        new PolicyStatement({
          sid: 'DenyHTTP',
          effect: Effect.DENY,
          principals: [new AnyPrincipal()],
          actions: ['s3:PutObject'],
          resources: [`${bucket.bucketArn}/*`],
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
