// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// v2 shipped this as `DestroyEncryptionKeysOnDeletePlugin` (m9-migrate-security-plugins), on by
// default, deciding per stage via its own `Stage` enum + `ResourceContext` whether to add itself
// (skipping stages in a `stagesToRetain` list, defaulting to `[Stage.PROD]`). v3 dropped the
// Stage-enum + per-stage-plugin-hook model, so there is nothing to decide internally any more: the
// caller attaches this aspect only to the scope(s) that should get `RemovalPolicy.DESTROY` (e.g. a
// non-prod `Stage`/`Stack`), the same way any other CDK aspect is scoped. Not wired into the runtime
// injection hook (opt-in only, matching v2 -- retaining KMS keys by default is the safer stance).

import { IAspect, RemovalPolicy } from 'aws-cdk-lib';
import { Key } from 'aws-cdk-lib/aws-kms';
import { IConstruct } from 'constructs';

/**
 * Applies `RemovalPolicy.DESTROY` to every L2 KMS `Key` it visits, matching v2's
 * `DestroyEncryptionKeysOnDeletePlugin`. Attach it only to the scope(s) that should retain no
 * orphaned keys after a stack deletion -- typically non-production stages.
 */
export class DestroyEncryptionKeysOnDeleteAspect implements IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof Key) {
      node.applyRemovalPolicy(RemovalPolicy.DESTROY);
    }
  }
}
