// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { IAspect, Aspects } from 'aws-cdk-lib';
import { Key } from 'aws-cdk-lib/aws-kms';
import { CfnLogGroup } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { GlobalResources, IPlugin, ResourceContext } from '../../common';

/**
 * Plugin to encrypt CloudWatch Log Groups.
 */
export class EncryptCloudWatchLogGroupsPlugin implements IPlugin {
  readonly name: string = 'EncryptCloudWatchLogGroupsPlugin';

  readonly version: string = '1.0';

  private logRetentionInDays?: string;

  create(context: ResourceContext): void {
    this.logRetentionInDays = context.blueprintProps.logRetentionInDays;
  }

  afterStage(scope: Construct, context: ResourceContext): void {
    Aspects.of(scope).add(
      new EncryptCloudWatchLogGroupsAspect(context.get(GlobalResources.ENCRYPTION).key, this.logRetentionInDays!),
    );
  }
}

class EncryptCloudWatchLogGroupsAspect implements IAspect {
  constructor(
    private encryptionKey: Key,
    private logRetentionInDays: string,
  ) {}

  visit(node: Construct): void {
    if (node instanceof CfnLogGroup) {
      // Configure log retention and encryption for CloudWatch log groups
      if (node.retentionInDays === undefined) {
        node.retentionInDays = Number(this.logRetentionInDays);
        node.kmsKeyId = this.encryptionKey.keyArn;
      }
    }
  }
}
