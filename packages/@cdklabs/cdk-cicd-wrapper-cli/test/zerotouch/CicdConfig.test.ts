// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { discover, load, loadDeployment, stageByName } from '../../src/cmds/zerotouch/CicdConfig';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cicd-config-'));
}

describe('m3-config-discovery: discover', () => {
  test('returns undefined when there is no config (Level 0)', () => {
    expect(discover(tempDir())).toBeUndefined();
  });

  test('prefers cicd.config.ts over cicd.config.js', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'cicd.config.ts'), '');
    fs.writeFileSync(path.join(dir, 'cicd.config.js'), '');
    expect(discover(dir)).toBe(path.join(dir, 'cicd.config.ts'));
  });

  test('finds cicd.config.js when it is the only candidate', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'cicd.config.js'), '');
    expect(discover(dir)).toBe(path.join(dir, 'cicd.config.js'));
  });
});

describe('m3-config-discovery: load + stageByName', () => {
  // Exercise the loader mechanics (default extraction, stage lookup) against a compiled-style .js
  // config -- no ts-node needed. The .ts authoring path is proven at synth level by the harness.
  const CONFIG = {
    application: 'shop',
    qualifier: 'shop',
    repository: { repositoryType: 'github', name: 'org/shop', branch: 'main' },
    stages: [
      { name: 'dev', env: { regions: ['us-west-2'], regionOrder: 'sequential' }, manualApproval: false },
      { name: 'prod', env: { regions: ['us-west-1'], regionOrder: 'sequential' }, manualApproval: true },
    ],
    synthesizer: { type: 'default' },
  };

  function writeJsConfig(): string {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'cicd.config.js'), `module.exports.default = ${JSON.stringify(CONFIG)};`);
    return dir;
  }

  test('returns undefined when no config file exists', () => {
    expect(load(tempDir())).toBeUndefined();
  });

  test('loads the default export of a .js config', () => {
    const cfg = load(writeJsConfig());
    expect(cfg?.application).toBe('shop');
    expect(cfg?.stages.map((s) => s.name)).toEqual(['dev', 'prod']);
  });

  test('stageByName finds a stage and returns undefined for an unknown one', () => {
    const cfg = load(writeJsConfig())!;
    expect(stageByName(cfg, 'prod')?.manualApproval).toBe(true);
    expect(stageByName(cfg, 'nope')).toBeUndefined();
  });

  test('loads a TypeScript config through the ts-node require path (the primary path users hit)', () => {
    // Covers the .ts branch (ts-node register + require) directly, not just the .js mechanics. Kept
    // wrapper-import-free so it exercises the loader, not defineCICD.
    const dir = tempDir();
    fs.writeFileSync(
      path.join(dir, 'cicd.config.ts'),
      "export default { application: 'from-ts', stages: [{ name: 'dev' }] } as any;\n",
    );
    const cfg = load(dir);
    expect(cfg?.application).toBe('from-ts');
    expect(cfg?.stages[0].name).toBe('dev');
  });
});

describe('m6-container: loadDeployment (Repo 2 deploy.config discovery)', () => {
  // Mirrors the cicd.config loader tests: probe order, default extraction, absent-file, and that
  // deploy.config is a SEPARATE file from cicd.config (finding a cicd.config must not satisfy it).
  const DEPLOYMENT = {
    image: 'acct.dkr.ecr.eu-west-1.amazonaws.com/my-app-deployer:1.4.2',
    targets: [{ stage: 'dev', env: { regions: ['us-west-2'], regionOrder: 'sequential' }, manualApproval: false }],
  };

  test('returns undefined when there is no deploy.config (not in container mode)', () => {
    expect(loadDeployment(tempDir())).toBeUndefined();
  });

  test('a cicd.config alone does not satisfy loadDeployment', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'cicd.config.js'), 'module.exports.default = {};');
    expect(loadDeployment(dir)).toBeUndefined();
  });

  test('loads the default export of a .js deploy.config', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'deploy.config.js'), `module.exports.default = ${JSON.stringify(DEPLOYMENT)};`);
    const cfg = loadDeployment(dir);
    expect(cfg?.image).toBe('acct.dkr.ecr.eu-west-1.amazonaws.com/my-app-deployer:1.4.2');
    expect(cfg?.targets.map((t) => t.stage)).toEqual(['dev']);
  });

  test('prefers deploy.config.ts over deploy.config.js', () => {
    const dir = tempDir();
    fs.writeFileSync(
      path.join(dir, 'deploy.config.ts'),
      "export default { image: 'from-ts:1', targets: [] } as any;\n",
    );
    fs.writeFileSync(path.join(dir, 'deploy.config.js'), `module.exports.default = ${JSON.stringify(DEPLOYMENT)};`);
    expect(loadDeployment(dir)?.image).toBe('from-ts:1');
  });

  test('loads a TypeScript deploy.config through the ts-node require path', () => {
    const dir = tempDir();
    fs.writeFileSync(
      path.join(dir, 'deploy.config.ts'),
      "export default { image: 'img:ts', targets: [{ stage: 'dev' }] } as any;\n",
    );
    const cfg = loadDeployment(dir);
    expect(cfg?.image).toBe('img:ts');
    expect(cfg?.targets[0].stage).toBe('dev');
  });
});
