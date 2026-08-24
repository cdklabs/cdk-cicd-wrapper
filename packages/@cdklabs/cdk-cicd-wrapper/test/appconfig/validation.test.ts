// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { ConfigError, ConfigErrorKind, ConfigSchema, FieldKind, validateConfig } from '../../src/appconfig';
import { getByPath, isMissing } from '../../src/appconfig/validation';

/**
 * An EXAMPLE application schema — the wrapper never hardcodes tables like these; the caller supplies
 * them. It exercises all three table kinds.
 */
const EXAMPLE_SCHEMA: ConfigSchema = {
  requiredKeys: [{ path: 'aws.accountId', kind: FieldKind.STRING }],
  requiredAttributes: [
    { path: 'networking.vpcId', kind: FieldKind.STRING },
    { path: 'networking.availabilityZones', kind: FieldKind.STRING_LIST },
  ],
  conditionalGroups: [
    {
      when: 'networking.secondary',
      fields: [
        { path: 'networking.secondary.vpcId', kind: FieldKind.STRING },
        { path: 'networking.secondary.subnetIds', kind: FieldKind.STRING_LIST },
      ],
    },
  ],
};

const VALID_CONFIG = {
  aws: { accountId: '111111111111' },
  networking: { vpcId: 'vpc-1', availabilityZones: ['us-west-2a'] },
};

function expectKind(action: () => unknown, kind: ConfigErrorKind): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).kind).toBe(kind);
    return;
  }
  throw new Error(`Expected a ConfigError of kind ${kind}`);
}

describe('appconfig-get-by-path', () => {
  test('reads a nested dot-path and returns undefined off the tree', () => {
    expect(getByPath({ a: { b: { c: 'value' } } }, 'a.b.c')).toBe('value');
    expect(getByPath({ a: { b: 'scalar' } }, 'a.b.c')).toBeUndefined();
    expect(getByPath({ a: ['x'] }, 'a.b')).toBeUndefined();
    expect(getByPath({}, 'missing')).toBeUndefined();
  });
});

describe('appconfig-is-missing', () => {
  test('blank and whitespace-only strings count as missing', () => {
    expect(isMissing('', FieldKind.STRING)).toBe(true);
    expect(isMissing('   ', FieldKind.STRING)).toBe(true);
    expect(isMissing('value', FieldKind.STRING)).toBe(false);
  });

  test('empty arrays count as missing', () => {
    expect(isMissing([], FieldKind.STRING_LIST)).toBe(true);
    expect(isMissing(['a'], FieldKind.STRING_LIST)).toBe(false);
    expect(isMissing('not-an-array', FieldKind.STRING_LIST)).toBe(true);
  });

  test('undefined and null count as missing for every kind', () => {
    expect(isMissing(undefined, FieldKind.STRING)).toBe(true);
    expect(isMissing(null, FieldKind.STRING_LIST)).toBe(true);
  });
});

describe('appconfig-validate', () => {
  test('a complete config validates', () => {
    expect(validateConfig(VALID_CONFIG, 'config/local.json', EXAMPLE_SCHEMA)).toEqual(VALID_CONFIG);
  });

  test('an empty schema accepts anything', () => {
    expect(validateConfig({ anything: true }, 'config/local.json')).toEqual({ anything: true });
  });

  test('a blank required key raises MISSING_KEY', () => {
    expectKind(
      () => validateConfig({ ...VALID_CONFIG, aws: { accountId: '  ' } }, 'config/local.json', EXAMPLE_SCHEMA),
      ConfigErrorKind.MISSING_KEY,
    );
  });

  test('a missing required attribute raises MISSING_ATTRIBUTE', () => {
    expectKind(
      () =>
        validateConfig(
          { aws: { accountId: '111111111111' }, networking: { vpcId: 'vpc-1', availabilityZones: [] } },
          'config/local.json',
          EXAMPLE_SCHEMA,
        ),
      ConfigErrorKind.MISSING_ATTRIBUTE,
    );
  });

  test('a value of the wrong type is reported the same as an absent one', () => {
    // An unquoted 12-digit account id in YAML parses to a NUMBER, which is the realistic way this
    // fires. It must not slip through a STRING field just because the key exists.
    expectKind(
      () => validateConfig({ ...VALID_CONFIG, aws: { accountId: 111111111111 } }, 'config/dev.yaml', EXAMPLE_SCHEMA),
      ConfigErrorKind.MISSING_KEY,
    );
  });

  test('the error message names the offending path and the source file', () => {
    expect(() => validateConfig({}, 'config/dev.yaml', EXAMPLE_SCHEMA)).toThrow(
      "Missing or malformed required config key 'aws.accountId' in config/dev.yaml (expected string)",
    );
  });

  test('a conditional group is not required while its activating path is absent', () => {
    // The activating path really is missing here, otherwise this passes for the same reason
    // 'a complete config validates' does and proves nothing about conditional groups.
    expect(getByPath(VALID_CONFIG, 'networking.secondary')).toBeUndefined();
    expect(() => validateConfig(VALID_CONFIG, 'config/local.json', EXAMPLE_SCHEMA)).not.toThrow();
  });

  test('a null activating path does not activate the group', () => {
    // `secondary:` with nothing under it is how YAML spells "I did not configure this". Treating null
    // as present would demand vpcId/subnetIds under a key the author explicitly left blank.
    expect(() =>
      validateConfig(
        { ...VALID_CONFIG, networking: { ...VALID_CONFIG.networking, secondary: null } },
        'config/dev.yaml',
        EXAMPLE_SCHEMA,
      ),
    ).not.toThrow();
  });

  test('a present but incomplete conditional group raises MISSING_ATTRIBUTE', () => {
    expectKind(
      () =>
        validateConfig(
          {
            ...VALID_CONFIG,
            networking: { ...VALID_CONFIG.networking, secondary: { vpcId: 'vpc-2' } },
          },
          'config/local.json',
          EXAMPLE_SCHEMA,
        ),
      ConfigErrorKind.MISSING_ATTRIBUTE,
    );
  });

  test('a complete conditional group validates', () => {
    expect(() =>
      validateConfig(
        {
          ...VALID_CONFIG,
          networking: { ...VALID_CONFIG.networking, secondary: { vpcId: 'vpc-2', subnetIds: ['subnet-1'] } },
        },
        'config/local.json',
        EXAMPLE_SCHEMA,
      ),
    ).not.toThrow();
  });

  test('a non-object payload validates as an empty object', () => {
    expect(validateConfig(['not', 'an', 'object'], 'config/local.json')).toEqual({});
    expect(validateConfig(null, 'config/local.json')).toEqual({});
  });
});
