// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The wrapper's own support resources -- the things the PIPELINE needs to exist, as opposed to
// anything the user's workload declares. Blueprint provisioned these eagerly from a set of resource
// providers behind a `ResourceContext` singleton, so every pipeline paid for every support resource
// whether or not it was used.
//
// Autopilot keeps the concept and drops both the singleton and the string-keyed provider registry: this is
// an ordinary Construct whose resources are created lazily, on first property read. Nothing here is
// provisioned unless something asks for it, and the lookups are typed instead of `any` off a map.
// The remaining Blueprint support resources (compliance/log bucket, SSM parameters, VPC, proxy) slot in as
// further lazy properties when a milestone needs them.

import { RemovalPolicy, Stack, aws_kms as kms, aws_s3 as s3 } from 'aws-cdk-lib';
import { Effect, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';
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
   * subnets when true, matching Blueprint's `VPCProvider`.
   */
  readonly useProxy?: boolean;
  /**
   * The name of the compliance/access-log bucket -- Blueprint's `IComplianceBucket.bucketName`
   * (`ComplianceBucketProvider`). Required only if `complianceLogBucket` is read; an explicit,
   * predictable name is what lets same-account, same-Region application buckets point their S3
   * server-access logging at it without creating CloudFormation cross-stack references.
   */
  readonly complianceLogBucketName?: string;
  /**
   * Whether this construct creates and manages `complianceLogBucketName`.
   *
   * Set to `false` to reference a pre-existing, owner-managed Blueprint compliance bucket. Imported
   * buckets synthesize no `AWS::S3::Bucket` or `AWS::S3::BucketPolicy`; the owner must maintain the
   * bucket's same-account/same-Region placement, SSE-S3 encryption, TLS enforcement, public-access
   * block, disabled Object Lock and Requester Pays settings, and S3 server-access-log delivery policy.
   * A name-only CDK import cannot inspect or validate those live settings.
   *
   * @default true
   */
  readonly createComplianceLogBucket?: boolean;
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
  private readonly createComplianceLogBucket: boolean;
  private _encryptionKey?: kms.Key;
  private _artifactBucket?: s3.Bucket;
  private _vpcNetworking?: VpcNetworking;
  private vpcResolved = false;
  private _complianceLogBucket?: s3.IBucket;

  public constructor(scope: Construct, id: string, props: SupportResourcesProps = {}) {
    super(scope, id);
    this.removalPolicy = props.removalPolicy ?? RemovalPolicy.RETAIN;
    this.vpcConfig = props.vpc;
    this.useProxy = props.useProxy ?? false;
    this.complianceLogBucketName = props.complianceLogBucketName;
    this.createComplianceLogBucket = props.createComplianceLogBucket ?? true;
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
   * configured (Blueprint `VPCProvider`, migrated). `undefined` when not configured. Resolved on first read,
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
   * The compliance/access-log destination bucket (Blueprint `ComplianceBucketProvider` +
   * `ComplianceLogBucketStack`) -- other buckets' S3 server access logs land here. Created on first
   * read, same as every other property here. Requires `complianceLogBucketName`: unlike
   * `artifactBucket`, this bucket's name must be explicit and predictable so other buckets' logging
   * configuration can reference it by name.
   *
   * By default Autopilot provisions a plain, CloudFormation-managed `Bucket`. For an in-place Blueprint
   * migration, set `createComplianceLogBucket: false` to reference the existing bucket by name instead.
   * CDK intentionally cannot mutate an imported bucket policy, so that mode leaves the bucket and policy
   * entirely under their current owner's lifecycle.
   *
   * The bucket uses default SSE-S3 encryption. Writers, including the S3 server-access-log delivery
   * service, do not need to send an `x-amz-server-side-encryption` header: S3 encrypts the object at
   * rest after accepting it. A bucket-policy deny based on that header would block valid log delivery,
   * so transport encryption is enforced here while at-rest encryption is enforced by bucket defaults.
   */
  public get complianceLogBucket(): s3.IBucket {
    if (this._complianceLogBucket === undefined) {
      if (!this.complianceLogBucketName) {
        throw new Error('complianceLogBucketName must be configured to read complianceLogBucket');
      }

      if (!this.createComplianceLogBucket) {
        if (this.removalPolicy === RemovalPolicy.DESTROY) {
          throw new Error(
            'createComplianceLogBucket: false cannot be combined with RemovalPolicy.DESTROY; ' +
              'the imported compliance bucket is owner-managed.',
          );
        }
        this._complianceLogBucket = s3.Bucket.fromBucketName(
          this,
          'ImportedComplianceLogBucket',
          this.complianceLogBucketName,
        );
        return this._complianceLogBucket;
      }

      const bucket = new s3.Bucket(this, 'ComplianceLogBucket', {
        bucketName: this.complianceLogBucketName,
        encryption: s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        removalPolicy: this.removalPolicy,
        autoDeleteObjects: this.removalPolicy === RemovalPolicy.DESTROY,
      });
      NagSuppressions.addResourceSuppressions(bucket, [
        {
          id: 'AwsSolutions-S1',
          reason:
            'This bucket is the dedicated S3 server-access-log destination and must not recursively log to itself.',
        },
      ]);

      const policyResult = bucket.addToResourcePolicy(
        new PolicyStatement({
          sid: 'S3ServerAccessLogsPolicy',
          effect: Effect.ALLOW,
          principals: [new ServicePrincipal('logging.s3.amazonaws.com')],
          actions: ['s3:PutObject'],
          resources: [bucket.arnForObjects('*')],
          conditions: {
            StringEquals: {
              'aws:SourceAccount': Stack.of(this).account,
            },
            ArnLike: {
              // Source bucket names are application-defined and often late-bound. Constrain delivery
              // to S3 buckets owned by this exact account; application/pipeline aspects enforce the
              // same-account/same-region contract before they configure any source bucket.
              'aws:SourceArn': `arn:${Stack.of(this).partition}:s3:::*`,
            },
          },
        }),
      );
      if (!policyResult.statementAdded || bucket.policy === undefined) {
        throw new Error('failed to attach the managed compliance bucket policy');
      }
      // The policy is operationally part of the destination. Retaining the bucket while deleting its
      // policy would stop log delivery and remove TLS enforcement; disposable stacks should delete both.
      bucket.policy.applyRemovalPolicy(this.removalPolicy);

      this._complianceLogBucket = bucket;
    }
    return this._complianceLogBucket;
  }
}
