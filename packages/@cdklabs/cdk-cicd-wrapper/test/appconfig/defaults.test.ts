// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { RemovalPolicyValue, applyDerivedDefaults, deepMerge, getDefaultConfig } from '../../src/appconfig';

describe('appconfig-deep-merge', () => {
  test('last wins for scalars', () => {
    expect(deepMerge<Record<string, unknown>>({ a: 1, b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 });
  });

  test('nested objects merge rather than replace', () => {
    const merged = deepMerge<Record<string, unknown>>(
      { aws: { accountId: '1', region: 'us-west-2' }, tags: { Owner: 'base' } },
      { aws: { region: 'us-west-1' } },
    );

    expect(merged).toEqual({
      aws: { accountId: '1', region: 'us-west-1' },
      tags: { Owner: 'base' },
    });
  });

  test('arrays replace, they do not concatenate', () => {
    expect(deepMerge<Record<string, unknown>>({ zones: ['a', 'b'] }, { zones: ['c'] })).toEqual({ zones: ['c'] });
  });

  test('undefined on the override does not clobber a base value', () => {
    expect(deepMerge<Record<string, unknown>>({ a: 'keep' }, { a: undefined })).toEqual({ a: 'keep' });
  });

  test('a __proto__ key cannot pollute', () => {
    // JSON.parse produces an OWN enumerable `__proto__` property, which a naive merge would apply.
    const override = JSON.parse('{"__proto__": {"polluted": "yes"}, "safe": "ok"}');

    const merged = deepMerge<Record<string, unknown>>({}, override);

    expect(merged.safe).toBe('ok');
    expect(Object.prototype.hasOwnProperty.call(merged, 'polluted')).toBe(false);
    expect((merged as { polluted?: string }).polluted).toBeUndefined();
    expect(({} as { polluted?: string }).polluted).toBeUndefined();
  });

  test('a nested __proto__ key cannot pollute either', () => {
    // The dangerous path is a key the BASE does not have: the override's subtree is walked rather than
    // assigned wholesale, so the UNSAFE_KEYS filter still applies below the top level. Every
    // application-specific group takes this path, because the base schema only knows three keys.
    const override = JSON.parse('{"custom": {"__proto__": {"polluted": "yes"}, "safe": "ok"}}');

    const merged = deepMerge<Record<string, unknown>>({}, override);

    const custom = merged.custom as Record<string, unknown>;
    expect(custom.safe).toBe('ok');
    expect(Object.prototype.hasOwnProperty.call(custom, 'polluted')).toBe(false);
    // Read THROUGH the prototype chain, not just own keys: a guard that fails to filter at depth
    // assigns result['__proto__'] = <subtree>, which leaves hasOwnProperty false yet resolves
    // `custom.polluted` to 'yes' via the chain. Without this line the test passes with the guard off.
    expect((custom as { polluted?: string }).polluted).toBeUndefined();
    expect(({} as { polluted?: string }).polluted).toBeUndefined();
  });

  test('the override object is not aliased into the result', () => {
    // Same fix, other consequence: assigning a subtree wholesale would let a later mutation of the
    // caller's parsed config show up in an already-merged config.
    const override = { custom: { keep: 'yes' } };

    const merged = deepMerge<Record<string, unknown>>({}, override);

    expect(merged.custom).not.toBe(override.custom);
    expect(merged.custom).toEqual({ keep: 'yes' });
  });
});

describe('appconfig-base-defaults', () => {
  test('base defaults retain stateful resources', () => {
    expect(getDefaultConfig()).toEqual({
      aws: {},
      tags: {},
      removalPolicies: {
        dynamoDBTable: RemovalPolicyValue.RETAIN,
        s3Bucket: RemovalPolicyValue.RETAIN,
      },
    });
  });
});

describe('appconfig-derived-defaults', () => {
  test('environment fills a missing account and region', () => {
    const resolved = applyDerivedDefaults<Record<string, unknown>>(
      { aws: {} },
      { CDK_DEFAULT_ACCOUNT: '111111111111', CDK_DEFAULT_REGION: 'us-west-2' },
    );

    expect(resolved.aws).toEqual({ accountId: '111111111111', region: 'us-west-2' });
  });

  test('region falls back to AWS_REGION', () => {
    const resolved = applyDerivedDefaults<Record<string, unknown>>({ aws: {} }, { AWS_REGION: 'eu-central-1' });

    expect(resolved.aws).toEqual({ region: 'eu-central-1' });
  });

  test('an explicit config value is not overridden', () => {
    const resolved = applyDerivedDefaults<Record<string, unknown>>(
      { aws: { accountId: '222222222222', region: 'us-east-1' } },
      { CDK_DEFAULT_ACCOUNT: '111111111111', CDK_DEFAULT_REGION: 'us-west-2' },
    );

    expect(resolved.aws).toEqual({ accountId: '222222222222', region: 'us-east-1' });
  });

  test('an empty environment leaves the aws group untouched', () => {
    expect(applyDerivedDefaults<Record<string, unknown>>({ application: 'demo' }, {})).toEqual({
      application: 'demo',
      aws: {},
    });
  });
});
