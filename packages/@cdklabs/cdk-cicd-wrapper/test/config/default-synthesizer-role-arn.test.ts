// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { App, BOOTSTRAP_QUALIFIER_CONTEXT, DefaultStackSynthesizer } from 'aws-cdk-lib';
import {
  normalizeDefaultSynthesizerQualifier,
  resolveDefaultSynthesizerQualifier,
  specializeDefaultSynthesizerRoleArn,
} from '../../src/config/default-synthesizer-role-arn';

describe('default synthesizer qualifier contract', () => {
  test('role specialization trims and replaces every explicit qualifier placeholder', () => {
    expect(
      specializeDefaultSynthesizerRoleArn(
        'arn:aws:iam::${AWS::AccountId}:role/cdk-${Qualifier}-${Qualifier}-${AWS::Region}',
        {
          qualifier: '  shared_1  ',
          account: '111111111111',
          region: 'us-west-2',
        },
      ),
    ).toBe('arn:aws:iam::111111111111:role/cdk-shared_1-shared_1-us-west-2');
  });

  test('explicit qualifier normalization is shared with pipeline IAM resolution', () => {
    const app = new App();

    expect(normalizeDefaultSynthesizerQualifier('  shared_1  ')).toBe('shared_1');
    expect(resolveDefaultSynthesizerQualifier(app, '  shared_1  ')).toBe('shared_1');
  });

  test.each(['', '   ', 'invalid qualifier', 'invalid!', '12345678901'])(
    'rejects invalid explicit qualifier %j',
    (qualifier) => {
      expect(() => normalizeDefaultSynthesizerQualifier(qualifier)).toThrow(
        /explicit bootstrap qualifier.*\[A-Za-z0-9_-\]\{1,10\}/,
      );
      expect(() => resolveDefaultSynthesizerQualifier(new App(), qualifier)).toThrow(
        /explicit bootstrap qualifier.*\[A-Za-z0-9_-\]\{1,10\}/,
      );
      expect(() =>
        specializeDefaultSynthesizerRoleArn('${Qualifier}', {
          qualifier,
          account: '111111111111',
          region: 'us-west-2',
        }),
      ).toThrow(/explicit bootstrap qualifier.*\[A-Za-z0-9_-\]\{1,10\}/);
    },
  );

  test('uses the exact valid CDK context qualifier when no explicit value is configured', () => {
    const app = new App({ context: { [BOOTSTRAP_QUALIFIER_CONTEXT]: 'Context_1' } });

    expect(resolveDefaultSynthesizerQualifier(app)).toBe('Context_1');
  });

  test.each([' context1 ', '', 'invalid!', '12345678901', 123])(
    'rejects rather than normalizing invalid CDK context qualifier %j',
    (qualifier) => {
      const app = new App({ context: { [BOOTSTRAP_QUALIFIER_CONTEXT]: qualifier } });

      expect(() => resolveDefaultSynthesizerQualifier(app)).toThrow(
        new RegExp(`context '${BOOTSTRAP_QUALIFIER_CONTEXT}'.*\\[A-Za-z0-9_-\\]\\{1,10\\}`),
      );
    },
  );

  test('falls back to the CDK default only when explicit and context qualifiers are absent', () => {
    expect(resolveDefaultSynthesizerQualifier(new App())).toBe(DefaultStackSynthesizer.DEFAULT_QUALIFIER);
  });
});
