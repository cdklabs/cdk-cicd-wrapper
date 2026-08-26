// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Blueprint forced a log-retention default across the whole pipeline tree from
// `EncryptCloudWatchLogGroupsPlugin`'s aspect, which set retention AND KMS encryption together off a
// single `PipelineBlueprintProps.logRetentionInDays`. v3 splits retention out on its own -- CloudWatch
// log-group encryption is a separate migration item -- and wires it into the same tree-wide hook
// (`applyWrapper`, m2-attach/m2-register) that already carries cdk-nag and tags.

import { IAspect, CfnResource } from 'aws-cdk-lib';
import { CfnLogGroup } from 'aws-cdk-lib/aws-logs';
import { IConstruct } from 'constructs';

const LOG_GROUP_RESOURCE_TYPE = 'AWS::Logs::LogGroup';

/** The wrapper's default log retention when the app config does not set one, matching Blueprint's default. */
export const DEFAULT_LOG_RETENTION_DAYS = 365;

/** Options for {@link LogRetentionAspect}. */
export interface LogRetentionAspectProps {
  /**
   * Retention period, in days, applied to every CloudWatch Log Group the aspect visits that does not
   * already have an explicit retention set. Defaults to 365 (matching Blueprint).
   */
  readonly retentionInDays?: number;
}

/**
 * Forces a default CloudWatch Logs retention period tree-wide, without overriding a log group that
 * already sets one explicitly. The wrapper's runtime injection hook (m2-attach/m2-register) applies
 * this automatically, driven by the app config's `logRetentionInDays`; add it directly with
 * `Aspects.of(scope).add(...)` for a narrower scope.
 */
export class LogRetentionAspect implements IAspect {
  private readonly retentionInDays: number;

  public constructor(props: LogRetentionAspectProps = {}) {
    this.retentionInDays = props.retentionInDays ?? DEFAULT_LOG_RETENTION_DAYS;
  }

  public visit(node: IConstruct): void {
    // Checks the CloudFormation resource type structurally (`CfnResource.isCfnResource` +
    // `cfnResourceType`) rather than `instanceof CfnLogGroup`: an `instanceof` check on an L1 CFN
    // class can silently miss a match when the app resolves a second, physically distinct copy of
    // `aws-cdk-lib` (confirmed against a real deploy -- see m9-migrate-log-retention in task.md).
    if (
      CfnResource.isCfnResource(node) &&
      node.cfnResourceType === LOG_GROUP_RESOURCE_TYPE &&
      (node as CfnLogGroup).retentionInDays === undefined
    ) {
      (node as CfnLogGroup).retentionInDays = this.retentionInDays;
    }
  }
}
