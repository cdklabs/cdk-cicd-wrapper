// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Unit tests for `cdk-cicd pipeline-app`'s pure logic: resolving the bin entry a self-mutating engine
// must replay. Actually synthesizing a pipeline (which needs aws-cdk-lib and, for a self-mutating
// engine, replays the bin) is proven by the m4-verify real-AWS gate, not here.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveEntry } from '../../src/cmds/autopilot/PipelineAppCommand';

describe('pipeline-app: resolveEntry', () => {
  const mkCwd = (cdkJson?: object): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-app-'));
    if (cdkJson !== undefined) {
      fs.writeFileSync(path.join(dir, 'cdk.json'), JSON.stringify(cdkJson));
    }
    return dir;
  };

  test('an explicit --entry override wins over cdk.json', () => {
    const dir = mkCwd({ app: 'npx cdk-cicd exec bin/other.ts' });
    try {
      expect(resolveEntry(dir, 'bin/override.ts')).toBe('bin/override.ts');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('extracts the entry from a cdk.json `cdk-cicd exec <entry>` app command', () => {
    const dir = mkCwd({ app: 'npx cdk-cicd exec bin/app.ts' });
    try {
      expect(resolveEntry(dir)).toBe('bin/app.ts');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('tolerates extra tokens/flags around the exec command', () => {
    const dir = mkCwd({ app: 'npx cdk-cicd exec dist/app.js --some-flag' });
    try {
      expect(resolveEntry(dir)).toBe('dist/app.js');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('throws a clear error when cdk.json is absent and no --entry is given', () => {
    const dir = mkCwd();
    try {
      expect(() => resolveEntry(dir)).toThrow(/cannot determine the app entry|--entry/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('throws when cdk.json app does not use `cdk-cicd exec`', () => {
    const dir = mkCwd({ app: 'npx ts-node bin/app.ts' });
    try {
      expect(() => resolveEntry(dir)).toThrow(/cannot determine the app entry|--entry/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
