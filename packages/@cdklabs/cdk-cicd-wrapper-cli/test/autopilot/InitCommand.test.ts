// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';
import {
  applicationFromPackageName,
  DEFAULT_BOOTSTRAP_QUALIFIER,
  entryFromAppCommand,
  InitOptions,
  initPlan,
  nextSteps,
  renderInitConfig,
} from '../../src/cmds/autopilot/InitCommand';

const codecommit = (overrides: Partial<InitOptions> = {}): InitOptions => ({
  application: 'my-app',
  source: { kind: 'codecommit', repository: 'my-app', branch: 'main' },
  stages: ['dev'],
  qualifier: DEFAULT_BOOTSTRAP_QUALIFIER,
  ...overrides,
});

/** Compile a rendered cicd.config.ts and run it against the real wrapper, as `cdk-cicd exec` would. */
function evaluate(config: string): any {
  const js = ts.transpileModule(config, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} as any };
  const wrapperRequire = (id: string) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    id === '@cdklabs/cdk-cicd-wrapper' ? require('@cdklabs/cdk-cicd-wrapper') : require(id);
  new Function('module', 'exports', 'require', js)(module, module.exports, wrapperRequire);
  return module.exports.default;
}

function app(files: { [name: string]: string }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-cicd-init-'));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

// What `cdk init app --language typescript` writes, trimmed to what init reads.
const STOCK_BIN = `import * as cdk from 'aws-cdk-lib/core';
const app = new cdk.App();
new cdk.Stack(app, 'CicdStack', {
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
`;
const STOCK_CDK_JSON = JSON.stringify({ app: 'npx tsc && npx tsx bin/cicd.ts', context: { someFlag: true } }, null, 2);

describe('cdk-cicd init: the app entry in cdk.json', () => {
  test.each([
    ['npx tsc && npx tsx bin/cicd.ts', 'bin/cicd.ts'],
    ['npx ts-node --prefer-ts-exts bin/my-app.ts', 'bin/my-app.ts'],
    ['node dist/bin/app.js', 'dist/bin/app.js'],
    ['npx cdk-cicd exec bin/app.ts', 'bin/app.ts'],
  ])('%s -> %s', (command, entry) => {
    expect(entryFromAppCommand(command)).toBe(entry);
  });

  test('a command with no .ts/.js argument has no entry', () => {
    expect(entryFromAppCommand('python3 app.py')).toBeUndefined();
  });
});

describe('cdk-cicd init: the generated cicd.config.ts', () => {
  test('is a valid defineCICD config for a CodeCommit source on the default bootstrap', () => {
    const config = renderInitConfig(codecommit({ stages: ['dev', 'prod'] }));
    const resolved = evaluate(config);
    expect(resolved.application).toBe('my-app');
    expect(resolved.qualifier).toBe(DEFAULT_BOOTSTRAP_QUALIFIER);
    expect(resolved.stages.map((stage: any) => stage.name)).toEqual(['dev', 'prod']);
    expect(JSON.stringify(resolved.repository)).toContain('my-app');
    expect(config).toContain("Repository.codecommit('my-app')");
    expect(config).toContain('`cdk bootstrap` creates');
    // The truth about a created repository: it goes with the pipeline stack.
    expect(config).toContain('deleting that stack deletes the');
  });

  test('names a non-default branch, a CodeStar connection and an S3 source', () => {
    expect(
      renderInitConfig(codecommit({ source: { kind: 'codecommit', repository: 'r', branch: 'trunk' } })),
    ).toContain("Repository.codecommit('r', 'trunk')");
    const codestar = renderInitConfig(
      codecommit({
        source: {
          kind: 'codestar',
          repository: 'my-org/my-app',
          connectionArn: 'arn:aws:codestar-connections:eu-west-1:111111111111:connection/abc',
          branch: 'main',
        },
      }),
    );
    expect(codestar).toContain(
      "Repository.codestarConnection('my-org/my-app', 'arn:aws:codestar-connections:eu-west-1:111111111111:connection/abc', 'main')",
    );
    expect(evaluate(codestar).stages).toHaveLength(1);
    expect(renderInitConfig(codecommit({ source: { kind: 's3', object: 'bucket/app.zip' } }))).toContain(
      "Repository.s3('bucket/app.zip')",
    );
  });

  test('--existing imports a CodeCommit repository that already exists', () => {
    const config = renderInitConfig(
      codecommit({ source: { kind: 'codecommit', repository: 'my-app', branch: 'main', existing: true } }),
    );
    expect(config).toContain("Repository.codecommit('my-app', 'main', { existing: true })");
    expect(config).not.toContain('Created by');
    expect(JSON.stringify(evaluate(config).repository)).toContain('my-app');
  });

  test("'derived' leaves the qualifier to defineCICD", () => {
    const config = renderInitConfig(codecommit({ qualifier: undefined }));
    expect(config).not.toContain('qualifier');
    expect(evaluate(config).qualifier).not.toBe(DEFAULT_BOOTSTRAP_QUALIFIER);
  });

  test.each([
    ['a quote in the repository', codecommit({ source: { kind: 'codecommit', repository: "my'app", branch: 'main' } })],
    ['a newline in the application', codecommit({ application: 'my\napp' })],
    ['a stage starting with a digit', codecommit({ stages: ['1dev'] })],
    ['an application that cannot name a stack', codecommit({ application: 'my_app' })],
    ['no stage at all', codecommit({ stages: [] })],
  ])('refuses %s instead of writing it into TypeScript', (_name, options) => {
    expect(() => renderInitConfig(options)).toThrow(/cdk-cicd init/);
  });
});

describe('cdk-cicd init: the plan for a project', () => {
  test('for a stock cdk init app: writes the config, points cdk.json at exec, flags the commented env', () => {
    const dir = app({ 'cdk.json': STOCK_CDK_JSON, 'bin/cicd.ts': STOCK_BIN });
    const plan = initPlan(dir, codecommit());
    expect(plan.entry).toBe('bin/cicd.ts');
    const cdkJson = JSON.parse(plan.cdkJson!);
    expect(cdkJson.app).toBe('npx cdk-cicd exec bin/cicd.ts');
    expect(cdkJson.context).toEqual({ someFlag: true });
    expect(plan.notes.join('\n')).toMatch(/bin\/cicd\.ts has cdk init's env line commented out/);
  });

  test('leaves a cdk.json that already runs cdk-cicd exec alone, and needs no note for a bound stack', () => {
    const dir = app({
      'cdk.json': JSON.stringify({ app: 'npx cdk-cicd exec bin/app.ts' }),
      'bin/app.ts': 'new Stack(app, "S", { env: { account: process.env.CDK_DEFAULT_ACCOUNT } });\n',
    });
    const plan = initPlan(dir, codecommit());
    expect(plan.cdkJson).toBeUndefined();
    expect(plan.notes).toEqual([]);
  });

  test('refuses a directory with no cdk.json, an existing config, or an entry it cannot find', () => {
    expect(() => initPlan(app({}), codecommit())).toThrow(/no cdk.json/);
    expect(() =>
      initPlan(app({ 'cdk.json': STOCK_CDK_JSON, 'bin/cicd.ts': STOCK_BIN, 'cicd.config.ts': '' }), codecommit()),
    ).toThrow(/refusing to overwrite/);
    expect(() => initPlan(app({ 'cdk.json': JSON.stringify({ app: 'python3 app.py' }) }), codecommit())).toThrow(
      /pass --entry/,
    );
    expect(() => initPlan(app({ 'cdk.json': STOCK_CDK_JSON }), codecommit())).toThrow(/bin\/cicd\.ts does not exist/);
  });

  test('--entry overrides what cdk.json says', () => {
    const dir = app({ 'cdk.json': JSON.stringify({ app: 'python3 app.py' }), 'src/main.ts': '' });
    expect(initPlan(dir, codecommit(), 'src/main.ts').entry).toBe('src/main.ts');
  });
});

describe('cdk-cicd init: the default application name', () => {
  test.each([
    ['my-app', 'my-app'],
    ['@acme/my_app.cdk', 'my-app-cdk'],
    ['2fast', 'fast'],
    ['___', undefined],
  ])('package %s -> %s', (name, application) => {
    expect(applicationFromPackageName(name)).toBe(application);
  });
});

describe('cdk-cicd init: next steps', () => {
  test('a CodeCommit source ends with the push that starts the first run, through a repo-local helper', () => {
    const steps = nextSteps(codecommit(), 'eu-west-1').join('\n');
    expect(steps).toContain('npx cdk-cicd synth --all');
    expect(steps).toContain('npx cdk-cicd deploy-ci');
    expect(steps).toContain('git remote add origin https://git-codecommit.eu-west-1.amazonaws.com/v1/repos/my-app');
    expect(steps).toContain(
      "credential.https://git-codecommit.eu-west-1.amazonaws.com.helper '!aws codecommit credential-helper $@'",
    );
    // cdk init commits only its scaffold, so the changes init made must be committed before the push.
    expect(steps).toMatch(/git add -A && git commit [^\n]*\n[^\n]*git push -u origin HEAD:main/);
  });

  test('an S3 source has no git steps', () => {
    expect(nextSteps(codecommit({ source: { kind: 's3', object: 'b/k.zip' } }), undefined).join('\n')).not.toContain(
      'git',
    );
  });
});
