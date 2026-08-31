// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The GitHub Actions engine with a Python CDK app (best-effort support): the Synth job runs the Python
// build phase + `cdk synth`, and an `actions/setup-python` step is injected into the workflow.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { App, Stack, Stage } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { defineCICD } from '../../../src/config/define';
import { Repository } from '../../../src/config/repository';
import { CiLanguage, ResolvedCicdConfig } from '../../../src/config/types';
import { CdkPipelinesStageContext, IStageProvider } from '../../../src/engine/cdkpipelines/CdkPipelinesEngine';
import { GitHubActionsEngine } from '../../../src/engine/github/GitHubActionsEngine';

class StubStages implements IStageProvider {
  public stacks(stage: Stage, context: CdkPipelinesStageContext): void {
    const stack = new Stack(stage, 'App');
    new s3.Bucket(stack, `Bucket-${context.stageName}`);
  }
}

let workflowDir: string;
beforeEach(() => {
  workflowDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-cicd-gha-python-'));
});
afterEach(() => {
  fs.rmSync(workflowDir, { recursive: true, force: true });
});

function config(overrides: Partial<Parameters<typeof defineCICD>[0]> = {}): ResolvedCicdConfig {
  return defineCICD({
    application: 'shop',
    repository: Repository.github('org/shop'),
    stages: ['dev'],
    githubActions: { workflowPath: path.join(workflowDir, '.github', 'workflows', 'deploy.yml') },
    ...overrides,
  });
}

function renderYaml(overrides: Partial<Parameters<typeof defineCICD>[0]> = {}): string {
  const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
  const engine = new GitHubActionsEngine(stack, 'Cd', { config: config(overrides), stages: new StubStages() });
  Template.fromStack(stack); // force lazy doBuildPipeline() so workflowFile + JsonPatches apply
  return engine.pipeline.workflowFile.toYaml();
}

describe('GitHubActionsEngine — Python CI (best-effort)', () => {
  test('the Synth job runs the Python build phase + cdk synth (no npm)', () => {
    const yaml = renderYaml({ ci: { language: CiLanguage.PYTHON } });
    expect(yaml).toContain('pip-audit');
    expect(yaml).toContain('mypy');
    expect(yaml).toContain('pytest');
    expect(yaml).toContain('cdk synth');
    expect(yaml).not.toContain('npm ci');
    expect(yaml).not.toContain('npm run');
  });

  test('an actions/setup-python step is injected for a Python project', () => {
    const yaml = renderYaml({ ci: { language: CiLanguage.PYTHON } });
    expect(yaml).toContain('actions/setup-python');
  });

  test('regression: a Node project renders the npm build phase and injects no setup-python', () => {
    const yaml = renderYaml();
    expect(yaml).toContain('npm run audit');
    expect(yaml).toContain('npm run cdk synth');
    expect(yaml).not.toContain('setup-python');
    expect(yaml).not.toContain('pip-audit');
  });
});
