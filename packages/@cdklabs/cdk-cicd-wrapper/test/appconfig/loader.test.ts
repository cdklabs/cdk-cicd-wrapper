// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ConfigError,
  ConfigErrorKind,
  ConfigLoader,
  ConfigSchema,
  FieldKind,
  RemovalPolicyValue,
} from '../../src/appconfig';

/** EXAMPLE caller-supplied schema; the wrapper ships no tables of its own. */
const SCHEMA: ConfigSchema = {
  requiredKeys: [{ path: 'aws.accountId', kind: FieldKind.STRING }],
  requiredAttributes: [{ path: 'application', kind: FieldKind.STRING }],
};

let tempDir: string;

function writeConfig(fileName: string, contents: string): string {
  const filePath = path.join(tempDir, fileName);
  fs.writeFileSync(filePath, contents, 'utf-8');
  return filePath;
}

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

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-cicd-appconfig-'));
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('appconfig-resolve-path', () => {
  test('CONFIG_FILE wins and is trimmed', () => {
    expect(ConfigLoader.resolvePath({ CONFIG_FILE: '  /tmp/explicit.yaml  ', CDK_STAGE: 'dev' })).toBe(
      '/tmp/explicit.yaml',
    );
  });

  test('a blank CONFIG_FILE is ignored', () => {
    expect(ConfigLoader.resolvePath({ CONFIG_FILE: '   ', CDK_STAGE: 'dev' })).toBe(path.join('config', 'dev.json'));
  });

  test('CDK_STAGE derives the path', () => {
    expect(ConfigLoader.resolvePath({ CDK_STAGE: 'prod' })).toBe(path.join('config', 'prod.json'));
  });

  test('an unset CDK_STAGE falls back to local', () => {
    expect(ConfigLoader.resolvePath({})).toBe(path.join('config', 'local.json'));
    expect(ConfigLoader.resolvePath({ CDK_STAGE: '  ' })).toBe(path.join('config', 'local.json'));
  });

  test('never throws, even on a fully empty environment', () => {
    expect(() => ConfigLoader.resolvePath({})).not.toThrow();
    expect(ConfigLoader.resolvePath({}).length).toBeGreaterThan(0);
  });
});

describe('appconfig-resolve-path-extension-probing', () => {
  // Extension probing is relative to the process cwd, so this block runs from a throwaway directory.
  const originalCwd = process.cwd();
  let probeDir: string;

  beforeAll(() => {
    probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-cicd-appconfig-probe-'));
    fs.mkdirSync(path.join(probeDir, 'config'));
    process.chdir(probeDir);
  });

  afterAll(() => {
    process.chdir(originalCwd);
    fs.rmSync(probeDir, { recursive: true, force: true });
  });

  test('an existing .yaml is preferred over the non-existent .json', () => {
    fs.writeFileSync(path.join(probeDir, 'config', 'dev.yaml'), 'application: demo\n', 'utf-8');

    expect(ConfigLoader.resolvePath({ CDK_STAGE: 'dev' })).toBe(path.join('config', 'dev.yaml'));
  });

  test('an existing .json wins over an existing .yaml', () => {
    fs.writeFileSync(path.join(probeDir, 'config', 'int.yaml'), 'application: demo\n', 'utf-8');
    fs.writeFileSync(path.join(probeDir, 'config', 'int.json'), '{}', 'utf-8');

    expect(ConfigLoader.resolvePath({ CDK_STAGE: 'int' })).toBe(path.join('config', 'int.json'));
  });

  test('.yml is probed last, after .yaml', () => {
    // Both on disk, so this pins the ORDER. With only the .yml written it would merely prove .yml is
    // probed at all, and reordering CONFIG_EXTENSIONS would keep the test green.
    fs.writeFileSync(path.join(probeDir, 'config', 'qa.yaml'), 'application: demo\n', 'utf-8');
    fs.writeFileSync(path.join(probeDir, 'config', 'qa.yml'), 'application: demo\n', 'utf-8');

    expect(ConfigLoader.resolvePath({ CDK_STAGE: 'qa' })).toBe(path.join('config', 'qa.yaml'));
  });

  test('.yml is used when it is the only file present', () => {
    fs.writeFileSync(path.join(probeDir, 'config', 'uat.yml'), 'application: demo\n', 'utf-8');

    expect(ConfigLoader.resolvePath({ CDK_STAGE: 'uat' })).toBe(path.join('config', 'uat.yml'));
  });

  test('with nothing on disk the .json path is returned so the caller reports MISSING_FILE', () => {
    expect(ConfigLoader.resolvePath({ CDK_STAGE: 'nowhere' })).toBe(path.join('config', 'nowhere.json'));
  });
});

