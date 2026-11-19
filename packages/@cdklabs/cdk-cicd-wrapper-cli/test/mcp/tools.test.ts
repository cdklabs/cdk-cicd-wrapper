// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { checkConfig, describePipeline, describeTemplates, projectDir, tools } from '../../src/mcp/tools';

// A config file that goes through the real defineCICD, so validation is the wrapper's own.
const WRAPPER = require.resolve('@cdklabs/cdk-cicd-wrapper');

// Every project of this file lives under one root, removed at the end.
let ROOT: string;
beforeAll(() => {
  ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-cicd-mcp-test-'));
});
afterAll(() => {
  fs.rmSync(ROOT, { recursive: true, force: true });
});

function project(files: { [name: string]: string }): string {
  const dir = fs.mkdtempSync(path.join(ROOT, 'p-'));
  for (const [name, config] of Object.entries(files)) {
    fs.writeFileSync(
      path.join(dir, name),
      `const w = require(${JSON.stringify(WRAPPER)});\nmodule.exports = ${config};\n`,
    );
  }
  return dir;
}

const VALID = `w.defineCICD({
  application: 'shop',
  repository: w.Repository.codecommit('shop'),
  stages: ['dev', { name: 'prod', env: { account: '222222222222', region: 'eu-west-1' }, manualApproval: true }],
  devopsAgent: { agentSpaceId: 'as-123' },
})`;
const DEPLOYMENT = `w.defineDeployment({ image: 'repo:1', targets: [{ stage: 'prod', env: { account: '222222222222', region: 'eu-west-1' } }] })`;

function text(result: { content: Array<{ text: string }> }): string {
  return result.content[0].text;
}

const never = new AbortController().signal;

describe('check_config', () => {
  test('summarizes a valid cicd.config', async () => {
    const result = await checkConfig(project({ 'cicd.config.js': VALID }));
    expect(result.isError).toBeUndefined();
    const report = JSON.parse(text(result));
    expect(report.valid).toBe(true);
    expect(report['cicd.config']).toMatchObject({
      application: 'shop',
      pipelineStackName: 'shop-pipeline',
      repository: { type: 'codecommit', name: 'shop', branch: 'main' },
      stages: [
        { name: 'dev', account: '(pipeline account)', regions: '(pipeline Region)', manualApproval: false },
        { name: 'prod', account: '222222222222', regions: ['eu-west-1'], manualApproval: true },
      ],
      devopsAgent: { agentSpaceId: 'as-123' },
    });
  });

  test('returns the validation error of an invalid config as an isError result', async () => {
    const result = await checkConfig(
      project({ 'cicd.config.js': VALID.replace("'as-123'", "'arn:aws:aidevops:eu-west-1:1:agentspace/x'") }),
    );
    expect(result.isError).toBe(true);
    expect(JSON.parse(text(result))['cicd.config'].error).toMatch(/cicd.config does not validate: .*not its ARN/);
  });

  test('a broken file is named, and does not hide the other, valid one', async () => {
    const result = await checkConfig(
      project({
        'cicd.config.js': VALID,
        'deploy.config.js':
          "w.defineDeployment({ image: 'repo:1', targets: [], devopsAgent: { agentSpaceId: 'arn:aws:aidevops:x' } })",
      }),
    );
    expect(result.isError).toBe(true);
    const report = JSON.parse(text(result));
    expect(report.valid).toBe(false);
    expect(report['cicd.config'].application).toBe('shop');
    expect(report['deploy.config'].error).toMatch(/^deploy.config does not validate: /);
  });

  test('a file that does not export a define*() result says so', async () => {
    const result = await checkConfig(project({ 'cicd.config.js': "{ application: 'shop' }" }));
    expect(JSON.parse(text(result))['cicd.config'].error).toBe(
      'cicd.config does not export the result of defineCICD(...)',
    );
  });

  test('reports a directory without a config', async () => {
    const result = await checkConfig(fs.mkdtempSync(path.join(ROOT, 'empty-')));
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/No cicd.config/);
  });

  test('reads the config again after it changes, also through a symlinked path (the server is long-lived)', () => {
    // jest keeps its own module registry, so the require-cache invalidation can only be observed in a
    // real Node process: load the tool through ts-node there, edit the config, load it again. The project
    // is reached through a symlink, because require.cache is keyed by the real path.
    const dir = project({ 'cicd.config.js': VALID });
    const link = path.join(ROOT, `link-${path.basename(dir)}`);
    fs.symlinkSync(dir, link);
    const script = `
      require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
      const fs = require('fs');
      const { checkConfig } = require('./src/mcp/tools');
      const file = ${JSON.stringify(path.join(dir, 'cicd.config.js'))};
      const app = async () => JSON.parse((await checkConfig(${JSON.stringify(link)})).content[0].text)['cicd.config'].application;
      (async () => {
        const before = await app();
        fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace("application: 'shop'", "application: 'shop2'"));
        process.stderr.write(JSON.stringify([before, await app()]));
      })();`;
    const run = spawnSync(process.execPath, ['-e', script], {
      cwd: path.resolve(__dirname, '..', '..'),
      encoding: 'utf-8',
    });
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stderr.trim().split('\n').pop()!)).toEqual(['shop', 'shop2']);
  });

  test('summarizes a Repo 2 deploy.config', async () => {
    const report = JSON.parse(text(await checkConfig(project({ 'deploy.config.js': DEPLOYMENT }))));
    expect(report['deploy.config']).toMatchObject({
      image: 'repo:1',
      targets: [{ stage: 'prod', account: '222222222222', regions: ['eu-west-1'], manualApproval: true }],
      devopsAgent: false,
    });
    expect(report['cicd.config']).toBeUndefined();
  });

  test('a relative directory argument resolves against the server working directory', async () => {
    const dir = project({ 'cicd.config.js': VALID });
    const [checkTool] = tools(ROOT);
    const result = await checkTool.call({ directory: path.basename(dir) }, never);
    expect(JSON.parse(text(result))['cicd.config'].application).toBe('shop');
  });
});

