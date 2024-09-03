// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { IAspect, Aspects } from 'aws-cdk-lib';
import { CfnKey } from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { PluginBase, ResourceContext } from '../../common';

/**
 * Plugin to enable key rotation for KMS keys.
 */
export class RotateEncryptionKeysPlugin extends PluginBase {
  readonly name: string = 'RotateEncryptionKeysPlugin';

  readonly version: string = '1.0';

  afterStage(scope: Construct, _: ResourceContext): void {
    Aspects.of(scope).add(new RotateEncryptionKeysAspect());
  }
}

class RotateEncryptionKeysAspect implements IAspect {
  constructor() {}

  visit(node: Construct): void {
    if (node instanceof CfnKey) {
      // Enable KMS key rotation
      node.enableKeyRotation = true;
    }
  }
}
