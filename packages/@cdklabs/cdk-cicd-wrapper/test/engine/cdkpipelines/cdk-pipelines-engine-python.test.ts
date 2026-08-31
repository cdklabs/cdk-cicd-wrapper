// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The CDK Pipelines engine with a Python CDK app: the Synth CodeBuild step runs the Python default
// build phase (pip-audit/mypy/pytest) and `cdk synth` (not `npm run cdk synth`, since a Python project
// has no package.json script), and the managed image declares both Node and Python runtimes.

import { App, Stack, Stage } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { defineCICD } from '../../../src/config/define';
import { Repository } from '../../../src/config/repository';
import { CiLanguage } from '../../../src/config/types';
import {
  CdkPipelinesEngine,
  CdkPipelinesStageContext,
  IStageProvider,
} from '../../../src/engine/cdkpipelines/CdkPipelinesEngine';

class StubStages implements IStageProvider {
  public stacks(stage: Stage, context: CdkPipelinesStageContext): void {
    const stack = new Stack(stage, 'App');
    new s3.Bucket(stack, `Bucket-${context.stageName}`);
  }
}

function renderPython(): Template {
  const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
  void new CdkPipelinesEngine(stack, 'Cd', {
    config: defineCICD({
      application: 'shop',
      repository: Repository.codecommit('shop'),
      stages: ['dev'],
      ci: { language: CiLanguage.PYTHON },
    }),
    stages: new StubStages(),
  });
  return Template.fromStack(stack);
}

/** The synth CodeBuild project's buildspec, as a JSON string. */
function synthSpec(t: Template): string {
  const projects = t.findResources('AWS::CodeBuild::Project');
  const specs = Object.values(projects).map((p: any) => JSON.stringify(p.Properties.Source.BuildSpec));
  return specs.find((s) => s.includes('pip-audit')) ?? specs.join('\n');
}

describe('CdkPipelinesEngine — Python CI', () => {
  test('the synth step runs the Python build phase (pip-audit/mypy/pytest) and cdk synth, not npm', () => {
    const spec = synthSpec(renderPython());
    expect(spec).toContain('pip install -r requirements.txt');
    expect(spec).toContain('pip-audit');
    expect(spec).toContain('mypy');
    expect(spec).toContain('pytest');
    expect(spec).toContain('cdk synth');
    // No npm build phase for a Python project, and never npx.
    expect(spec).not.toContain('npm ci');
    expect(spec).not.toContain('npm run');
    expect(spec).not.toContain('npx ');
  });

  test('the managed image declares both Node and Python runtimes (cdk CLI is Node even for a Python app)', () => {
    const spec = synthSpec(renderPython());
    expect(spec).toContain('python');
    expect(spec).toMatch(/nodejs|node/);
  });

  test('CDK_CICD_MODE=pipeline is set on the synth step env (self-mutation renders the pipeline)', () => {
    const projects = renderPython().findResources('AWS::CodeBuild::Project');
    const envVars = Object.values(projects).flatMap((p: any) => p.Properties.Environment?.EnvironmentVariables ?? []);
    expect(envVars.some((v: any) => v.Name === 'CDK_CICD_MODE' && v.Value === 'pipeline')).toBe(true);
  });

  test('regression: a Node project (no ci.language) still renders npm ci + npm run cdk synth', () => {
    const stack = new Stack(new App(), 'NodePipeline', { env: { account: '111111111111', region: 'us-west-2' } });
    void new CdkPipelinesEngine(stack, 'Cd', {
      config: defineCICD({ application: 'shop', repository: Repository.codecommit('shop'), stages: ['dev'] }),
      stages: new StubStages(),
    });
    const projects = Template.fromStack(stack).findResources('AWS::CodeBuild::Project');
    const specs = Object.values(projects).map((p: any) => JSON.stringify(p.Properties.Source.BuildSpec));
    expect(
      specs.some((s) => s.includes('npm ci') && s.includes('npm run audit') && s.includes('npm run cdk synth')),
    ).toBe(true);
    expect(specs.some((s) => s.includes('pip-audit'))).toBe(false);
  });
});
