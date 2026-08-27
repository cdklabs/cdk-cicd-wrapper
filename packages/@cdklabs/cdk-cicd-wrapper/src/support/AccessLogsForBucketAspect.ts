// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Blueprint shipped this as `AccessLogsForBucketPlugin` (m9-migrate-security-plugins), on by default but a
// no-op unless `complianceLogBucketName` was configured (it read the name off
// `PipelineBlueprintProps.deploymentDefinition` and initialized `GlobalResources.COMPLIANCE_BUCKET`
// as a side effect). In Autopilot the compliance bucket (`SupportResources.complianceLogBucket`) and its
// `complianceLogBucketName` config field now exist, so this aspect takes the destination bucket name
// explicitly. It is auto-attached by the engines that provision the bucket: the flat `CodePipelineEngine`
// and the `CdkPipelinesEngine`, in both cases at `AspectPriority.MUTATING` so the L1 logging override
// lands before the readonly `AwsSolutionsChecks` (otherwise `AwsSolutions-S1` false-fails). It remains
// exported for a narrower explicit `Aspects.of(scope).add(...)` use.

import { IAspect, Annotations, Names, Stack } from 'aws-cdk-lib';
import { CfnBucket } from 'aws-cdk-lib/aws-s3';
import { IConstruct } from 'constructs';

/** Constructor props for {@link AccessLogsForBucketAspect}. */
export interface AccessLogsForBucketAspectProps {
  /** The name of the bucket every visited bucket's access logs are delivered to. */
  readonly complianceLogBucketName: string;

  /**
   * The region the compliance log bucket lives in. When a visited bucket's stack is deployed to a
   * different region, `complianceLogBucketName` is rewritten by substituting `mainRegion` for that
   * stack's region -- same cross-region name convention as Blueprint.
   */
  readonly mainRegion: string;
}

/**
 * Configures S3 server access logging (destination + prefix) on every L1 `CfnBucket` it visits that
 * does not already set a logging destination, matching Blueprint's default-on `AccessLogsForBucketPlugin`.
 */
export class AccessLogsForBucketAspect implements IAspect {
  private readonly complianceLogBucketName: string;

  private readonly mainRegion: string;

  public constructor(props: AccessLogsForBucketAspectProps) {
    this.complianceLogBucketName = props.complianceLogBucketName;
    this.mainRegion = props.mainRegion;
  }

  public visit(node: IConstruct): void {
    if (!(node instanceof CfnBucket)) {
      return;
    }

    const stack = this.findStack(node);
    if (!stack) {
      throw new Error('Could not find stack for the bucket');
    }

    let complianceLogBucketName = this.complianceLogBucketName;
    if (stack.region !== this.mainRegion) {
      Annotations.of(node).addWarningV2(
        'access-logs-for-bucket-aspect-cross-region-used',
        'The Access Logs For Bucket aspect is used cross region',
      );
      complianceLogBucketName = this.complianceLogBucketName.replace(this.mainRegion, stack.region);
    }

    if (node.loggingConfiguration === undefined) {
      node.loggingConfiguration = {
        destinationBucketName: complianceLogBucketName,
        logFilePrefix: Names.uniqueId(node),
      };
    } else {
      const currentLoggingConfig = node.loggingConfiguration as CfnBucket.LoggingConfigurationProperty;
      if (currentLoggingConfig.logFilePrefix) {
        node.loggingConfiguration = {
          destinationBucketName: complianceLogBucketName,
          logFilePrefix: currentLoggingConfig.logFilePrefix,
        };
      }
    }
  }

  private findStack(node: IConstruct): Stack | undefined {
    let current: IConstruct | undefined = node;
    while (current && current.node.scope && !('stackName' in current)) {
      current = current.node.scope;
    }
    return current as Stack | undefined;
  }
}
