// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The flat CodePipeline engine with a Python CDK app: the CI build project runs the Python default
// build phase (pip-audit/mypy/pytest), and the managed image declares both Node and Python runtimes.

import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { defineCICD } from '../../../src/config/define';
import { Repository } from '../../../src/config/repository';
import { CiLanguage } from '../../../src/config/types';
import { CodePipelineEngine } from '../../../src/engine/codepipeline/CodePipelineEngine';

function render(config: ReturnType<typeof defineCICD>): Template {
  const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
  new CodePipelineEngine().render(stack, { config, pipelineName: 'shop-pipeline' });
  return Template.fromStack(stack);
}

/** The parsed buildspec of the one CodeBuild project whose build commands contain `marker`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function specContaining(t: Template, marker: string): any {
  return Object.values(t.findResources('AWS::CodeBuild::Project'))
    .map((p) => JSON.parse(p.Properties.Source.BuildSpec))
    .find((s) => JSON.stringify(s.phases.build.commands).includes(marker));
}

function pythonConfig(): ReturnType<typeof defineCICD> {
  return defineCICD({
    application: 'shop',
    repository: Repository.s3('shop-src/app.zip'),
    stages: ['dev'],
    ci: { language: CiLanguage.PYTHON },
  });
}

describe('m4-codepipeline: CodePipelineEngine — Python CI', () => {
  test('the CI build project runs the Python build phase (pip-audit/mypy/pytest), not npm', () => {
    const t = render(pythonConfig());
    const spec = specContaining(t, 'pip-audit');
    expect(spec).toBeDefined();
    const commands = JSON.stringify(spec.phases.build.commands);
    expect(commands).toContain('pip install -r requirements.txt');
    expect(commands).toContain('pip-audit');
    expect(commands).toContain('mypy');
    expect(commands).toContain('pytest');
    expect(commands).not.toContain('npm ci');
    expect(commands).not.toContain('npm run');
  });

  test('the CI build still appends the wrapper synth (cdk-cicd synth) for a Python project', () => {
    const t = render(pythonConfig());
    const spec = specContaining(t, 'pip-audit');
    // The CodePipeline engine appends its build-phase validation synth via the wrapper CLI.
    expect(JSON.stringify(spec)).toContain('cdk-cicd synth');
  });

  test('the managed build image declares BOTH the Node and Python runtimes', () => {
    const t = render(pythonConfig());
    const spec = specContaining(t, 'pip-audit');
    const runtimes = JSON.stringify(spec.phases.install?.['runtime-versions'] ?? {});
    expect(runtimes).toContain('nodejs');
    expect(runtimes).toContain('python');
  });

  test('regression: a Node project (no ci.language) still renders the npm build phase', () => {
    const config = defineCICD({ application: 'shop', repository: Repository.s3('shop-src/app.zip'), stages: ['dev'] });
    const t = render(config);
    const spec = specContaining(t, 'npm run audit');
    expect(spec).toBeDefined();
    expect(JSON.stringify(spec)).not.toContain('pip-audit');
  });
});
