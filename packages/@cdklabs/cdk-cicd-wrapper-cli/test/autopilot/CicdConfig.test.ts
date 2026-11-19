// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  discover,
  load,
  loadDeployment,
  stageByName,
  TS_NODE_COMPILER_OPTIONS,
  tsNodeCompilerOptions,
  tsNodeRegister,
  typeScriptCompiler,
} from '../../src/cmds/autopilot/CicdConfig';

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

  test('propagates a syntax error from an existing config', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'cicd.config.js'), 'module.exports.default = {');
    expect(() => load(dir)).toThrow();
  });

  test('propagates an import error from an existing config', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'cicd.config.js'), "require('./missing-config-dependency');");
    expect(() => load(dir)).toThrow(/missing-config-dependency/);
  });

  test('propagates validation failures raised while evaluating an existing config', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'cicd.config.js'), "throw new Error('config validation failed');");
    expect(() => load(dir)).toThrow(/config validation failed/);
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

describe('account and Region from config/<stage>.json', () => {
  const target = (stage: string, env: object = {}) => ({
    stage,
    env: { regions: [], regionOrder: 'sequential', ...env },
    manualApproval: true,
  });
  const repoWith = (targets: object[], files: Record<string, unknown>) => {
    const dir = tempDir();
    fs.writeFileSync(
      path.join(dir, 'deploy.config.js'),
      `module.exports.default = ${JSON.stringify({ image: 'img:1', targets })};`,
    );
    fs.mkdirSync(path.join(dir, 'config'));
    for (const [stage, body] of Object.entries(files)) {
      fs.writeFileSync(
        path.join(dir, 'config', `${stage}.json`),
        typeof body === 'string' ? body : JSON.stringify(body),
      );
    }
    return dir;
  };

  test('fills a target that leaves account and Region out', () => {
    const dir = repoWith([target('int')], {
      int: { version: '0.1.0', aws: { accountId: '222222222222', region: 'eu-west-1' } },
    });
    expect(loadDeployment(dir)?.targets[0].env).toEqual({
      account: '222222222222',
      regions: ['eu-west-1'],
      regionOrder: 'sequential',
    });
  });

  test('a matching value is fine; deploy.config values are kept when the file has none', () => {
    const dir = repoWith(
      [target('int', { account: '222222222222', regions: ['eu-west-1'] }), target('prod', { account: '333333333333' })],
      { int: { aws: { accountId: '222222222222', region: 'eu-west-1' } }, prod: { version: '1.0.0' } },
    );
    const [int, prod] = loadDeployment(dir)!.targets;
    expect(int.env.account).toBe('222222222222');
    expect(prod.env).toEqual({ account: '333333333333', regions: [], regionOrder: 'sequential' });
  });

  test('a file that disagrees with the target fails instead of being ignored', () => {
    expect(() =>
      loadDeployment(
        repoWith([target('int', { account: '222222222222' })], { int: { aws: { accountId: '999999999999' } } }),
      ),
    ).toThrow(
      /config\/int.json sets aws.accountId 999999999999, but deploy.config target 'int' deploys to 222222222222/,
    );
    expect(() =>
      loadDeployment(
        repoWith([target('int', { regions: ['eu-west-1', 'us-east-1'] })], { int: { aws: { region: 'eu-west-1' } } }),
      ),
    ).toThrow(/sets aws.region eu-west-1, but deploy.config target 'int' deploys to eu-west-1, us-east-1/);
  });

  test('rejects malformed values; an unreadable file contributes nothing', () => {
    expect(() => loadDeployment(repoWith([target('int')], { int: { aws: { accountId: '12' } } }))).toThrow(/12-digit/);
    expect(() => loadDeployment(repoWith([target('int')], { int: { aws: { region: 'Ireland' } } }))).toThrow(
      /AWS Region/,
    );
    expect(loadDeployment(repoWith([target('int')], { int: '{' }))?.targets[0].env.account).toBeUndefined();
  });
});

