// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The v2-compatible CDK Pipelines engine: reproduces the v2 pipeline shape (Source -> Build/Synth ->
// UpdatePipeline self-mutation -> Assets -> one wave per stage, with a manual-approval gate on gated stages).

import { App, Aspects, Stack, Stage } from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { AwsSolutionsChecks } from 'cdk-nag';
import { defineCICD } from '../../../src/config/define';
import { Repository } from '../../../src/config/repository';
import {
  CdkPipelinesEngine,
  CdkPipelinesStageContext,
  IStageProvider,
} from '../../../src/engine/cdkpipelines/CdkPipelinesEngine';

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
  // The engine builds the pipeline in its constructor; use it to keep the return type explicit.
  void engine;
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
    expect(specs.some((s) => s.includes('npm ci') && s.includes('cdk-cicd check') && s.includes('cdk synth'))).toBe(
      true,
    );
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
    void engine;
    const policies = JSON.stringify(Template.fromStack(stack).findResources('AWS::IAM::Policy'));
    expect(policies).toContain('codeartifact:GetAuthorizationToken');
    expect(policies).toContain('codeartifact:ReadFromRepository');
    expect(policies).toContain('sts:GetServiceBearerToken');
  });

  test('codeBuildEnvSettings applies to every CodeBuild project CDK Pipelines creates (synth + self-mutation)', () => {
    const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
    const engine = new CdkPipelinesEngine(stack, 'Cd', {
      config: defineCICD({
        application: 'shop',
        repository: Repository.codecommit('shop'),
        stages: ['dev'],
        codeBuildEnvSettings: {
          privileged: true,
          computeType: codebuild.ComputeType.LARGE,
          environmentVariables: { FOO: { value: 'bar' } },
        },
      }),
      stages: new StubStages(),
    });
    void engine;

    const projects = Object.values(Template.fromStack(stack).findResources('AWS::CodeBuild::Project'));
    // Synth + self-mutation: v2's uniform-application semantics, achieved here via CDK Pipelines' own
    // `codeBuildDefaults` (not a per-step wire-up), so it reaches projects this engine does not build itself.
    expect(projects).toHaveLength(2);
    for (const p of projects as any[]) {
      expect(p.Properties.Environment).toEqual(
        expect.objectContaining({
          PrivilegedMode: true,
          ComputeType: 'BUILD_GENERAL1_LARGE',
          EnvironmentVariables: expect.arrayContaining([expect.objectContaining({ Name: 'FOO', Value: 'bar' })]),
        }),
      );
    }
  });

  test('without codeBuildEnvSettings every CodeBuild project keeps the CDK-managed environment default', () => {
    const t = render();
    for (const p of Object.values(t.findResources('AWS::CodeBuild::Project')) as any[]) {
      expect(p.Properties.Environment.PrivilegedMode).toBe(false);
      expect(p.Properties.Environment.EnvironmentVariables ?? []).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ Name: 'FOO' })]),
      );
    }
  });

  test('a multi-region stage becomes one wave per region (not just the first)', () => {
    const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
    const engine = new CdkPipelinesEngine(stack, 'Cd', {
      config: defineCICD({
        application: 'shop',
        repository: Repository.codecommit('shop'),
        stages: [
          { name: 'prod', env: { account: '111111111111', regions: ['eu-west-1', 'us-east-1'] }, manualApproval: true },
        ],
      }),
      stages: new StubStages(),
    });
    void engine;
    const pipeline = Object.values(Template.fromStack(stack).findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    const names = (pipeline.Properties.Stages as any[]).map((s) => s.Name);
    expect(names).toEqual(expect.arrayContaining(['prod-eu-west-1', 'prod-us-east-1']));
  });

  test('emits no cdk-nag errors on its OWN generated infra (pipeline stack + cross-region support stack)', () => {
    // AwsSolutionsChecks (as v2's blueprint ran it) flags CDK Pipelines' generated roles/buckets. The engine
    // must suppress those on the wrapper-owned plumbing only. A cross-region stage (us-east-1 != the pipeline's
    // us-west-2) also forces a cross-region *support* stack, so this covers the replication bucket + its key.
    const app = new App();
    const stack = new Stack(app, 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
    const engine = new CdkPipelinesEngine(stack, 'Cd', {
      config: defineCICD({
        application: 'shop',
        repository: Repository.codecommit('shop'),
        stages: ['dev', { name: 'prod', env: { account: '222222222222', region: 'us-east-1' }, manualApproval: true }],
      }),
      stages: new StubStages(),
    });
    Aspects.of(app).add(new AwsSolutionsChecks({ verbose: false }));

    // Assert on the WRAPPER-owned stacks only (pipeline stack + cross-region support stacks); the app-stage
    // stacks the provider builds are judged on their own merits, not suppressed by the engine.
    const wrapperStacks = [stack, ...Object.values(engine.pipeline.pipeline.crossRegionSupport).map((s) => s.stack)];
    for (const s of wrapperStacks) {
      expect(Annotations.fromStack(s).findError('*', Match.stringLikeRegexp('AwsSolutions-.*'))).toHaveLength(0);
    }
  });
});
