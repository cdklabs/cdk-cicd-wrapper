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
import { AnyPrincipal, Effect, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { resolveVpcNetworking, VpcNetworking } from './Vpc';
import { VpcConfig } from '../config/types';

/** Options for the wrapper's support resources. */
export interface SupportResourcesProps {
  /**
   * Removal policy for the support resources. `RETAIN` by default, because the artifact bucket and
   * the key that encrypts it outlive a pipeline redeploy; a disposable pipeline (test fixtures,
   * ephemeral environments) sets `DESTROY` so a stack delete leaves nothing behind.
   */
  readonly removalPolicy?: RemovalPolicy;
  /** VPC every CodeBuild project the pipeline creates runs in, if configured. See `vpcNetworking`. */
  readonly vpc?: VpcConfig;
  /**
   * Whether an HTTP(S) proxy is configured (`ResolvedCicdConfig.proxy`). A managed VPC uses isolated
   * subnets when true, matching v2's `VPCProvider`.
   */
  readonly useProxy?: boolean;
  /**
   * The name of the compliance/access-log bucket -- v2's `IComplianceBucket.bucketName`
   * (`ComplianceBucketProvider`). Required only if `complianceLogBucket` is read; an explicit,
   * predictable name is what lets other buckets' S3 server-access-logging destination (and v2's
   * cross-region name-substitution convention for multi-region deployments) point at it.
   */
  readonly complianceLogBucketName?: string;
}

/**
 * Lazily provisioned support resources for a pipeline. Reading a property creates the resource on
 * first access and returns the same instance afterwards; a `SupportResources` nobody reads adds
 * nothing to the template.
 */
export class SupportResources extends Construct {
  private readonly removalPolicy: RemovalPolicy;
  private readonly vpcConfig?: VpcConfig;
  private readonly useProxy: boolean;
  private readonly complianceLogBucketName?: string;
  private _encryptionKey?: kms.Key;
  private _artifactBucket?: s3.Bucket;
  private _vpcNetworking?: VpcNetworking;
  private vpcResolved = false;
  private _complianceLogBucket?: s3.Bucket;

  public constructor(scope: Construct, id: string, props: SupportResourcesProps = {}) {
    super(scope, id);
    this.removalPolicy = props.removalPolicy ?? RemovalPolicy.RETAIN;
    this.vpcConfig = props.vpc;
    this.useProxy = props.useProxy ?? false;
    this.complianceLogBucketName = props.complianceLogBucketName;
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

  /**
   * VPC + security groups + subnet selection for the pipeline's own CodeBuild projects, if `vpc` was
   * configured (v2 `VPCProvider`, migrated). `undefined` when not configured. Resolved on first read,
   * same as every other property here -- a pipeline that never reads this creates no VPC.
   */
  public get vpcNetworking(): VpcNetworking | undefined {
    if (!this.vpcResolved) {
      this._vpcNetworking = resolveVpcNetworking(this, this.vpcConfig, this.useProxy);
      this.vpcResolved = true;
    }
    return this._vpcNetworking;
  }

  /**
   * The compliance/access-log destination bucket (v2 `ComplianceBucketProvider` +
   * `ComplianceLogBucketStack`) -- other buckets' S3 server access logs land here. Created on first
   * read, same as every other property here. Requires `complianceLogBucketName`: unlike
   * `artifactBucket`, this bucket's name must be explicit and predictable so other buckets' logging
   * configuration (and, cross-region, v2's name-substitution convention) can reference it.
   *
   * v2 provisioned this bucket via a custom-resource Lambda so a redeploy could tolerate the bucket
   * already existing (`BucketAlreadyOwnedByYou`); v3 provisions it as a plain, CloudFormation-managed
   * `Bucket` instead -- simpler, and the "already exists" case v2 tolerated doesn't arise here since
   * this construct's stack owns the bucket for the life of the pipeline.
   *
   * Folds in the TLS/SSE policy fix v2's Stage-1 change (`0b7ae02`) made and v3 must not regress:
   * enforcing encryption-in-transit works with a plain `Bool` condition on `aws:SecureTransport`
   * (`enforceSSL`, below) because that key is always present on every request. Enforcing encryption
   * *at rest* does not: `s3:x-amz-server-side-encryption` is only present in the request context when
   * the caller actually sets the header, so a `Bool` check against `"false"` never matches a request
   * that omits the header entirely -- exactly the unencrypted upload this statement exists to block.
   * The `Null` operator below checks for the header's *absence*, which a `Bool` check cannot.
   */
  public get complianceLogBucket(): s3.IBucket {
    if (this._complianceLogBucket === undefined) {
      if (!this.complianceLogBucketName) {
        throw new Error('complianceLogBucketName must be configured to read complianceLogBucket');
      }

      const bucket = new s3.Bucket(this, 'ComplianceLogBucket', {
        bucketName: this.complianceLogBucketName,
        encryption: s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        removalPolicy: this.removalPolicy,
        autoDeleteObjects: this.removalPolicy === RemovalPolicy.DESTROY,
      });

      bucket.addToResourcePolicy(
        new PolicyStatement({
          sid: 'S3ServerAccessLogsPolicy',
          effect: Effect.ALLOW,
          principals: [new ServicePrincipal('logging.s3.amazonaws.com')],
          actions: ['s3:PutObject'],
          resources: [bucket.arnForObjects('*')],
        }),
      );
      bucket.addToResourcePolicy(
        new PolicyStatement({
          sid: 'EnforceEncryptionAtRest',
          effect: Effect.DENY,
          principals: [new AnyPrincipal()],
          actions: ['s3:PutObject'],
          resources: [bucket.arnForObjects('*')],
          conditions: {
            Null: {
              's3:x-amz-server-side-encryption': 'true',
            },
          },
        }),
      );

      this._complianceLogBucket = bucket;
    }
    return this._complianceLogBucket;
  }
}
