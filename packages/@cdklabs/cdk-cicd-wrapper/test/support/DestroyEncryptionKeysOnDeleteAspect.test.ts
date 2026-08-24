// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { App, Aspects, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as kms from 'aws-cdk-lib/aws-kms';
import { DestroyEncryptionKeysOnDeleteAspect } from '../../src/support/DestroyEncryptionKeysOnDeleteAspect';

function stack(): Stack {
  return new Stack(new App(), 'KeyStack');
}

describe('m9-migrate-security-plugins: DestroyEncryptionKeysOnDeleteAspect', () => {
  test('applies RemovalPolicy.DESTROY to every KMS key it visits', () => {
    const s = stack();
    Aspects.of(s).add(new DestroyEncryptionKeysOnDeleteAspect());
    new kms.Key(s, 'Key', { removalPolicy: RemovalPolicy.RETAIN });

    Template.fromStack(s).hasResource('AWS::KMS::Key', {
      DeletionPolicy: 'Delete',
      UpdateReplacePolicy: 'Delete',
    });
  });

  test('ignores non-key constructs', () => {
    const s = stack();
    expect(() => Aspects.of(s).add(new DestroyEncryptionKeysOnDeleteAspect())).not.toThrow();
    Template.fromStack(s).resourceCountIs('AWS::KMS::Key', 0);
  });
});
