// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The v2-compatible CDK Pipelines engine: reproduces the v2 pipeline shape (Source -> Build/Synth ->
// UpdatePipeline self-mutation -> Assets -> one wave per stage, with a manual-approval gate on gated stages).

import { App, Stack, Stage } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Template } from 'aws-cdk-lib/assertions';
import { defineCICD } from '../../../../src/v3/config/define';
import { Repository } from '../../../../src/v3/config/repository';
import { CdkPipelinesEngine, CdkPipelinesStageContext, IStageProvider, cdkPipelinesApp } from '../../../../src/v3/engine/cdkpipelines/CdkPipelinesEngine';

// A stand-in app-stack provider: puts one trivial stack (a bucket) into each stage so CDK Pipelines has
// something to deploy -- the v2 IStackProvider role.
class StubStages implements IStageProvider {
  public stacks(stage: Stage, context: CdkPipelinesStageContext): void {
    const stack = new Stack(stage, 'App');
    new s3.Bucket(stack, `Bucket-${context.stageName}`);
  }
}

function render(): Template {
  const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
  const engine = new CdkPipelinesEngine(stack, 'Cd', {
    config: defineCICD({
      application: 'shop',
      repository: Repository.codecommit('shop'),
      stages: ['dev', { name: 'prod', env: { account: '222222222222', region: 'us-east-1' }, manualApproval: true }],
    }),
    stages: new StubStages(),
  });
  engine.pipeline.buildPipeline();
  return Template.fromStack(stack);
}

describe('v2-compat: CdkPipelinesEngine (aws-cdk-lib/pipelines)', () => {
  test('builds a self-mutating CDK Pipelines pipeline with a Source, Synth, and one wave per stage', () => {
    const t = render();
    // Exactly one CDK Pipelines pipeline.
    t.resourceCountIs('AWS::CodePipeline::Pipeline', 1);
    const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    const stageNames = (pipeline.Properties.Stages as any[]).map((s) => s.Name);
    // v2 shape: Source, Build (Synth), UpdatePipeline (self-mutate), then a wave per deployment stage.
    // (CDK Pipelines only adds an `Assets` stage when the app has assets to publish -- the real app does.)
    expect(stageNames).toEqual(expect.arrayContaining(['Source', 'Build', 'UpdatePipeline', 'dev', 'prod']));
    expect(stageNames.indexOf('dev')).toBeLessThan(stageNames.indexOf('prod')); // promotion order
  });

  test('the gated stage gets a manual-approval action; the auto stage does not', () => {
    const t = render();
    const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    const byName = (n: string) => (pipeline.Properties.Stages as any[]).find((s) => s.Name === n);
    const actionCategories = (stageName: string) =>
      (byName(stageName).Actions as any[]).map((a) => a.ActionTypeId.Category);
    expect(actionCategories('prod')).toContain('Approval');
    expect(actionCategories('dev')).not.toContain('Approval');
  });

  test('the synth step runs npm ci + cdk-cicd check + cdk synth (CI in the pipeline)', () => {
    const t = render();
    // The Synth CodeBuild project's buildspec carries the commands.
    const projects = t.findResources('AWS::CodeBuild::Project');
    const specs = Object.values(projects).map((p: any) => JSON.stringify(p.Properties.Source.BuildSpec));
    expect(specs.some((s) => s.includes('npm ci') && s.includes('cdk-cicd check') && s.includes('cdk synth'))).toBe(true);
  });

  test('a codeArtifact config grants the synth build CodeArtifact read + the STS bearer token', () => {
    const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
    const engine = new CdkPipelinesEngine(stack, 'Cd', {
      config: defineCICD({
        application: 'shop',
        repository: Repository.codecommit('shop'),
        stages: ['dev'],
        codeArtifact: { domain: 'd', repository: 'r', npmScope: 'cdklabs' },
      }),
      stages: new StubStages(),
    });
    engine.pipeline.buildPipeline();
    const policies = JSON.stringify(Template.fromStack(stack).findResources('AWS::IAM::Policy'));
    expect(policies).toContain('codeartifact:GetAuthorizationToken');
    expect(policies).toContain('codeartifact:ReadFromRepository');
    expect(policies).toContain('sts:GetServiceBearerToken');
  });

  test('cdkPipelinesApp builds the whole pipeline app from a config + a simple stack factory', () => {
    // The zero-touch face: bin/ just hands a factory that builds its stacks; config holds the rest.
    // deploy-ci sets CDK_DEFAULT_* (the pipeline's own env); simulate that so the pipeline stack has a region.
    const prev = { a: process.env.CDK_DEFAULT_ACCOUNT, r: process.env.CDK_DEFAULT_REGION };
    process.env.CDK_DEFAULT_ACCOUNT = '111111111111';
    process.env.CDK_DEFAULT_REGION = 'us-east-1';
    try {
      const config = defineCICD({
        application: 'shop',
        repository: Repository.codecommit('shop'),
        stages: ['dev', { name: 'prod', env: { account: '111111111111', region: 'us-east-1' }, manualApproval: true }],
      });
      const app = cdkPipelinesApp(config, (scope, ctx) => {
        const s = new Stack(scope, 'App');
        new s3.Bucket(s, `Bucket-${ctx.stageName}`);
      });
      const pipelineStack = app.node.findChild('shop-pipeline') as Stack;
      const t = Template.fromStack(pipelineStack);
      t.resourceCountIs('AWS::CodePipeline::Pipeline', 1);
      const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0] as any;
      expect((pipeline.Properties.Stages as any[]).map((s) => s.Name)).toEqual(expect.arrayContaining(['Source', 'Build', 'dev', 'prod']));
    } finally {
      process.env.CDK_DEFAULT_ACCOUNT = prev.a;
      process.env.CDK_DEFAULT_REGION = prev.r;
    }
  });

  test('a multi-region stage becomes one wave per region (not just the first)', () => {
    const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
    const engine = new CdkPipelinesEngine(stack, 'Cd', {
      config: defineCICD({
        application: 'shop',
        repository: Repository.codecommit('shop'),
        stages: [{ name: 'prod', env: { account: '111111111111', regions: ['eu-west-1', 'us-east-1'] }, manualApproval: true }],
      }),
      stages: new StubStages(),
    });
    engine.pipeline.buildPipeline();
    const pipeline = Object.values(Template.fromStack(stack).findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    const names = (pipeline.Properties.Stages as any[]).map((s) => s.Name);
    expect(names).toEqual(expect.arrayContaining(['prod-eu-west-1', 'prod-us-east-1']));
  });
});
