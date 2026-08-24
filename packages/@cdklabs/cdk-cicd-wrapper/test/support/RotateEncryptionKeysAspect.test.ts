// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { App, Aspects, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as kms from 'aws-cdk-lib/aws-kms';
import { RotateEncryptionKeysAspect } from '../../src/support/RotateEncryptionKeysAspect';

function stack(): Stack {
  return new Stack(new App(), 'KeyStack');
}

describe('m9-migrate-security-plugins: RotateEncryptionKeysAspect', () => {
  test('enables key rotation on every KMS key it visits', () => {
    const s = stack();
    Aspects.of(s).add(new RotateEncryptionKeysAspect());
    new kms.Key(s, 'Key', { enableKeyRotation: false });

    Template.fromStack(s).hasResourceProperties('AWS::KMS::Key', {
      EnableKeyRotation: true,
    });
  });

  test('ignores non-key constructs', () => {
    const s = stack();
    expect(() => Aspects.of(s).add(new RotateEncryptionKeysAspect())).not.toThrow();
    Template.fromStack(s).resourceCountIs('AWS::KMS::Key', 0);
  });
});
