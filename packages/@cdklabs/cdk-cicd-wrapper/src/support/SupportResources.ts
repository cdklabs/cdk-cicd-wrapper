// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The wrapper's own support resources -- the things the PIPELINE needs to exist, as opposed to
// anything the user's workload declares. v2 provisioned these eagerly from a set of resource
// providers behind a `ResourceContext` singleton, so every pipeline paid for every support resource
// whether or not it was used.
//
// v3 keeps the concept and drops both the singleton and the string-keyed provider registry: this is
// an ordinary Construct whose resources are created lazily, on first property read. Nothing here is
// provisioned unless something asks for it, and the lookups are typed instead of `any` off a map.
// The remaining v2 support resources (compliance/log bucket, SSM parameters, VPC, proxy) slot in as
// further lazy properties when a milestone needs them.

import { RemovalPolicy, aws_kms as kms, aws_s3 as s3 } from 'aws-cdk-lib';
import { Construct } from 'constructs';

/** Options for the wrapper's support resources. */
export interface SupportResourcesProps {
  /**
   * Removal policy for the support resources. `RETAIN` by default, because the artifact bucket and
   * the key that encrypts it outlive a pipeline redeploy; a disposable pipeline (test fixtures,
   * ephemeral environments) sets `DESTROY` so a stack delete leaves nothing behind.
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Lazily provisioned support resources for a pipeline. Reading a property creates the resource on
 * first access and returns the same instance afterwards; a `SupportResources` nobody reads adds
 * nothing to the template.
 */
export class SupportResources extends Construct {
  private readonly removalPolicy: RemovalPolicy;
  private _encryptionKey?: kms.Key;
  private _artifactBucket?: s3.Bucket;

  public constructor(scope: Construct, id: string, props: SupportResourcesProps = {}) {
    super(scope, id);
    this.removalPolicy = props.removalPolicy ?? RemovalPolicy.RETAIN;
  }

  /** The customer-managed key the wrapper encrypts its own artifacts with. Created on first read. */
  public get encryptionKey(): kms.IKey {
    if (this._encryptionKey === undefined) {
      this._encryptionKey = new kms.Key(this, 'EncryptionKey', {
        // No alias: an alias is unique per account/region, so naming one here would collide as soon
        // as a second pipeline is deployed into the same account.
        enableKeyRotation: true,
        removalPolicy: this.removalPolicy,
      });
    }
    return this._encryptionKey;
  }

  /** The pipeline's artifact store, encrypted with `encryptionKey`. Created on first read. */
  public get artifactBucket(): s3.IBucket {
    if (this._artifactBucket === undefined) {
      this._artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
        encryption: s3.BucketEncryption.KMS,
        encryptionKey: this.encryptionKey,
        enforceSSL: true,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        removalPolicy: this.removalPolicy,
        // Artifacts are reproducible from source, so a disposable pipeline empties the bucket rather
        // than failing the stack delete on a non-empty bucket.
        autoDeleteObjects: this.removalPolicy === RemovalPolicy.DESTROY,
      });
    }
    return this._artifactBucket;
  }
}