describe('the directory argument', () => {
  test('may not leave the server working directory, also not through a symlink', () => {
    const inside = project({ 'cicd.config.js': VALID });
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-cicd-mcp-outside-'));
    try {
      expect(projectDir({ directory: path.basename(inside) }, ROOT)).toBe(inside);
      expect(projectDir({}, inside)).toBe(inside);
      expect(() => projectDir({ directory: '..' }, inside)).toThrow(/must be inside/);
      expect(() => projectDir({ directory: outside }, ROOT)).toThrow(/must be inside/);
      const escape = path.join(inside, 'escape');
      fs.symlinkSync(outside, escape);
      expect(() => projectDir({ directory: 'escape' }, inside)).toThrow(/must be inside/);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  test('unknown arguments and missing directories are errors, not silently ignored', async () => {
    expect(() => projectDir({ dir: '.' }, ROOT)).toThrow(/Unknown argument\(s\): dir/);
    expect(() => projectDir({ directory: 'nope' }, ROOT)).toThrow(/does not exist/);
    expect(() => projectDir({ directory: 7 }, ROOT)).toThrow(/must be a string/);
  });

  test('the tools advertise what they do: describe_pipeline is not read-only', () => {
    const [check, describe] = tools(ROOT);
    expect(check.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    expect(describe.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, openWorldHint: true });
  });
});

describe('describe_pipeline (synth)', () => {
  // A stand-in for the project's `cdk` script: a node file behind `"cdk": "node fake-cdk.js"`, run by the
  // real npm exactly as describe_pipeline runs it.
  function fakeCdkProject(body: string): string {
    const dir = fs.mkdtempSync(path.join(ROOT, 'synth-'));
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'fake', version: '1.0.0', private: true, scripts: { cdk: 'node fake-cdk.js' } }),
    );
    fs.writeFileSync(
      path.join(dir, 'fake-cdk.js'),
      `const fs = require('fs'); const path = require('path');
const argv = process.argv.slice(2); const out = argv[argv.indexOf('--output') + 1];
${body}\n`,
    );
    return dir;
  }

  test('runs the cdk script in pipeline mode with the flags it needs, and describes the assembly', async () => {
    const dir = fakeCdkProject(`
fs.writeFileSync(path.join(process.cwd(), 'seen.json'), JSON.stringify({ argv, mode: process.env.CDK_CICD_MODE }));
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'shop-pipeline.template.json'), JSON.stringify({ Resources: { P: { Type: 'AWS::CodePipeline::Pipeline',
  Properties: { Name: 'shop-pipeline', Stages: [{ Name: 'Source', Actions: [{ Name: 'Source', ActionTypeId: { Category: 'Source', Provider: 'S3' } }] }] } } } }));`);
    const result = await describePipeline(dir, never);
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(text(result)).pipelines[0]).toMatchObject({ stack: 'shop-pipeline', name: 'shop-pipeline' });
    const seen = JSON.parse(fs.readFileSync(path.join(dir, 'seen.json'), 'utf-8'));
    expect(seen.mode).toBe('pipeline');
    expect(seen.argv.slice(0, 2)).toEqual(['synth', '--all']);
    expect(seen.argv).toContain('--output');
    expect(fs.existsSync(seen.argv[seen.argv.indexOf('--output') + 1])).toBe(false); // temp assembly removed
  });

  test('a failing synth returns its output as an error', async () => {
    const result = await describePipeline(fakeCdkProject("console.error('synth exploded'); process.exit(3);"), never);
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/exit 3[\s\S]*synth exploded/);
  });

  test('cancelling stops the synth and everything it started, and removes the temp assembly', async () => {
    const dir = fakeCdkProject(`
const { spawn } = require('child_process');
const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
fs.writeFileSync(path.join(process.cwd(), 'state.json'), JSON.stringify({ pid: process.pid, grandchild: grandchild.pid, out }));
setInterval(() => {}, 1000);`);
    const controller = new AbortController();
    const running = describePipeline(dir, controller.signal);
    const stateFile = path.join(dir, 'state.json');
    for (let i = 0; i < 200 && !fs.existsSync(stateFile); i++) await new Promise((r) => setTimeout(r, 50));
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    controller.abort();
    const result = await running;
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/cancelled/);
    expect(fs.existsSync(state.out)).toBe(false);
    const alive = (pid: number) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    for (let i = 0; i < 100 && (alive(state.pid) || alive(state.grandchild)); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(alive(state.pid)).toBe(false);
    expect(alive(state.grandchild)).toBe(false);
  });
});

