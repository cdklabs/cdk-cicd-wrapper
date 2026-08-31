// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The GitHub Actions engine: renders a `.github/workflows/deploy.yml` instead of an AWS-hosted pipeline.
// `workflowPath` is always pointed at a per-test scratch dir (a real file gets written there at synth --
// `cdk-pipelines-github` writes it as a side effect of building the pipeline, not deferred to `cdk.out`)
// so tests never touch the package's own `.github/workflows/`.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { App, Aspects, Stack, Stage } from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { AwsSolutionsChecks } from 'cdk-nag';
import { defineCICD } from '../../../src/config/define';
import { Repository } from '../../../src/config/repository';
import { GitHubActionsConfig, ResolvedCicdConfig } from '../../../src/config/types';
import { CdkPipelinesStageContext, IStageProvider } from '../../../src/engine/cdkpipelines/CdkPipelinesEngine';
import { GitHubActionsEngine } from '../../../src/engine/github/GitHubActionsEngine';

// A stand-in app-stack provider: puts one trivial stack (a bucket) into each stage, the same role
// `StubStages` plays in the CdkPipelinesEngine tests.
class StubStages implements IStageProvider {
  public stacks(stage: Stage, context: CdkPipelinesStageContext): void {
    const stack = new Stack(stage, 'App');
    new s3.Bucket(stack, `Bucket-${context.stageName}`);
  }
}

let workflowDir: string;
beforeEach(() => {
  workflowDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-cicd-github-actions-'));
});
afterEach(() => {
  fs.rmSync(workflowDir, { recursive: true, force: true });
});

function workflowPath(): string {
  return path.join(workflowDir, '.github', 'workflows', 'deploy.yml');
}

function config(overrides: Partial<Parameters<typeof defineCICD>[0]> = {}): ResolvedCicdConfig {
  return defineCICD({
    application: 'shop',
    repository: Repository.github('org/shop'),
    stages: ['dev', { name: 'prod', env: { account: '222222222222', region: 'us-east-1' }, manualApproval: true }],
    githubActions: { workflowPath: workflowPath() },
    ...overrides,
  });
}

function render(overrides: Partial<Parameters<typeof defineCICD>[0]> = {}): {
  stack: Stack;
  engine: GitHubActionsEngine;
} {
  const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
  const engine = new GitHubActionsEngine(stack, 'Cd', { config: config(overrides), stages: new StubStages() });
  // `doBuildPipeline()` (which populates `workflowFile`, incl. applying the JsonPatch calls) runs lazily
  // at synth time -- force it now so `engine.pipeline.workflowFile.toYaml()` reflects the real content.
  Template.fromStack(stack);
  return { stack, engine };
}

