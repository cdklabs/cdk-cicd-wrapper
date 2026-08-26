// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Blueprint shipped this as `RotateEncryptionKeysPlugin`, on by default (m9-migrate-security-plugins). Autopilot
// has no plugin registry -- it is a plain `IAspect`, wired tree-wide by the runtime injection hook
// (m2-attach/m2-register) alongside cdk-nag, tags and log retention.
//
// Checks the CloudFormation resource type structurally (`CfnResource.isCfnResource` +
// `cfnResourceType`) rather than `instanceof CfnKey`: an `instanceof` check on an L1 CFN class can
// silently miss a match when the app resolves a second, physically distinct copy of `aws-cdk-lib`
// (the failure mode `m9-migrate-log-retention` hit against a real deploy).

import { IAspect, CfnResource } from 'aws-cdk-lib';
import { CfnKey } from 'aws-cdk-lib/aws-kms';
import { IConstruct } from 'constructs';

const KMS_KEY_RESOURCE_TYPE = 'AWS::KMS::Key';

/**
 * Enables key rotation on every KMS key it visits, matching Blueprint's default-on
 * `RotateEncryptionKeysPlugin`.
 */
export class RotateEncryptionKeysAspect implements IAspect {
  public visit(node: IConstruct): void {
    if (CfnResource.isCfnResource(node) && node.cfnResourceType === KMS_KEY_RESOURCE_TYPE) {
      (node as CfnKey).enableKeyRotation = true;
    }
  }
}