describe('describe_pipeline (template reading)', () => {
  // The CloudFormation shape of a rendered pipeline stack, cut down to what describeTemplates reads.
  const TEMPLATE = {
    Resources: {
      Pipeline: {
        Type: 'AWS::CodePipeline::Pipeline',
        Properties: {
          Name: 'shop-pipeline',
          Stages: [
            { Name: 'Source', Actions: [{ Name: 'Source', ActionTypeId: { Category: 'Source', Provider: 'S3' } }] },
            { Name: 'Build', Actions: [{ Name: 'Build', ActionTypeId: { Category: 'Build', Provider: 'CodeBuild' } }] },
            {
              Name: 'Deploy-prod',
              Actions: [
                { Name: 'Approve', ActionTypeId: { Category: 'Approval', Provider: 'Manual' } },
                { Name: 'Deploy', ActionTypeId: { Category: 'Build', Provider: 'CodeBuild' }, Region: 'us-east-1' },
              ],
            },
          ],
        },
      },
      Forwarder: {
        Type: 'AWS::Lambda::Function',
        Properties: { Environment: { Variables: { AGENT_SPACE_ID: 'as-123', AGENT_SPACE_REGION: 'eu-west-1' } } },
      },
      Other: { Type: 'AWS::Lambda::Function', Properties: { Environment: { Variables: { X: '1' } } } },
    },
  };

  test('lists each pipeline with its stages and actions, and the DevOps Agent forwarder', () => {
    expect(describeTemplates([{ stackName: 'shop-pipeline', template: TEMPLATE }])).toEqual({
      pipelines: [
        {
          stack: 'shop-pipeline',
          name: 'shop-pipeline',
          stages: [
            { name: 'Source', actions: [{ name: 'Source', category: 'Source', provider: 'S3' }] },
            { name: 'Build', actions: [{ name: 'Build', category: 'Build', provider: 'CodeBuild' }] },
            {
              name: 'Deploy-prod',
              actions: [
                { name: 'Approve', category: 'Approval', provider: 'Manual' },
                { name: 'Deploy', category: 'Build', provider: 'CodeBuild', region: 'us-east-1' },
              ],
            },
          ],
        },
      ],
      devopsAgentForwarder: { stack: 'shop-pipeline', agentSpaceId: 'as-123', region: 'eu-west-1' },
    });
  });

  test('names that are CloudFormation tokens are reported as resolved at deploy time', () => {
    const tokenized = JSON.parse(JSON.stringify(TEMPLATE));
    tokenized.Resources.Pipeline.Properties.Name = { Ref: 'AWS::StackName' };
    tokenized.Resources.Pipeline.Properties.Stages[0].Actions[0].Name = { 'Fn::Join': ['', ['x']] };
    const described: any = describeTemplates([{ stackName: 's', template: tokenized }]);
    expect(described.pipelines[0].name).toBe('(resolved at deploy time)');
    expect(described.pipelines[0].stages[0].actions[0].name).toBe('(resolved at deploy time)');
  });

  test('reports no forwarder and no pipelines for an empty assembly', () => {
    expect(describeTemplates([])).toEqual({ pipelines: [], devopsAgentForwarder: false });
  });
});
