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
import { App, Aspects, Aws, BOOTSTRAP_QUALIFIER_CONTEXT, Stack, Stage } from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { AwsSolutionsChecks } from 'cdk-nag';
import { parse } from 'yaml';
import { defineCICD } from '../../../src/config/define';
import { Repository } from '../../../src/config/repository';
import { GitHubActionsConfig, RegionOrder, ResolvedCicdConfig, SynthesizerType } from '../../../src/config/types';
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
  const githubActions: GitHubActionsConfig = {
    workflowPath: workflowPath(),
    environmentProtectionConfigured: true,
    ...(overrides.githubActions ?? {}),
  };
  return defineCICD({
    application: 'shop',
    repository: Repository.github('org/shop'),
    stages: ['dev', { name: 'prod', env: { account: '222222222222', region: 'us-east-1' }, manualApproval: true }],
    ...overrides,
    githubActions,
  });
}

function render(
  overrides: Partial<Parameters<typeof defineCICD>[0]> = {},
  context: Record<string, unknown> = {},
): {
  stack: Stack;
  engine: GitHubActionsEngine;
} {
  const stack = new Stack(new App({ context }), 'PipelineStack', {
    env: { account: '111111111111', region: 'us-west-2' },
  });
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

  test('rejects APP_STAGING because the installed alpha does not support CDK Pipelines', () => {
    const stack = new Stack(new App(), 'PipelineStack', {
      env: { account: '111111111111', region: 'us-west-2' },
    });
    expect(
      () =>
        new GitHubActionsEngine(stack, 'Cd', {
          config: config({ synthesizer: { type: SynthesizerType.APP_STAGING } }),
          stages: new StubStages(),
        }),
    ).toThrow(/GITHUB_ACTIONS cannot use SynthesizerType\.APP_STAGING.*does not support CDK Pipelines.*cross-Stage/);
  });

  test('requires a concrete pipeline account and region for the literal OIDC role ARN', () => {
    const stack = new Stack(new App(), 'PipelineStack');
    expect(
      () =>
        new GitHubActionsEngine(stack, 'Cd', {
          config: config({ stages: ['dev'] }),
          stages: new StubStages(),
        }),
    ).toThrow(/requires a concrete pipeline stack account and region.*literal OIDC role ARN/);
  });

  test('rejects a concrete pipeline region unknown to the installed CDK region table', () => {
    const stack = new Stack(new App(), 'PipelineStack', {
      env: { account: '111111111111', region: 'unknown-future-1' },
    });
    expect(
      () =>
        new GitHubActionsEngine(stack, 'Cd', {
          config: config({ stages: ['dev'] }),
          stages: new StubStages(),
        }),
    ).toThrow(/pipeline region 'unknown-future-1' is not known/);
  });

  test('rejects a non-commercial pipeline partition unsupported by the installed GitHub OIDC helper', () => {
    const stack = new Stack(new App(), 'PipelineStack', {
      env: { account: '111111111111', region: 'us-gov-west-1' },
    });
    expect(
      () =>
        new GitHubActionsEngine(stack, 'Cd', {
          config: config({ stages: ['dev'] }),
          stages: new StubStages(),
        }),
    ).toThrow(/does not support pipeline partition 'aws-us-gov'.*OIDC helper.*audience/);
  });

  test('requires concrete target account and region values for literal workflow jobs', () => {
    expect(() =>
      render({
        stages: [
          {
            name: 'dev',
            env: { account: Aws.ACCOUNT_ID, region: Aws.REGION },
          },
        ],
      }),
    ).toThrow(/stage 'dev' requires concrete account and region values.*literal deployment jobs/);
  });

  test('rejects target Regions in a different AWS partition', () => {
    expect(() =>
      render({
        stages: [
          {
            name: 'isolated',
            env: { account: '111111111111', region: 'us-iso-east-1' },
          },
        ],
      }),
    ).toThrow(/cannot mix AWS partitions.*'aws'.*stage 'isolated'.*'aws-iso'/);
  });

  test('rejects target Regions unknown to the installed CDK region table', () => {
    expect(() =>
      render({
        stages: [
          {
            name: 'future',
            env: { account: '111111111111', region: 'unknown-future-1' },
          },
        ],
      }),
    ).toThrow(/stage 'future' region 'unknown-future-1' is not known/);
  });

  test('rejects a CodeArtifact Region in another partition', () => {
    expect(() =>
      render({
        stages: ['dev'],
        codeArtifact: { domain: 'packages', repository: 'npm', region: 'cn-north-1' },
      }),
    ).toThrow(/CodeArtifact region 'cn-north-1'.*'aws-cn'.*pipeline partition 'aws'/);
  });

  test('rejects a CodeArtifact Region unknown to the installed CDK region table', () => {
    expect(() =>
      render({
        stages: ['dev'],
        codeArtifact: { domain: 'packages', repository: 'npm', region: 'unknown-future-1' },
      }),
    ).toThrow(/CodeArtifact region 'unknown-future-1' is not known/);
  });

  test('rejects a publish-assets authentication Region in another partition', () => {
    expect(() =>
      render({
        stages: ['dev'],
        githubActions: {
          workflowPath: workflowPath(),
          environmentProtectionConfigured: true,
          publishAssetsAuthRegion: 'cn-north-1',
        },
      }),
    ).toThrow(/publishAssetsAuthRegion 'cn-north-1'.*'aws-cn'.*pipeline is in 'aws'/);
  });

  test('provisions compliance logging and applies it inside application Stage boundaries', () => {
    const { stack, engine } = render({
      stages: ['dev'],
      complianceLogBucketName: 'shop-compliance-log-bucket',
    });
    const pipelineTemplate = Template.fromStack(stack);
    const destination = Object.values(pipelineTemplate.findResources('AWS::S3::Bucket')).find(
      (bucket: any) => bucket.Properties.BucketName === 'shop-compliance-log-bucket',
    ) as any;
    expect(destination).toBeDefined();
    expect(destination.Properties.LoggingConfiguration).toBeUndefined();

    const applicationStack = engine.node.findAll().find((construct): construct is Stack => construct instanceof Stack);
    expect(applicationStack).toBeDefined();
    Template.fromStack(applicationStack!).hasResourceProperties('AWS::S3::Bucket', {
      LoggingConfiguration: {
        DestinationBucketName: 'shop-compliance-log-bucket',
      },
    });
  });

  test('imports an existing compliance destination without synthesizing its bucket or policy', () => {
    const { stack, engine } = render({
      stages: ['dev'],
      complianceLogBucketName: 'shop-existing-compliance-log-bucket',
      createComplianceLogBucket: false,
    });
    const pipelineTemplate = Template.fromStack(stack);
    pipelineTemplate.resourceCountIs('AWS::S3::Bucket', 0);
    pipelineTemplate.resourceCountIs('AWS::S3::BucketPolicy', 0);

    const applicationStack = engine.node.findAll().find((construct): construct is Stack => construct instanceof Stack);
    expect(applicationStack).toBeDefined();
    Template.fromStack(applicationStack!).hasResourceProperties('AWS::S3::Bucket', {
      LoggingConfiguration: {
        DestinationBucketName: 'shop-existing-compliance-log-bucket',
      },
    });
  });

  test('rejects compliance logging for a cross-account or cross-region application stage', () => {
    expect(() =>
      render({
        complianceLogBucketName: 'shop-compliance-log-bucket',
        stages: [
          {
            name: 'prod',
            env: { account: '222222222222', region: 'us-east-1' },
          },
        ],
      }),
    ).toThrow(/compliance logging cannot target GitHub Actions stage 'prod'.*same account and region/);
  });

  test('treats an omitted synthesizer in a legacy resolved config as DEFAULT', () => {
    const resolved = config({ stages: ['dev'] });
    const legacy = { ...resolved } as Partial<ResolvedCicdConfig>;
    Reflect.deleteProperty(legacy, 'synthesizer');
    const stack = new Stack(new App(), 'PipelineStack', {
      env: { account: '111111111111', region: 'us-west-2' },
    });

    expect(
      () =>
        new GitHubActionsEngine(stack, 'Cd', {
          config: legacy as ResolvedCicdConfig,
          stages: new StubStages(),
        }),
    ).not.toThrow();
    expect(() => Template.fromStack(stack)).not.toThrow();
  });

  test('fails closed when manualApproval is configured without acknowledging GitHub environment protection', () => {
    const stack = new Stack(new App(), 'PipelineStack', {
      env: { account: '111111111111', region: 'us-west-2' },
    });
    expect(
      () =>
        new GitHubActionsEngine(stack, 'Cd', {
          config: config({
            githubActions: {
              workflowPath: workflowPath(),
              environmentProtectionConfigured: false,
            },
          }),
          stages: new StubStages(),
        }),
    ).toThrow(/Configure required reviewers.*environmentProtectionConfigured: true/);
  });

  test('creates a GitHubActionRole with a literal name and trust scoped to the configured repository', () => {
    const { stack } = render();
    const t = Template.fromStack(stack);
    t.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'shop-github-role',
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Condition: {
              StringLike: { 'token.actions.githubusercontent.com:sub': ['repo:org/shop:*'] },
              StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
            },
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
            Condition: Match.objectLike({
              StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
            }),
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

  test('defaults OIDC authentication to the pipeline Region instead of us-west-2', () => {
    const stack = new Stack(new App(), 'PipelineStack', {
      env: { account: '111111111111', region: 'eu-central-1' },
    });
    const engine = new GitHubActionsEngine(stack, 'Cd', {
      config: config({ stages: ['dev'] }),
      stages: new StubStages(),
    });
    const workflow = parse(engine.pipeline.workflowFile.toYaml()) as {
      jobs: Record<string, { steps: Array<{ name?: string; with?: Record<string, string> }> }>;
    };
    const auth = workflow.jobs['Build-Synth'].steps.find((step) => step.name === 'Authenticate Via OIDC Role');
    expect(auth?.with?.['aws-region']).toBe('eu-central-1');
  });

  test('builds deployment placeholders under the validated partition and restores ambient process state', () => {
    const previousPartition = process.env.CDK_AWS_PARTITION;
    process.env.CDK_AWS_PARTITION = 'aws-cn';
    try {
      const { engine } = render({ stages: ['dev'] });
      const yaml = engine.pipeline.workflowFile.toYaml();
      expect(process.env.CDK_AWS_PARTITION).toBe('aws-cn');
      expect(yaml).toContain('CDK_AWS_PARTITION: aws');
      expect(yaml).not.toContain('arn:aws-cn:');
    } finally {
      if (previousPartition === undefined) {
        delete process.env.CDK_AWS_PARTITION;
      } else {
        process.env.CDK_AWS_PARTITION = previousPartition;
      }
    }
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

  test('keeps a public external-registry Build-Synth container on the anonymous pull path', () => {
    const image = 'registry.example.com/public/ci-image:stable';
    const { engine } = render({ ci: { image } });
    const workflow = parse(engine.pipeline.workflowFile.toYaml()) as {
      jobs: Record<string, { container?: { image?: string; credentials?: unknown } }>;
    };
    expect(workflow.jobs['Build-Synth'].container).toEqual({ image });
  });

  test('renders external-registry credentials as GitHub secret expressions', () => {
    const image = 'registry.example.com/private/ci-image:stable';
    const { engine } = render({
      ci: { image },
      githubActions: {
        buildContainerCredentials: {
          usernameSecretName: 'REGISTRY_USERNAME',
          passwordSecretName: 'REGISTRY_PASSWORD',
        },
      },
    });
    const workflow = parse(engine.pipeline.workflowFile.toYaml()) as {
      jobs: Record<
        string,
        {
          container?: {
            image?: string;
            credentials?: { username?: string; password?: string };
          };
        }
      >;
    };

    expect(workflow.jobs['Build-Synth'].container).toEqual({
      image,
      credentials: {
        username: '${{ secrets.REGISTRY_USERNAME }}',
        password: '${{ secrets.REGISTRY_PASSWORD }}',
      },
    });
  });

  test('rejects GitHub container credentials without ci.image', () => {
    expect(() =>
      render({
        githubActions: {
          buildContainerCredentials: {
            usernameSecretName: 'REGISTRY_USERNAME',
            passwordSecretName: 'REGISTRY_PASSWORD',
          },
        },
      }),
    ).toThrow(/buildContainerCredentials requires ci\.image/);
  });

  test.each([
    ['usernameSecretName', '1STARTS_WITH_NUMBER'],
    ['usernameSecretName', 'GITHUB_TOKEN'],
    ['passwordSecretName', 'contains-dash'],
    ['passwordSecretName', ''],
  ])('rejects invalid GitHub registry %s %p', (field, secretName) => {
    expect(() =>
      render({
        ci: { image: 'registry.example.com/private/ci-image:stable' },
        githubActions: {
          buildContainerCredentials: {
            usernameSecretName: field === 'usernameSecretName' ? secretName : 'REGISTRY_USERNAME',
            passwordSecretName: field === 'passwordSecretName' ? secretName : 'REGISTRY_PASSWORD',
          },
        },
      }),
    ).toThrow(new RegExp(`buildContainerCredentials\\.${field}.*not a valid GitHub secret name`));
  });

  test('rejects CodeBuild registry credentials in the GitHub Actions engine', () => {
    expect(() =>
      render({
        ci: {
          image: 'registry.example.com/private/ci-image:stable',
          codeBuildImageCredentials: {
            secretArn: 'arn:aws:secretsmanager:us-west-2:111111111111:secret:registry-ABC123',
          },
        },
      }),
    ).toThrow(/codeBuildImageCredentials is supported only by the CodeBuild engines/);
  });

  test('accepts a public shorthand image pinned by digest', () => {
    const image = `ubuntu@sha256:${'a'.repeat(64)}`;
    const { engine } = render({ ci: { image } });
    const workflow = parse(engine.pipeline.workflowFile.toYaml()) as {
      jobs: Record<string, { container?: { image?: string; credentials?: unknown } }>;
    };
    expect(workflow.jobs['Build-Synth'].container).toEqual({ image });
  });

  test('rejects a managed CodeBuild image ID because it is not a pullable GitHub job container', () => {
    expect(() => render({ ci: { image: 'aws/codebuild/standard:7.0' } })).toThrow(
      /managed CodeBuild ci\.image.*not a pullable OCI job-container reference/,
    );
  });

  test('rejects a private ECR Build-Synth container because it is pulled before OIDC authentication', () => {
    expect(() =>
      render({
        ci: { image: '111111111111.dkr.ecr.us-west-2.amazonaws.com/platform/ci:stable' },
      }),
    ).toThrow(/cannot use private ECR ci\.image.*before the OIDC authentication step/);
  });

  test('rejects GitHub username/password credentials for private ECR images', () => {
    expect(() =>
      render({
        ci: { image: '111111111111.dkr.ecr.us-west-2.amazonaws.com/platform/ci:stable' },
        githubActions: {
          buildContainerCredentials: {
            usernameSecretName: 'REGISTRY_USERNAME',
            passwordSecretName: 'REGISTRY_PASSWORD',
          },
        },
      }),
    ).toThrow(/cannot use private ECR ci\.image.*do not implement the AWS ECR authorization-token exchange/);
  });

  test('rejects private ECR Build-Synth containers in isolated partitions before OIDC authentication', () => {
    expect(() =>
      render({
        ci: { image: '111111111111.dkr.ecr.us-iso-east-1.c2s.ic.gov/platform/ci:stable' },
      }),
    ).toThrow(/cannot use private ECR ci\.image.*before the OIDC authentication step/);
  });

  test.each([
    ['dual-stack', '111111111111.dkr-ecr.us-west-2.on.aws/platform/ci:stable'],
    ['FIPS', '111111111111.dkr.ecr-fips.us-west-2.amazonaws.com/platform/ci:stable'],
    ['mixed-case host', '111111111111.DKR.ECR.us-west-2.amazonaws.com/platform/ci:stable'],
    ['spoofed suffix', '111111111111.dkr.ecr.us-west-2.amazonaws.com.attacker.example/platform/ci:stable'],
  ])('rejects a %s private ECR Build-Synth endpoint instead of treating it as public', (_case, image) => {
    expect(() => render({ ci: { image } })).toThrow(
      /cannot use private ECR ci\.image.*before the OIDC authentication step/,
    );
  });

  test('rejects inline registry userinfo without echoing the credential', () => {
    const password = 'do-not-log-this-password';
    let failure: unknown;
    try {
      render({ ci: { image: `user:${password}@registry.example.com/private/ci-image:stable` } });
    } catch (error) {
      failure = error;
    }
    expect(String(failure)).toMatch(/must not embed registry credentials/);
    expect(String(failure)).not.toContain(password);
  });

  test('acknowledged approval stages continue to use their generated GitHub Environments', () => {
    const { engine } = render();
    const yaml = engine.pipeline.workflowFile.toYaml();
    expect(yaml).toContain('environment: dev');
    expect(yaml).toContain('environment: prod');
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

  test('a codeArtifact config logs in after OIDC auth and grants the role the required read permissions', () => {
    const { stack, engine } = render({
      codeArtifact: { domain: 'd', repository: 'r', npmScope: 'cdklabs' },
    });
    const yaml = engine.pipeline.workflowFile.toYaml();
    const loginIdx = yaml.indexOf('aws codeartifact login');
    const credsIdx = yaml.indexOf('Authenticate Via OIDC Role');
    expect(loginIdx).toBeGreaterThan(-1);
    expect(credsIdx).toBeGreaterThan(-1);
    expect(credsIdx).toBeLessThan(loginIdx);
    expect(yaml).toContain('--namespace cdklabs');
    const policies = JSON.stringify(Template.fromStack(stack).findResources('AWS::IAM::Policy'));
    expect(policies).toContain('codeartifact:GetAuthorizationToken');
    expect(policies).toContain('codeartifact:GetRepositoryEndpoint');
    expect(policies).toContain('codeartifact:ReadFromRepository');
    expect(policies).toContain('sts:GetServiceBearerToken');
  });

  test('a proxy config loads and masks its secret after OIDC auth, then persists the proxy environment', () => {
    const proxySecretArn = 'arn:aws:secretsmanager:us-west-2:111111111111:secret:proxy-abc123';
    const { stack, engine } = render({
      proxy: { proxySecretArn },
    });
    const workflow = parse(engine.pipeline.workflowFile.toYaml()) as {
      jobs: Record<string, { steps: Array<{ name?: string; run?: string }> }>;
    };
    const steps = workflow.jobs['Build-Synth'].steps;
    const credentialsIndex = steps.findIndex((step) => step.name === 'Authenticate Via OIDC Role');
    const loginIndex = steps.findIndex((step) => step.name === 'Login');
    const buildIndex = steps.findIndex((step) => step.name === 'Build');
    const login = steps[loginIndex].run ?? '';

    expect(credentialsIndex).toBeGreaterThanOrEqual(0);
    expect(loginIndex).toBeGreaterThan(credentialsIndex);
    expect(buildIndex).toBeGreaterThan(loginIndex);
    expect(login).toContain(`--secret-id '${proxySecretArn}' --region 'us-west-2'`);
    expect(login).toContain("jq -er '.username'");
    expect(login).toContain('::add-mask::$PROXY_PASSWORD');
    expect(login).toContain('echo "HTTP_PROXY=$HTTP_PROXY" >> "$GITHUB_ENV"');
    expect(login).toContain('export NO_PROXY=');
    expect(login).toContain('curl -Is --connect-timeout 5 https://aws.amazon.com');
    const policies = JSON.stringify(Template.fromStack(stack).findResources('AWS::IAM::Policy'));
    expect(policies).toContain('secretsmanager:GetSecretValue');
    expect(policies).toContain(proxySecretArn);
  });

  test('a generic npm registry fetches and masks its token after OIDC auth, then grants exact secret read', () => {
    const secretArn = 'arn:aws:secretsmanager:eu-west-1:111111111111:secret:npm-token-abc123';
    const proxySecretArn = 'arn:aws:secretsmanager:us-west-2:111111111111:secret:proxy-abc123';
    const { stack, engine } = render({
      proxy: { proxySecretArn },
      npmRegistry: {
        url: 'https://npm.example.com/',
        scope: 'cdklabs',
        basicAuthSecretArn: secretArn,
      },
      codeArtifact: { domain: 'domain', repository: 'repository', npmScope: 'internal' },
    });
    const workflow = parse(engine.pipeline.workflowFile.toYaml()) as {
      jobs: Record<string, { steps: Array<{ name?: string; run?: string; if?: string }> }>;
    };
    const steps = workflow.jobs['Build-Synth'].steps;
    const credentialsIndex = steps.findIndex((step) => step.name === 'Authenticate Via OIDC Role');
    const loginIndex = steps.findIndex((step) => step.name === 'Login');
    const buildIndex = steps.findIndex((step) => step.name === 'Build');
    const login = steps[loginIndex].run ?? '';
    const proxyFetchIndex = login.indexOf(`--secret-id '${proxySecretArn}'`);
    const proxyIndex = login.indexOf('export HTTP_PROXY=');
    const fetchIndex = login.indexOf(`--secret-id '${secretArn}'`);
    const maskIndex = login.indexOf('::add-mask::$NPM_AUTH_TOKEN');
    const npmrcIndex = login.indexOf('@cdklabs:registry=https://npm.example.com/');
    const codeArtifactIndex = login.indexOf('aws codeartifact login');

    expect(credentialsIndex).toBeGreaterThanOrEqual(0);
    expect(loginIndex).toBeGreaterThan(credentialsIndex);
    expect(buildIndex).toBeGreaterThan(loginIndex);
    expect(proxyFetchIndex).toBeGreaterThanOrEqual(0);
    expect(proxyIndex).toBeGreaterThan(proxyFetchIndex);
    expect(fetchIndex).toBeGreaterThan(proxyIndex);
    expect(maskIndex).toBeGreaterThan(fetchIndex);
    expect(npmrcIndex).toBeGreaterThan(maskIndex);
    expect(codeArtifactIndex).toBeGreaterThan(npmrcIndex);
    expect(login).toContain(`--secret-id '${secretArn}' --region 'eu-west-1'`);
    expect(login).toContain('//npm.example.com/:_authToken=$NPM_AUTH_TOKEN');
    expect(login).toContain('export NPM_CONFIG_USERCONFIG="$RUNNER_TEMP/cdk-cicd-npmrc"');
    expect(login).toContain('echo "NPM_CONFIG_USERCONFIG=$NPM_CONFIG_USERCONFIG" >> "$GITHUB_ENV"');
    expect(login).toContain('> "$NPM_CONFIG_USERCONFIG"');
    expect(login).not.toContain('./.npmrc');
    const cleanup = steps.find((step) => step.name === 'Clean up npm credentials');
    expect(cleanup).toEqual(
      expect.objectContaining({
        if: 'always()',
        run: 'if [ -n "${NPM_CONFIG_USERCONFIG:-}" ]; then rm -f "$NPM_CONFIG_USERCONFIG"; fi',
      }),
    );

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

  test('rejects a deploy-role ExternalId because the installed GitHub engine cannot forward it', () => {
    const secretArn = 'arn:aws:secretsmanager:eu-west-1:111111111111:secret:deploy-external-id-abc123';
    expect(() =>
      render({
        deployRoleExternalId: `resolve:secretsmanager:${secretArn}`,
        stages: [{ name: 'prod', deployment: { deployRole: 'arn:aws:iam::222222222222:role/Deploy' } }],
      }),
    ).toThrow(/GITHUB_ACTIONS cannot honor deploy-role ExternalIds.*prod/);
  });

  test('trims and specializes configured deployment-role placeholders before granting AssumeRole', () => {
    const deployRole =
      '  arn:${AWS::Partition}:iam::${AWS::AccountId}:role/Custom-${Qualifier}-${AWS::AccountId}-${AWS::Region}  ';
    const { stack } = render({
      qualifier: 'customq',
      stages: [
        {
          name: 'prod',
          env: { account: '222222222222', regions: ['eu-west-1', 'us-east-1'] },
          deployment: { deployRole },
        },
      ],
    });
    const policies = JSON.stringify(Template.fromStack(stack).findResources('AWS::IAM::Policy'));
    expect(policies).toContain('sts:AssumeRole');
    expect(policies).toContain('arn:aws:iam::222222222222:role/Custom-customq-222222222222-eu-west-1');
    expect(policies).toContain('arn:aws:iam::222222222222:role/Custom-customq-222222222222-us-east-1');
    expect(policies).not.toContain('${Qualifier}');
    expect(policies).not.toContain('${AWS::AccountId}');
    expect(policies).not.toContain('${AWS::Region}');
  });

  test('uses the CDK bootstrap qualifier context when no config qualifier is resolved', () => {
    const { stack } = render(
      {
        application: undefined,
        stages: [
          {
            name: 'prod',
            env: { account: '222222222222', region: 'eu-west-1' },
            deployment: {
              deployRole: 'arn:${AWS::Partition}:iam::${AWS::AccountId}:role/Custom-${Qualifier}-${AWS::Region}',
            },
          },
        ],
      },
      { [BOOTSTRAP_QUALIFIER_CONTEXT]: 'ctxqual' },
    );

    const policies = JSON.stringify(Template.fromStack(stack).findResources('AWS::IAM::Policy'));
    expect(policies).toContain('arn:aws:iam::222222222222:role/Custom-ctxqual-eu-west-1');
    expect(policies).not.toContain('Custom-hnb659fds-eu-west-1');
  });

  test('rejects a custom deployment-role name containing cfn-exec because the dependency rewrites it', () => {
    expect(() =>
      render({
        stages: [
          {
            name: 'prod',
            env: { account: '222222222222', region: 'eu-west-1' },
            deployment: { deployRole: 'arn:aws:iam::222222222222:role/Custom-cfn-exec-Role' },
          },
        ],
      }),
    ).toThrow(/GITHUB_ACTIONS deployRole.*prod.*cannot contain literal `cfn-exec`.*rewrites.*`deploy`/);
  });

  test('rejects cfn-exec introduced by role placeholder specialization', () => {
    expect(() =>
      render({
        qualifier: 'cfn-exec',
        stages: [
          {
            name: 'prod',
            env: { account: '222222222222', region: 'eu-west-1' },
            deployment: {
              deployRole: 'arn:${AWS::Partition}:iam::${AWS::AccountId}:role/Custom-${Qualifier}-Role',
            },
          },
        ],
      }),
    ).toThrow(/GITHUB_ACTIONS deployRole.*prod.*cannot contain literal `cfn-exec`.*rewrites.*`deploy`/);
  });

  test('rejects cfn-exec in the effective qualifier when using the default deploy role', () => {
    expect(() =>
      render({
        qualifier: 'cfn-exec',
        stages: [{ name: 'prod', env: { account: '222222222222', region: 'eu-west-1' } }],
      }),
    ).toThrow(/GITHUB_ACTIONS deployRole.*prod.*cannot contain literal `cfn-exec`.*rewrites.*`deploy`/);
  });

  test('Build-Synth always authenticates even without AWS-backed install features', () => {
    const { engine } = render();
    const workflow = parse(engine.pipeline.workflowFile.toYaml()) as {
      jobs: Record<string, { steps: Array<{ name?: string; with?: Record<string, string> }> }>;
    };
    const credentialSteps = workflow.jobs['Build-Synth'].steps.filter(
      (step) => step.name === 'Authenticate Via OIDC Role',
    );
    expect(credentialSteps).toHaveLength(1);
    expect(credentialSteps[0].with).toEqual(
      expect.objectContaining({
        'aws-region': 'us-west-2',
        'role-to-assume': 'arn:aws:iam::111111111111:role/shop-github-role',
      }),
    );
  });

  test('registry secrets grant the OIDC role kms:Decrypt only on configured customer-managed keys', () => {
    const proxyKeyArn = 'arn:aws:kms:us-west-2:111111111111:key/proxy-key';
    const npmKeyArn = 'arn:aws:kms:eu-west-1:111111111111:key/npm-key';
    const { stack } = render({
      proxy: {
        proxySecretArn: 'arn:aws:secretsmanager:us-west-2:111111111111:secret:proxy',
        encryptionKeyArn: proxyKeyArn,
      },
      npmRegistry: {
        url: 'https://npm.example.com/',
        basicAuthSecretArn: 'arn:aws:secretsmanager:eu-west-1:111111111111:secret:npm',
        encryptionKeyArn: npmKeyArn,
      },
    });

    const policies = JSON.stringify(Template.fromStack(stack).findResources('AWS::IAM::Policy'));
    expect(policies).toContain('kms:Decrypt');
    expect(policies).toContain(proxyKeyArn);
    expect(policies).toContain(npmKeyArn);
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

  test('grants the OIDC role target bootstrap lookup AssumeRole and version-parameter access', () => {
    const { stack } = render({
      qualifier: 'customq',
      stages: [
        {
          name: 'prod',
          env: { account: '222222222222', regions: ['eu-west-1', 'us-east-1'] },
        },
      ],
    });
    const policies = JSON.stringify(Template.fromStack(stack).findResources('AWS::IAM::Policy'));
    expect(policies).toContain('sts:AssumeRole');
    expect(policies).toContain('cdk-customq-lookup-role-222222222222-eu-west-1');
    expect(policies).toContain('cdk-customq-lookup-role-222222222222-us-east-1');
    expect(policies).toContain('ssm:GetParameter');
    expect(policies).toContain('parameter/cdk-bootstrap/customq/version');
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
