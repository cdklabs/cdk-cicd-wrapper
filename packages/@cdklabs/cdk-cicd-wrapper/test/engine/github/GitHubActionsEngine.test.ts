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
import { parse } from 'yaml';
import { defineCICD } from '../../../src/config/define';
import { Repository } from '../../../src/config/repository';
import { GitHubActionsConfig, RegionOrder, ResolvedCicdConfig } from '../../../src/config/types';
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

  test('the Synth job runs npm ci + the default scripts + npm run cdk synth with CDK_CICD_MODE=pipeline', () => {
    const { engine } = render();
    const yaml = engine.pipeline.workflowFile.toYaml();
    expect(yaml).toContain('npm ci');
    expect(yaml).toContain('npm run audit');
    expect(yaml).toContain('npm run build');
    expect(yaml).toContain('npm run test');
    // `npm run cdk synth` (never npx) through cdk.json's single `cdk-cicd exec` entry; CDK_CICD_MODE
    // renders the pipeline so self-mutation keeps producing the workflow the commit-check compares.
    expect(yaml).toContain('npm run cdk synth');
    expect(yaml).toContain('CDK_CICD_MODE');
  });

  test('ci.image becomes the Build-Synth container and does not affect deployment jobs', () => {
    const image = 'public.ecr.aws/example/ci-image:2026-09';
    const { engine } = render({ ci: { image } });
    const workflow = parse(engine.pipeline.workflowFile.toYaml()) as {
      jobs: Record<string, { container?: { image?: string } }>;
    };

    expect(workflow.jobs['Build-Synth'].container).toEqual({ image });
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      if (jobName !== 'Build-Synth') expect(job.container).toBeUndefined();
    }
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

  test('RegionOrder.PARALLEL removes dependencies between a stage’s regional deploy jobs', () => {
    const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
    const engine = new GitHubActionsEngine(stack, 'Cd', {
      config: config({
        stages: [
          {
            name: 'prod',
            env: {
              account: '111111111111',
              regions: ['eu-west-1', 'us-east-1'],
              regionOrder: RegionOrder.PARALLEL,
            },
          },
        ],
      }),
      stages: new StubStages(),
    });
    Template.fromStack(stack);
    const yaml = engine.pipeline.workflowFile.toYaml();
    const jobs = (parse(yaml) as { jobs: Record<string, { environment?: string; needs?: string | string[] }> }).jobs;
    const [euJobName, euJob] = Object.entries(jobs).find(([, job]) => job.environment === 'prod-eu-west-1') ?? [];
    const [usJobName, usJob] = Object.entries(jobs).find(([, job]) => job.environment === 'prod-us-east-1') ?? [];
    const needs = (job: { needs?: string | string[] } | undefined): string[] =>
      job?.needs === undefined ? [] : Array.isArray(job.needs) ? job.needs : [job.needs];

    expect(euJobName).toBeDefined();
    expect(usJobName).toBeDefined();
    expect(needs(euJob)).not.toContain(usJobName);
    expect(needs(usJob)).not.toContain(euJobName);
    expect(needs(euJob)).toEqual(needs(usJob));
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

  test('a generic npm registry fetches and masks its token after OIDC auth, then grants exact secret read', () => {
    const secretArn = 'arn:aws:secretsmanager:eu-west-1:111111111111:secret:npm-token-abc123';
    const { stack, engine } = render({
      proxy: { proxySecretArn: 'arn:aws:secretsmanager:us-west-2:111111111111:secret:proxy-abc123' },
      npmRegistry: {
        url: 'https://npm.example.com/',
        scope: 'cdklabs',
        basicAuthSecretArn: secretArn,
      },
      codeArtifact: { domain: 'domain', repository: 'repository', npmScope: 'internal' },
    });
    const workflow = parse(engine.pipeline.workflowFile.toYaml()) as {
      jobs: Record<string, { steps: Array<{ name?: string; run?: string }> }>;
    };
    const steps = workflow.jobs['Build-Synth'].steps;
    const credentialsIndex = steps.findIndex((step) => step.name === 'Authenticate Via OIDC Role');
    const loginIndex = steps.findIndex((step) => step.name === 'Login');
    const buildIndex = steps.findIndex((step) => step.name === 'Build');
    const login = steps[loginIndex].run ?? '';
    const proxyIndex = login.indexOf('export HTTP_PROXY=');
    const fetchIndex = login.indexOf('aws secretsmanager get-secret-value');
    const maskIndex = login.indexOf('::add-mask::$NPM_AUTH_TOKEN');
    const npmrcIndex = login.indexOf('@cdklabs:registry=https://npm.example.com/');
    const codeArtifactIndex = login.indexOf('aws codeartifact login');

    expect(credentialsIndex).toBeGreaterThanOrEqual(0);
    expect(loginIndex).toBeGreaterThan(credentialsIndex);
    expect(buildIndex).toBeGreaterThan(loginIndex);
    expect(fetchIndex).toBeGreaterThan(proxyIndex);
    expect(maskIndex).toBeGreaterThan(fetchIndex);
    expect(npmrcIndex).toBeGreaterThan(maskIndex);
    expect(codeArtifactIndex).toBeGreaterThan(npmrcIndex);
    expect(login).toContain(`--secret-id '${secretArn}' --region 'eu-west-1'`);
    expect(login).toContain('//npm.example.com/:_authToken=$NPM_AUTH_TOKEN');

    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'secretsmanager:GetSecretValue',
            Resource: secretArn,
          }),
        ]),
      }),
    });
  });

  test('a secret-backed deploy-role ExternalId authenticates the Synth job and grants secret read', () => {
    const secretArn = 'arn:aws:secretsmanager:eu-west-1:111111111111:secret:deploy-external-id-abc123';
    const { stack, engine } = render({
      deployRoleExternalId: `resolve:secretsmanager:${secretArn}`,
      stages: [{ name: 'prod', deployment: { deployRole: 'arn:aws:iam::222222222222:role/Deploy' } }],
    });
    const yaml = engine.pipeline.workflowFile.toYaml();

    expect(yaml.slice(yaml.indexOf('Build-Synth:'), yaml.indexOf('Assets-'))).toContain('Authenticate Via OIDC Role');
    const policies = JSON.stringify(Template.fromStack(stack).findResources('AWS::IAM::Policy'));
    expect(policies).toContain('secretsmanager:GetSecretValue');
    expect(policies).toContain(secretArn);
  });

  test('without AWS-backed install features the Synth job needs no extra credential step', () => {
    const { engine } = render();
    const yaml = engine.pipeline.workflowFile.toYaml();
    // Exactly one "Authenticate Via OIDC Role" step in the Synth job: the one cdk-pipelines-github's own
    // asset-publish/deploy jobs already add, not a second one this engine patched in.
    const synthJob = yaml.slice(yaml.indexOf('Build-Synth:'), yaml.indexOf('Assets-'));
    expect(synthJob).not.toContain('Authenticate Via OIDC Role');
    expect(synthJob).not.toContain('Login');
  });

  test('warmAccountsFromSsm scans SSM in the Login step and exports the ACCOUNT_<STAGE> loop', () => {
    const { engine } = render({ warmAccountsFromSsm: true, qualifier: 'shopq' });
    const yaml = engine.pipeline.workflowFile.toYaml();
    // The Login step carries the ssmWarmingCommands: the get-parameters-by-path scan (scoped to the
    // qualifier path) plus the *Account* -> ACCOUNT_<STAGE> export loop.
    expect(yaml).toContain('aws ssm get-parameters-by-path --path "/shopq/"');
    expect(yaml).toContain('export "ACCOUNT_${_warm_stage}=${_warm_value}"');
    // The warming block sits inside the Synth job's Login step, ahead of the build commands.
    const synthJob = yaml.slice(yaml.indexOf('Build-Synth:'), yaml.indexOf('Assets-'));
    expect(synthJob).toContain('aws ssm get-parameters-by-path --path "/shopq/"');
  });

  test('warmAccountsFromSsm grants the OIDC gitHubActionRole ssm:GetParametersByPath on /<qualifier>/*', () => {
    const { stack } = render({ warmAccountsFromSsm: true, qualifier: 'shopq' });
    const t = Template.fromStack(stack);
    t.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'ssm:GetParametersByPath',
            // The grant now comes from the shared ssmWarmingReadStatements helper, which uses
            // stack.partition (a token) -> the resource renders as an Fn::Join ending in the
            // qualifier-scoped parameter path.
            Resource: {
              'Fn::Join': Match.arrayWith([Match.arrayWith([Match.stringLikeRegexp(':parameter/shopq/\\*$')])]),
            },
          }),
        ]),
      }),
    });
  });

  test('without warmAccountsFromSsm neither the SSM scan nor the ssm:GetParametersByPath statement is present', () => {
    const { stack, engine } = render();
    const yaml = engine.pipeline.workflowFile.toYaml();
    expect(yaml).not.toContain('aws ssm get-parameters-by-path');
    expect(yaml).not.toContain('ACCOUNT_${_warm_stage}');
    const t = Template.fromStack(stack);
    // No IAM policy statement grants the SSM scan action on the OIDC role.
    t.resourcePropertiesCountIs(
      'AWS::IAM::Policy',
      {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([Match.objectLike({ Action: 'ssm:GetParametersByPath' })]),
        }),
      },
      0,
    );
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