describe('the TypeScript compiler ts-node uses', () => {
  /** A project whose node_modules holds a stub `typescript` of the given version (never loaded). */
  const projectWithTypeScript = (version: string) => {
    const dir = tempDir();
    const pkg = path.join(dir, 'node_modules', 'typescript');
    fs.mkdirSync(path.join(pkg, 'lib'), { recursive: true });
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({ name: 'typescript', version, main: 'lib/typescript.js' }),
    );
    fs.writeFileSync(path.join(pkg, 'lib', 'typescript.js'), 'module.exports = {};\n');
    return { dir, compiler: fs.realpathSync(path.join(pkg, 'lib', 'typescript.js')) };
  };

  test("keeps a project's own TypeScript 5 or 6", () => {
    for (const version of ['5.9.3', '6.0.3']) {
      const { dir, compiler } = projectWithTypeScript(version);
      expect(fs.realpathSync(typeScriptCompiler(dir))).toBe(compiler);
    }
  });

  test("uses the CLI's own TypeScript for a project on TypeScript 7, which ts-node cannot drive", () => {
    const { dir, compiler } = projectWithTypeScript('7.0.2');
    expect(typeScriptCompiler(dir)).not.toBe(compiler);
    expect(typeScriptCompiler(dir)).toBe(require.resolve('typescript'));
  });

  test("uses the CLI's own TypeScript when the project has none", () => {
    expect(typeScriptCompiler(tempDir())).toBe(require.resolve('typescript'));
  });
});

describe('the ts-node compiler options', () => {
  const cliTypeScript = require.resolve('typescript');
  const projectWithTsconfig = (tsconfig: object, extra: { [file: string]: object } = {}) => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify(tsconfig));
    for (const [file, content] of Object.entries(extra)) {
      fs.writeFileSync(path.join(dir, file), JSON.stringify(content));
    }
    return dir;
  };

  test('keep the long-standing commonjs override for an older cdk init tsconfig, or none at all', () => {
    expect(TS_NODE_COMPILER_OPTIONS).toEqual({ module: 'commonjs' });
    const older = projectWithTsconfig({ compilerOptions: { target: 'ES2020', module: 'commonjs' } });
    expect(tsNodeCompilerOptions(older, cliTypeScript)).toEqual({ module: 'commonjs' });
    expect(tsNodeCompilerOptions(tempDir(), cliTypeScript)).toEqual({ module: 'commonjs' });
  });

  test("leave a NodeNext project's module alone (commonjs next to NodeNext resolution is TS5110)", () => {
    const current = projectWithTsconfig({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext' } });
    expect(tsNodeCompilerOptions(current, cliTypeScript)).toEqual({});
    const extended = projectWithTsconfig(
      { extends: './base.json' },
      { 'base.json': { compilerOptions: { module: 'node16' } } },
    );
    expect(tsNodeCompilerOptions(extended, cliTypeScript)).toEqual({});
  });

  test('fall back to the long-standing override when the tsconfig cannot be read', () => {
    const current = projectWithTsconfig({ compilerOptions: { module: 'NodeNext' } });
    expect(tsNodeCompilerOptions(current, path.join(current, 'no-such-typescript.js'))).toEqual({ module: 'commonjs' });
  });
});

describe('the ts-node preload for the app entry', () => {
  test("is the project's own ts-node when it has one, else the CLI's", () => {
    const dir = tempDir();
    const register = path.join(dir, 'node_modules', 'ts-node', 'register', 'index.js');
    fs.mkdirSync(path.dirname(register), { recursive: true });
    fs.writeFileSync(path.join(dir, 'node_modules', 'ts-node', 'package.json'), JSON.stringify({ name: 'ts-node' }));
    fs.writeFileSync(register, '');
    expect(fs.realpathSync(tsNodeRegister(dir))).toBe(fs.realpathSync(register));
    expect(tsNodeRegister(tempDir())).toBe(require.resolve('ts-node/register'));
  });
});
