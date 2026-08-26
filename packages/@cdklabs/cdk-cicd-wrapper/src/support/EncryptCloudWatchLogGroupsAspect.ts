// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Blueprint shipped this as `EncryptCloudWatchLogGroupsPlugin` (m9-migrate-security-plugins), on by
// default, setting retention AND KMS encryption together off a single
// `PipelineBlueprintProps.logRetentionInDays` and a KMS key it pulled implicitly from
// `GlobalResources.ENCRYPTION` (a per-stage key Blueprint provisioned for every app by default). Autopilot split
// retention out on its own (`LogRetentionAspect`, m9-migrate-log-retention) and has no default
// per-stage encryption key provider, so this aspect takes the key explicitly instead of reaching
// for one implicitly -- not wired into the runtime injection hook until a default key provider
// exists; attach it directly with the key you want log groups encrypted under.

import { IAspect, CfnResource } from 'aws-cdk-lib';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { CfnLogGroup } from 'aws-cdk-lib/aws-logs';
import { IConstruct } from 'constructs';

const LOG_GROUP_RESOURCE_TYPE = 'AWS::Logs::LogGroup';

/** Constructor props for {@link EncryptCloudWatchLogGroupsAspect}. */
export interface EncryptCloudWatchLogGroupsAspectProps {
  /** The KMS key used to encrypt every CloudWatch Log Group this aspect visits. */
  readonly encryptionKey: IKey;
}

/**
 * Sets the KMS key on every CloudWatch Log Group it visits that does not already have one, matching
 * the encryption half of Blueprint's `EncryptCloudWatchLogGroupsPlugin` (the retention half is
 * `LogRetentionAspect`).
 *
 * Checks the CloudFormation resource type structurally (`CfnResource.isCfnResource` +
 * `cfnResourceType`) rather than `instanceof CfnLogGroup`: an `instanceof` check on an L1 CFN class
 * can silently miss a match when the app resolves a second, physically distinct copy of
 * `aws-cdk-lib` (the failure mode `m9-migrate-log-retention` hit against a real deploy).
 */
export class EncryptCloudWatchLogGroupsAspect implements IAspect {
  private readonly encryptionKey: IKey;

  public constructor(props: EncryptCloudWatchLogGroupsAspectProps) {
    this.encryptionKey = props.encryptionKey;
  }

  public visit(node: IConstruct): void {
    if (CfnResource.isCfnResource(node) && node.cfnResourceType === LOG_GROUP_RESOURCE_TYPE) {
      const logGroup = node as CfnLogGroup;
      if (logGroup.kmsKeyId === undefined) {
        logGroup.kmsKeyId = this.encryptionKey.keyArn;
      }
    }
  }
}
