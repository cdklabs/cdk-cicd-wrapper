// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { IAspect, Aspects, RemovalPolicy } from 'aws-cdk-lib';
import { Key } from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { IPlugin, ResourceContext, Stage } from '../../common';

/**
 * Plugin to destroy encryption keys on delete.
 */
export class DestroyEncryptionKeysOnDeletePlugin implements IPlugin {
  readonly name: string = 'DestroyEncryptionKeysOnDeletePlugin';

  readonly version: string = '1.0';

  constructor(readonly stagesToRetain: Stage[] = [Stage.PROD]) {}

  afterStage(scope: Construct, context: ResourceContext): void {
    if (this.stagesToRetain.includes(context.stage)) {
      return;
    }
    Aspects.of(scope).add(new DestroyEncryptionKeysOnDeleteAspect());
  }
}

class DestroyEncryptionKeysOnDeleteAspect implements IAspect {
  constructor() {}

  visit(node: Construct): void {
    if (node instanceof Key) {
      // Configure KMS key removal policy based on deployment stage
      node.applyRemovalPolicy(RemovalPolicy.DESTROY);
    }
  }
}
