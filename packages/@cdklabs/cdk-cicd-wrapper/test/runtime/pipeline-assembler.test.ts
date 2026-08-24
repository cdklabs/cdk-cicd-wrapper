// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The self-mutating assembler: `cdk-cicd exec` runs this (not the entry) when engine === CDK_PIPELINES or
// GITHUB_ACTIONS. It builds the self-mutating pipeline by REPLAYING a plain user bin once per configured
// stage -- proving the single-entry principle needs zero wrapper code in the user's bin.
//
// Two layers of test: the pipeline STRUCTURE is checked in-process with a stub provider; the real replay
// (require.cache manipulation) is checked in a SUBPROCESS, because jest's module registry does not honour
// require.cache (same reason bundled-diagnostic runs the compiled preload out of process).

import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Stack, Stage } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { defineCICD } from '../../src/config/define';
import { Repository } from '../../src/config/repository';
import { EngineType } from '../../src/config/types';
import { CdkPipelinesStageContext, IStageProvider } from '../../src/engine/cdkpipelines/CdkPipelinesEngine';
import { GitHubActionsEngine } from '../../src/engine/github/GitHubActionsEngine';
import { buildPipelineApp } from '../../src/runtime/pipeline-assembler';

function config() {
  return defineCICD({
    application: 'shop',
    repository: Repository.codecommit('shop'),
    stages: ['dev', { name: 'prod', env: { account: '222222222222', region: 'us-east-1' }, manualApproval: true }],
  });
}

/** Stand-in for the replay: drops one stack (a bucket) into each stage, no require.cache needed. */
class StubProvider implements IStageProvider {
  public stacks(stage: Stage, context: CdkPipelinesStageContext): void {
    const stack = new Stack(stage, 'shop-app', { env: context.env });
    new s3.Bucket(stack, 'Data');
  }
}

describe('CDK Pipelines assembler: pipeline structure (stub provider)', () => {
  const prev = { a: process.env.CDK_DEFAULT_ACCOUNT, r: process.env.CDK_DEFAULT_REGION };
  beforeEach(() => {
    process.env.CDK_DEFAULT_ACCOUNT = '111111111111';
    process.env.CDK_DEFAULT_REGION = 'us-east-1';
  });
  afterEach(() => {
    process.env.CDK_DEFAULT_ACCOUNT = prev.a;
    process.env.CDK_DEFAULT_REGION = prev.r;
  });

  test('assembles one self-mutating pipeline with a wave per stage, in promotion order', () => {
    const t = Template.fromStack(
      buildPipelineApp(config(), new StubProvider()).node.findChild('shop-pipeline') as Stack,
    );
    t.resourceCountIs('AWS::CodePipeline::Pipeline', 1);
    const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    const names = (pipeline.Properties.Stages as any[]).map((s) => s.Name);
    expect(names).toEqual(expect.arrayContaining(['Source', 'Build', 'UpdatePipeline', 'dev', 'prod']));
    expect(names.indexOf('dev')).toBeLessThan(names.indexOf('prod'));
  });

  test('the gated stage gets a manual-approval action; the auto stage does not', () => {
    const t = Template.fromStack(
      buildPipelineApp(config(), new StubProvider()).node.findChild('shop-pipeline') as Stack,
    );
    const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    const byName = (n: string) => (pipeline.Properties.Stages as any[]).find((s) => s.Name === n);
    const categories = (n: string) => (byName(n).Actions as any[]).map((a) => a.ActionTypeId.Category);
    expect(categories('prod')).toContain('Approval');
    expect(categories('dev')).not.toContain('Approval');
  });
});

describe('self-mutating assembler: GITHUB_ACTIONS picks the GitHubActionsEngine', () => {
  const prev = { a: process.env.CDK_DEFAULT_ACCOUNT, r: process.env.CDK_DEFAULT_REGION };
  let workflowDir: string;
  beforeEach(() => {
    process.env.CDK_DEFAULT_ACCOUNT = '111111111111';
    process.env.CDK_DEFAULT_REGION = 'us-west-2';
    workflowDir = mkdtempSync(path.join(os.tmpdir(), 'cdk-cicd-github-actions-assembler-'));
  });
  afterEach(() => {
    process.env.CDK_DEFAULT_ACCOUNT = prev.a;
    process.env.CDK_DEFAULT_REGION = prev.r;
    rmSync(workflowDir, { recursive: true, force: true });
  });

  test('config.engine === GITHUB_ACTIONS renders a GitHubActionsEngine, not CdkPipelinesEngine', () => {
    const app = buildPipelineApp(
      defineCICD({
        application: 'shop',
        repository: Repository.github('org/shop'),
        stages: ['dev'],
        engine: EngineType.GITHUB_ACTIONS,
        githubActions: { workflowPath: path.join(workflowDir, '.github', 'workflows', 'deploy.yml') },
      }),
      new StubProvider(),
    );
    const stack = app.node.findChild('shop-pipeline') as Stack;
    expect(stack.node.tryFindChild('Cd')).toBeInstanceOf(GitHubActionsEngine);
    // No AWS-hosted CodePipeline: GitHub Actions renders a workflow file, not a CodePipeline resource.
    Template.fromStack(stack).resourceCountIs('AWS::CodePipeline::Pipeline', 0);
  });
});

// The faithful replay proof. Needs the COMPILED assembler (lib/) because it runs in a real node process;
// skip with a pointer when lib/ is absent, exactly as the bundled-diagnostic test does.
describe('CDK Pipelines assembler: real per-stage replay (subprocess)', () => {
  const runner = path.join(__dirname, 'fixtures', 'cdkp-runner.js');
  const compiled = path.join(__dirname, '..', '..', '..', 'lib', 'v3', 'runtime', 'pipeline-assembler.js');
  const maybe = existsSync(compiled) ? test : test.skip;

  maybe('replays the plain bin into each stage so every stage stack gets the bucket', () => {
    const out = execFileSync(process.execPath, [runner], {
      env: { ...process.env, CDK_DEFAULT_ACCOUNT: '111111111111', CDK_DEFAULT_REGION: 'us-east-1' },
      encoding: 'utf-8',
    });
    const line = out.split('\n').find((l) => l.startsWith('RESULT='));
    expect(line).toBeDefined();
    const result = JSON.parse(line!.slice('RESULT='.length)) as Array<{
      stage: string;
      buckets: number;
      bucketIds: string[];
      account?: string;
    }>;
    const byStage = Object.fromEntries(result.map((r) => [r.stage, r]));
    // Each replayed stage got exactly the plain bin's one bucket.
    expect(byStage.dev.buckets).toBe(1);
    expect(byStage.prod.buckets).toBe(1);
    // Per-stage env pinning took effect: prod's stack resolved to the prod account (222…), dev to the
    // ambient hub account (111…) -- so the replay set CDK_DEFAULT_ACCOUNT per stage, not once.
    expect(byStage.dev.account).toBe('111111111111');
    expect(byStage.prod.account).toBe('222222222222');
    // CDK_STAGE was pinned per stage: the bucket logical id (Data-${CDK_STAGE}) differs across stages.
    expect(byStage.dev.bucketIds[0]).not.toEqual(byStage.prod.bucketIds[0]);
  });
});