describe('appconfig-load', () => {
  test('layers base defaults under the config file and derives account/region', () => {
    const filePath = writeConfig(
      'complete.json',
      JSON.stringify({ application: 'demo', tags: { Owner: 'team' }, removalPolicies: { s3Bucket: 'destroy' } }),
    );

    const config = ConfigLoader.load({
      env: { CONFIG_FILE: filePath, CDK_DEFAULT_ACCOUNT: '111111111111', CDK_DEFAULT_REGION: 'us-west-2' },
      schema: SCHEMA,
    });

    expect(config).toEqual({
      application: 'demo',
      aws: { accountId: '111111111111', region: 'us-west-2' },
      tags: { Owner: 'team' },
      removalPolicies: {
        dynamoDBTable: RemovalPolicyValue.RETAIN,
        s3Bucket: RemovalPolicyValue.DESTROY,
      },
      logRetentionInDays: 365,
    });
  });

  test('the file wins over a base default it collides with', () => {
    const filePath = writeConfig(
      'override-default.json',
      JSON.stringify({ application: 'demo', removalPolicies: { dynamoDBTable: 'destroy' } }),
    );

    const config = ConfigLoader.load<{ removalPolicies: Record<string, string> }>({
      env: { CONFIG_FILE: filePath, CDK_DEFAULT_ACCOUNT: '111111111111' },
      schema: SCHEMA,
    });

    // s3Bucket keeps the base default; dynamoDBTable is overridden despite the base defaulting to RETAIN.
    expect(config.removalPolicies).toEqual({
      dynamoDBTable: RemovalPolicyValue.DESTROY,
      s3Bucket: RemovalPolicyValue.RETAIN,
    });
  });

  test('a YAML-blank aws block still receives the derived account and region', () => {
    // `aws:` with nothing under it parses to null, not {}, so the derived-defaults step has to treat
    // null exactly like an absent key or the account never gets filled in.
    const filePath = writeConfig('blank-aws.yaml', 'application: demo\naws:\n');

    const config = ConfigLoader.load<{ aws: { accountId: string; region: string } }>({
      env: { CONFIG_FILE: filePath, CDK_DEFAULT_ACCOUNT: '111111111111', CDK_DEFAULT_REGION: 'us-west-2' },
      schema: SCHEMA,
    });

    expect(config.aws).toEqual({ accountId: '111111111111', region: 'us-west-2' });
  });

  test('a YAML-blank accountId inside an otherwise populated aws block is derived too', () => {
    const filePath = writeConfig('blank-account.yaml', 'application: demo\naws:\n  accountId:\n  region: eu-west-1\n');

    const config = ConfigLoader.load<{ aws: { accountId: string; region: string } }>({
      env: { CONFIG_FILE: filePath, CDK_DEFAULT_ACCOUNT: '111111111111', CDK_DEFAULT_REGION: 'us-west-2' },
      schema: SCHEMA,
    });

    // The file's explicit region wins; only the blank accountId falls back to the environment.
    expect(config.aws).toEqual({ accountId: '111111111111', region: 'eu-west-1' });
  });

  test('an unquoted YAML account id raises MISSING_KEY rather than being coerced', () => {
    // 111111111111 unquoted is a YAML number. Coercing it would silently corrupt a leading-zero
    // account id, so the loader must reject it and say so.
    const filePath = writeConfig('numeric-account.yaml', 'application: demo\naws:\n  accountId: 111111111111\n');

    expectKind(
      () => ConfigLoader.load({ env: { CONFIG_FILE: filePath }, schema: SCHEMA }),
      ConfigErrorKind.MISSING_KEY,
    );
  });

  test('JSON and YAML inputs load identically', () => {
    const jsonPath = writeConfig(
      'same.json',
      JSON.stringify({
        application: 'demo',
        aws: { accountId: '111111111111', region: 'us-west-2' },
        tags: { Owner: 'team' },
        networking: { vpcId: 'vpc-1', availabilityZones: ['us-west-2a', 'us-west-2b'] },
      }),
    );
    const yamlPath = writeConfig(
      'same.yaml',
      [
        'application: demo',
        'aws:',
        "  accountId: '111111111111'",
        '  region: us-west-2',
        'tags:',
        '  Owner: team',
        'networking:',
        '  vpcId: vpc-1',
        '  availabilityZones:',
        '    - us-west-2a',
        '    - us-west-2b',
        '',
      ].join('\n'),
    );

    const fromJson = ConfigLoader.load({ env: { CONFIG_FILE: jsonPath }, schema: SCHEMA });
    const fromYaml = ConfigLoader.load({ env: { CONFIG_FILE: yamlPath }, schema: SCHEMA });

    expect(fromYaml).toEqual(fromJson);
  });

  test('a .yml file is parsed as YAML', () => {
    const filePath = writeConfig('short.yml', "application: demo\naws:\n  accountId: '111111111111'\n");

    expect(
      ConfigLoader.load<{ application: string }>({ env: { CONFIG_FILE: filePath }, schema: SCHEMA }).application,
    ).toBe('demo');
  });

  test('an absent file raises MISSING_FILE', () => {
    expectKind(
      () => ConfigLoader.load({ env: { CONFIG_FILE: path.join(tempDir, 'does-not-exist.json') }, schema: SCHEMA }),
      ConfigErrorKind.MISSING_FILE,
    );
  });

  test('malformed JSON raises PARSE_ERROR', () => {
    const filePath = writeConfig('broken.json', '{ "application": ');

    expectKind(
      () => ConfigLoader.load({ env: { CONFIG_FILE: filePath }, schema: SCHEMA }),
      ConfigErrorKind.PARSE_ERROR,
    );
  });

  test('malformed YAML raises PARSE_ERROR', () => {
    const filePath = writeConfig('broken.yaml', 'application: demo\n  - not: valid\n');

    expectKind(
      () => ConfigLoader.load({ env: { CONFIG_FILE: filePath }, schema: SCHEMA }),
      ConfigErrorKind.PARSE_ERROR,
    );
  });

  test('a missing required key raises MISSING_KEY', () => {
    const filePath = writeConfig('no-account.json', JSON.stringify({ application: 'demo' }));

    expectKind(
      () => ConfigLoader.load({ env: { CONFIG_FILE: filePath }, schema: SCHEMA }),
      ConfigErrorKind.MISSING_KEY,
    );
  });

  test('a missing required attribute raises MISSING_ATTRIBUTE', () => {
    const filePath = writeConfig('no-application.json', JSON.stringify({ aws: { accountId: '111111111111' } }));

    expectKind(
      () => ConfigLoader.load({ env: { CONFIG_FILE: filePath }, schema: SCHEMA }),
      ConfigErrorKind.MISSING_ATTRIBUTE,
    );
  });

  test('a non-object document falls back to the base defaults', () => {
    const filePath = writeConfig('scalar.yaml', 'just-a-string\n');

    expect(ConfigLoader.load({ env: { CONFIG_FILE: filePath } })).toEqual({
      aws: {},
      tags: {},
      removalPolicies: {
        dynamoDBTable: RemovalPolicyValue.RETAIN,
        s3Bucket: RemovalPolicyValue.RETAIN,
      },
      logRetentionInDays: 365,
    });
  });
});
