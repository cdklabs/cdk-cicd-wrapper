// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// PENDING IMPLEMENTATION — Python CI support (see .python-support/04-adoption-notes.md).
// Language-detection spec for detectCiLanguage()/languageOf(). Fully stable across the CDK_CICD_MODE
// synth-seam redesign: detection only reads `cdk.json`'s `app` command, which is unchanged by that work.
// The single wrapper entry point is `npm run cdk-cicd exec bin/app.ts` (preferred) or `npx cdk-cicd exec
// bin/app.ts`; detection must see through that prefix to the underlying interpreter, AND handle the plain
// standalone forms (`python3 app.py`, `uv run python app.py`) the samples use.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CiLanguage } from '../../src/config/types';
import { detectCiLanguage, languageOf } from '../../src/engine/ci-commands';

/** Write a cdk.json with the given `app` command into a fresh scratch dir and return its path. */
function scratchWithApp(app: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-cicd-detect-'));
  fs.writeFileSync(path.join(dir, 'cdk.json'), JSON.stringify({ app, output: 'cdk.out' }));
  return dir;
}

describe('detectCiLanguage', () => {
  const cleanup: string[] = [];
  afterAll(() => cleanup.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
  const detect = (app: string): CiLanguage => {
    const dir = scratchWithApp(app);
    cleanup.push(dir);
    return detectCiLanguage(dir);
  };

  test('PYTHON for a standalone python app command', () => {
    expect(detect('python3 app.py')).toBe(CiLanguage.PYTHON);
    expect(detect('python app.py')).toBe(CiLanguage.PYTHON);
  });

  test('PYTHON for a uv-run python app command', () => {
    expect(detect('uv run python app.py')).toBe(CiLanguage.PYTHON);
  });

  test('PYTHON for a python app run through the wrapper exec entry point', () => {
    // The single wrapper entry point still names the underlying python interpreter.
    expect(detect('npm run cdk-cicd exec python3 app.py')).toBe(CiLanguage.PYTHON);
    expect(detect('npx cdk-cicd exec uv run python app.py')).toBe(CiLanguage.PYTHON);
  });

  test('NODE for a TypeScript/node app command', () => {
    expect(detect('npx ts-node bin/app.ts')).toBe(CiLanguage.NODE);
    expect(detect('node bin/app.js')).toBe(CiLanguage.NODE);
    expect(detect('npm run cdk-cicd exec bin/app.ts')).toBe(CiLanguage.NODE);
  });

  test('NODE for an unrecognized command', () => {
    expect(detect('bash run.sh')).toBe(CiLanguage.NODE);
  });

  test('NODE and NEVER throws when cdk.json is missing or unparseable', () => {
    const missing = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-cicd-detect-none-'));
    cleanup.push(missing);
    expect(() => detectCiLanguage(missing)).not.toThrow();
    expect(detectCiLanguage(missing)).toBe(CiLanguage.NODE);

    const broken = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-cicd-detect-bad-'));
    cleanup.push(broken);
    fs.writeFileSync(path.join(broken, 'cdk.json'), '{ not json');
    expect(() => detectCiLanguage(broken)).not.toThrow();
    expect(detectCiLanguage(broken)).toBe(CiLanguage.NODE);
  });
});

describe('languageOf — explicit override beats detection', () => {
  test('explicit PYTHON wins even when cdk.json is a Node app', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-cicd-override-'));
    fs.writeFileSync(path.join(dir, 'cdk.json'), JSON.stringify({ app: 'npx ts-node bin/app.ts' }));
    try {
      expect(languageOf(CiLanguage.PYTHON, dir)).toBe(CiLanguage.PYTHON);
      expect(languageOf(undefined, dir)).toBe(CiLanguage.NODE); // detection path
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
