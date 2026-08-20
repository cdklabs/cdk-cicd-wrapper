// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { App, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AppConfig, ConfigError, ConfigErrorKind, ConfigSchema, FieldKind } from '../../../src/v3/appconfig';

/** EXAMPLE caller-supplied schema; the wrapper ships no tables of its own. */
const SCHEMA: ConfigSchema = {
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
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-cicd-accessor-'));
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('appconfig-accessor-context', () => {
  test('reads the injected config out of construct context', () => {
    const app = new App({
      context: { [AppConfig.CONTEXT_KEY]: { application: 'from-context', aws: { accountId: '111111111111' } } },
    });
    const stack = new Stack(app, 'Stack');

    expect(AppConfig.of(stack, { schema: SCHEMA })).toEqual({
      application: 'from-context',
      aws: { accountId: '111111111111' },
    });
  });

  test('an injected config is validated too', () => {
    // The context can also be set by hand in cdk.json or with --context, so a bad hand-written value
    // has to fail the same way a bad config file does rather than being trusted.
    const app = new App({ context: { [AppConfig.CONTEXT_KEY]: { aws: { accountId: '111111111111' } } } });
    const stack = new Stack(app, 'Stack');

    expectKind(() => AppConfig.of(stack, { schema: SCHEMA }), ConfigErrorKind.MISSING_ATTRIBUTE);
  });

  test('a non-object context value raises PARSE_ERROR', () => {
    for (const bad of ['a string', 42, ['an', 'array'], true]) {
      const app = new App({ context: { [AppConfig.CONTEXT_KEY]: bad } });
      const stack = new Stack(app, 'Stack');

      expectKind(() => AppConfig.of(stack), ConfigErrorKind.PARSE_ERROR);
    }
  });

  test('context is inherited by nested scopes', () => {
    const app = new App({ context: { [AppConfig.CONTEXT_KEY]: { application: 'nested' } } });
    const stack = new Stack(app, 'Stack');
    const nested = new Construct(stack, 'Child');

    expect(AppConfig.of(nested, { schema: SCHEMA }).application).toBe('nested');
  });
});

describe('appconfig-accessor-file-fallback', () => {
  test('falls back to loading the file when nothing was injected', () => {
    const filePath = writeConfig('fallback.json', JSON.stringify({ application: 'from-file' }));
    const stack = new Stack(new App(), 'Stack');

    expect(AppConfig.of(stack, { configFile: filePath, schema: SCHEMA }).application).toBe('from-file');
  });

  test('a null context value also falls back to the file', () => {
    // `"cicd:config": null` in cdk.json is indistinguishable from "not set" as far as intent goes.
    const filePath = writeConfig('null-context.json', JSON.stringify({ application: 'from-file' }));
    const app = new App({ context: { [AppConfig.CONTEXT_KEY]: null } });
    const stack = new Stack(app, 'Stack');

    expect(AppConfig.of(stack, { configFile: filePath, schema: SCHEMA }).application).toBe('from-file');
  });

  test('the file failure surfaces unchanged through the accessor', () => {
    const stack = new Stack(new App(), 'Stack');

    expectKind(
      () => AppConfig.of(stack, { configFile: path.join(tempDir, 'nope.json'), schema: SCHEMA }),
      ConfigErrorKind.MISSING_FILE,
    );
  });

  test('load() works with no construct at all', () => {
    const filePath = writeConfig('standalone.json', JSON.stringify({ application: 'standalone' }));

    expect(AppConfig.load({ configFile: filePath, schema: SCHEMA }).application).toBe('standalone');
  });

  test('stage drives path resolution, and configFile overrides stage', () => {
    const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-cicd-accessor-stage-'));
    const originalCwd = process.cwd();
    fs.mkdirSync(path.join(stageDir, 'config'));
    fs.writeFileSync(path.join(stageDir, 'config', 'dev.json'), JSON.stringify({ application: 'dev-stage' }), 'utf-8');
    const explicit = writeConfig('explicit.json', JSON.stringify({ application: 'explicit' }));

    try {
      process.chdir(stageDir);
      expect(AppConfig.load({ stage: 'dev', schema: SCHEMA }).application).toBe('dev-stage');
      expect(AppConfig.load({ stage: 'dev', configFile: explicit, schema: SCHEMA }).application).toBe('explicit');
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(stageDir, { recursive: true, force: true });
    }
  });

  test('the ambient process environment is not mutated', () => {
    const filePath = writeConfig('no-leak.json', JSON.stringify({ application: 'demo' }));
    const before = { stage: process.env.CDK_STAGE, file: process.env.CONFIG_FILE };

    AppConfig.load({ stage: 'prod', configFile: filePath, schema: SCHEMA });

    expect(process.env.CDK_STAGE).toBe(before.stage);
    expect(process.env.CONFIG_FILE).toBe(before.file);
  });
});