describe('GitHubActionsEngine', () => {
  test('rejects a repository that is not Repository.github(...)', () => {
    const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
    expect(
      () =>
        new GitHubActionsEngine(stack, 'Cd', {
          config: defineCICD({ application: 'shop', repository: Repository.codecommit('shop'), stages: ['dev'] }),
          stages: new StubStages(),
        }),
    ).toThrow(/Repository\.github/);
  });

  test('creates a GitHubActionRole with a literal name and trust scoped to the configured repository', () => {
    const { stack } = render();
    const t = Template.fromStack(stack);
    t.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'shop-github-role',
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Condition: { StringLike: { 'token.actions.githubusercontent.com:sub': ['repo:org/shop:*'] } },
          }),
        ]),
      }),
    });
  });

  test('an explicit roleName/subjectClaims override the derived defaults', () => {
    const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
    const githubActions: GitHubActionsConfig = {
      roleName: 'custom-role',
      subjectClaims: ['repo:org/shop:ref:refs/heads/main'],
      workflowPath: workflowPath(),
    };
    new GitHubActionsEngine(stack, 'Cd', {
      config: config({ githubActions }),
      stages: new StubStages(),
    });
    const t = Template.fromStack(stack);
    t.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'custom-role',
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Condition: {
              StringLike: { 'token.actions.githubusercontent.com:sub': ['repo:org/shop:ref:refs/heads/main'] },
            },
          }),
        ]),
      }),
    });
  });

  test('an existing openIdConnectProviderArn is referenced instead of creating a new provider', () => {
    const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
    new GitHubActionsEngine(stack, 'Cd', {
      config: config({
        githubActions: {
          openIdConnectProviderArn: 'arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com',
          workflowPath: workflowPath(),
        },
      }),
      stages: new StubStages(),
    });
    const t = Template.fromStack(stack);
    // No new OIDC provider custom resource -- only the role references the existing provider ARN.
    t.resourceCountIs('Custom::AWSCDKOpenIdConnectProvider', 0);
    t.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Principal: {
              Federated: 'arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com',
            },
          }),
        ]),
      }),
    });
  });

  test('the workflow embeds a LITERAL role ARN (never an unresolved CDK token)', () => {
    const { engine } = render();
    const yaml = engine.pipeline.workflowFile.toYaml();
    expect(yaml).toContain('role-to-assume: arn:aws:iam::111111111111:role/shop-github-role');
    expect(yaml).not.toContain('Token[');
  });

  test('the Synth job runs npm ci + the golden-path scripts + cdk synth', () => {
    const { engine } = render();
    const yaml = engine.pipeline.workflowFile.toYaml();
    expect(yaml).toContain('npm ci');
    expect(yaml).toContain('npm run audit');
    expect(yaml).toContain('npm run build');
    expect(yaml).toContain('npm run test');
    expect(yaml).toContain('npx cdk synth');
  });

  test('each stage gets its own GitHub Environment named after the stage', () => {
    const { engine } = render();
    const yaml = engine.pipeline.workflowFile.toYaml();
    expect(yaml).toContain('environment: dev');
    expect(yaml).toContain('environment: prod');
    // The gated ('prod') and ungated ('dev') stage are otherwise rendered the same way -- GitHub
    // Environments (configured on GitHub's side), not a CDK ManualApprovalStep, are the gate.
  });

  test('a multi-region stage becomes one job per region, each its own GitHub Environment', () => {
    const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
    const engine = new GitHubActionsEngine(stack, 'Cd', {
      config: config({
        stages: [
          { name: 'prod', env: { account: '111111111111', regions: ['eu-west-1', 'us-east-1'] }, manualApproval: true },
        ],
      }),
      stages: new StubStages(),
    });
    Template.fromStack(stack);
    const yaml = engine.pipeline.workflowFile.toYaml();
    expect(yaml).toContain('environment: prod-eu-west-1');
    expect(yaml).toContain('environment: prod-us-east-1');
  });

  test('a stage with no explicit account defaults to the pipeline account, not env-agnostic', () => {
    // cdk-pipelines-github needs a concrete account/region per stage (a static YAML step, unlike an
    // AWS-hosted CodePipeline deploy action) -- an agnostic 'dev' stage must not make it throw.
    const { stack } = render();
    expect(() => Template.fromStack(stack)).not.toThrow();
  });

  test('a codeArtifact config logs in ahead of the build, with credentials configured first', () => {
    const { engine } = render({ codeArtifact: { domain: 'd', repository: 'r', npmScope: 'cdklabs' } });
    const yaml = engine.pipeline.workflowFile.toYaml();
    const loginIdx = yaml.indexOf('aws codeartifact login');
    const credsIdx = yaml.indexOf('Authenticate Via OIDC Role');
    expect(loginIdx).toBeGreaterThan(-1);
    expect(credsIdx).toBeGreaterThan(-1);
    expect(credsIdx).toBeLessThan(loginIdx);
    expect(yaml).toContain('--namespace cdklabs');
  });

  test('a proxy config exports HTTP(S)_PROXY ahead of the build', () => {
    const { engine } = render({
      proxy: { proxySecretArn: 'arn:aws:secretsmanager:us-west-2:111111111111:secret:proxy-abc123' },
    });
    const yaml = engine.pipeline.workflowFile.toYaml();
    expect(yaml).toContain('export HTTP_PROXY=');
    expect(yaml).toContain('curl -Is --connect-timeout 5 https://aws.amazon.com');
  });

  test('without codeArtifact/proxy the Synth job needs no extra credential step', () => {
    const { engine } = render();
    const yaml = engine.pipeline.workflowFile.toYaml();
    // Exactly one "Authenticate Via OIDC Role" step in the Synth job: the one cdk-pipelines-github's own
    // asset-publish/deploy jobs already add, not a second one this engine patched in.
    const synthJob = yaml.slice(yaml.indexOf('Build-Synth:'), yaml.indexOf('Assets-'));
    expect(synthJob).not.toContain('Authenticate Via OIDC Role');
    expect(synthJob).not.toContain('Login');
  });

  test('emits no cdk-nag errors on its OWN generated infra (the GitHubActionRole)', () => {
    const app = new App();
    const stack = new Stack(app, 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
    new GitHubActionsEngine(stack, 'Cd', { config: config(), stages: new StubStages() });
    Aspects.of(app).add(new AwsSolutionsChecks({ verbose: false }));
    Template.fromStack(stack);
    expect(Annotations.fromStack(stack).findError('*', Match.stringLikeRegexp('AwsSolutions-.*'))).toHaveLength(0);
  });
});
