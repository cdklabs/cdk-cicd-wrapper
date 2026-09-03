// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Blueprint shipped this as `AccessLogsForBucketPlugin` (m9-migrate-security-plugins), on by default but a
// no-op unless `complianceLogBucketName` was configured (it read the name off
// `PipelineBlueprintProps.deploymentDefinition` and initialized `GlobalResources.COMPLIANCE_BUCKET`
// as a side effect). In Autopilot the compliance bucket (`SupportResources.complianceLogBucket`) and its
// `complianceLogBucketName` config field now exist, so this aspect takes the destination bucket and
// environment explicitly. It is auto-attached by the engines that provision the bucket: the flat
// `CodePipelineEngine` and the `CdkPipelinesEngine`, in both cases at `AspectPriority.MUTATING` so the
// L1 logging override lands before the readonly `AwsSolutionsChecks` (otherwise `AwsSolutions-S1`
// false-fails). It remains exported for a narrower explicit `Aspects.of(scope).add(...)` use.

import { CfnResource, IAspect, Names, Stack, Token } from 'aws-cdk-lib';
import { CfnBucket, CfnBucketPolicy, IBucket } from 'aws-cdk-lib/aws-s3';
import { IConstruct } from 'constructs';

/** Constructor props for {@link AccessLogsForBucketAspect}. */
export interface AccessLogsForBucketAspectProps {
  /** The name of the bucket every visited bucket's access logs are delivered to. */
  readonly complianceLogBucketName: string;
  /** AWS account that owns the compliance bucket. S3 access-log delivery cannot cross accounts. */
  readonly complianceLogBucketAccount: string;
  /** AWS Region containing the compliance bucket. S3 access-log delivery cannot cross Regions. */
  readonly complianceLogBucketRegion: string;
  /**
   * The concrete destination bucket when it exists in the same CDK app. Supplying it lets same-stack
   * source buckets depend explicitly on the destination bucket and its policy.
   */
  readonly complianceLogBucket?: IBucket;
}

/**
 * Configures S3 server access logging on every L1 `CfnBucket` it visits. The compliance destination
 * always wins; an existing user prefix is preserved, otherwise a bucket-specific prefix is generated.
 */
export class AccessLogsForBucketAspect implements IAspect {
  private readonly complianceLogBucketName: string;

  private readonly complianceLogBucketAccount: string;

  private readonly complianceLogBucketRegion: string;

  private readonly complianceLogBucket?: IBucket;

  public constructor(props: AccessLogsForBucketAspectProps) {
    this.complianceLogBucketName = props.complianceLogBucketName;
    this.complianceLogBucketAccount = props.complianceLogBucketAccount;
    this.complianceLogBucketRegion = props.complianceLogBucketRegion;
    this.complianceLogBucket = props.complianceLogBucket;
  }

  public visit(node: IConstruct): void {
    if (!isCfnResourceType(node, CfnBucket.CFN_RESOURCE_TYPE_NAME)) {
      return;
    }
    const bucket = node as unknown as CfnBucket;

    const destinationResource = this.complianceLogBucket?.node.defaultChild;
    if (
      bucket === destinationResource ||
      (bucket.bucketName !== undefined &&
        !Token.isUnresolved(bucket.bucketName) &&
        bucket.bucketName === this.complianceLogBucketName)
    ) {
      // A server-access-log destination must never log to itself.
      return;
    }

    const stack = Stack.of(bucket);
    if (Token.isUnresolved(stack.account) || Token.isUnresolved(stack.region)) {
      throw new Error(
        `cdk-cicd: compliance logging for bucket '${bucket.node.path}' requires a concrete source ` +
          'stack account and region so the S3 same-account/same-region requirement can be verified.',
      );
    }
    if (stack.account !== this.complianceLogBucketAccount || stack.region !== this.complianceLogBucketRegion) {
      throw new Error(
        `cdk-cicd: bucket '${bucket.node.path}' is in ${stack.account}/${stack.region}, but compliance ` +
          `bucket '${this.complianceLogBucketName}' is in ${this.complianceLogBucketAccount}/` +
          `${this.complianceLogBucketRegion}. S3 server access logs require the source and destination ` +
          'buckets to be in the same account and region.',
      );
    }

    const currentLoggingConfig = bucket.loggingConfiguration as CfnBucket.LoggingConfigurationProperty | undefined;
    bucket.loggingConfiguration = {
      destinationBucketName: this.complianceLogBucketName,
      logFilePrefix: currentLoggingConfig?.logFilePrefix ?? Names.uniqueId(bucket),
      targetObjectKeyFormat: currentLoggingConfig?.targetObjectKeyFormat,
    };

    // The source now targets the concrete compliance bucket, so same-stack creation ordering matters.
    this.addSameStackDependencies(bucket, stack);
  }

  private addSameStackDependencies(source: CfnBucket, sourceStack: Stack): void {
    if (this.complianceLogBucket === undefined || Stack.of(this.complianceLogBucket) !== sourceStack) {
      return;
    }

    for (const dependency of this.complianceLogBucket.node.findAll()) {
      if (
        dependency !== source &&
        (isCfnResourceType(dependency, CfnBucket.CFN_RESOURCE_TYPE_NAME) ||
          isCfnResourceType(dependency, CfnBucketPolicy.CFN_RESOURCE_TYPE_NAME))
      ) {
        source.addDependency(dependency as CfnResource);
      }
    }
  }
}

/** CDK's symbol-backed L1 guard works across separately loaded aws-cdk-lib copies; instanceof does not. */
function isCfnResourceType(node: IConstruct, resourceType: string): boolean {
  return CfnResource.isCfnResource(node) && node.cfnResourceType === resourceType;
}
