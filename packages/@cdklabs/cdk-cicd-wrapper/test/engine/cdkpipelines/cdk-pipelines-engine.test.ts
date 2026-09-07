// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The Blueprint-compatible CDK Pipelines engine: reproduces the Blueprint pipeline shape (Source -> Build/Synth ->
// UpdatePipeline self-mutation -> Assets -> one wave per stage, with a manual-approval gate on gated stages).

import * as path from 'path';
import { App, Aspects, Stack, Stage } from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { AwsSolutionsChecks } from 'cdk-nag';
import { defineCICD } from '../../../src/config/define';
import { Repository } from '../../../src/config/repository';
import { RegionOrder } from '../../../src/config/types';
import {
  CdkPipelinesEngine,
  CdkPipelinesStageContext,
  IStageProvider,
} from '../../../src/engine/cdkpipelines/CdkPipelinesEngine';

// A stand-in app-stack provider: puts one trivial stack (a bucket) into each stage so CDK Pipelines has
// something to deploy -- the Blueprint IStackProvider role.
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

describe('Blueprint-compat: CdkPipelinesEngine (aws-cdk-lib/pipelines)', () => {
  test('builds a self-mutating CDK Pipelines pipeline with a Source, Synth, and one wave per stage', () => {
    const t = render();
    // Exactly one CDK Pipelines pipeline.
    t.resourceCountIs('AWS::CodePipeline::Pipeline', 1);
    const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    const stageNames = (pipeline.Properties.Stages as any[]).map((s) => s.Name);
    // Blueprint shape: Source, Build (Synth), UpdatePipeline (self-mutate), then a wave per deployment stage.
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

  test('RegionOrder.PARALLEL puts every regional deployment in one wave', () => {
    const stack = new Stack(new App(), 'PipelineStack', {
      env: { account: '111111111111', region: 'us-west-2' },
    });
    new CdkPipelinesEngine(stack, 'Cd', {
      config: defineCICD({
        application: 'shop',
        repository: Repository.codecommit('shop'),
        stages: [
          {
            name: 'prod',
            env: {
              account: '222222222222',
              regions: ['eu-west-1', 'us-east-1'],
              regionOrder: RegionOrder.PARALLEL,
            },
            manualApproval: true,
          },
        ],
      }),
      stages: new StubStages(),
    });

    const pipeline = Object.values(Template.fromStack(stack).findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    const deploymentStages = (pipeline.Properties.Stages as any[]).filter((stage) =>
      ['prod', 'prod-eu-west-1', 'prod-us-east-1'].includes(stage.Name),
    );

    expect(deploymentStages).toHaveLength(1);
    expect(deploymentStages[0].Name).toBe('prod');
    const deployActions = deploymentStages[0].Actions.filter(
      (action: any) => action.ActionTypeId.Category === 'Deploy',
    );
    expect(deployActions).toHaveLength(4);
    expect(
      deployActions.reduce((counts: Record<number, number>, action: any) => {
        counts[action.RunOrder] = (counts[action.RunOrder] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({ 2: 2, 3: 2 });
    expect(deploymentStages[0].Actions.some((action: any) => action.ActionTypeId.Category === 'Approval')).toBe(true);
  });

  test('the synth step runs npm ci + the default scripts + npm run cdk synth with CDK_CICD_MODE=pipeline', () => {
    const t = render();
    // The Synth CodeBuild project's buildspec carries the commands. It runs `npm run cdk synth` (never
    // npx) through cdk.json's single `cdk-cicd exec` entry; CDK_CICD_MODE=pipeline in the step env makes
    // that entry render THIS pipeline, so CDK Pipelines self-mutation re-renders itself.
    const projects = t.findResources('AWS::CodeBuild::Project');
    const specs = Object.values(projects).map((p: any) => JSON.stringify(p.Properties.Source.BuildSpec));
    expect(
      specs.some((s) => s.includes('npm ci') && s.includes('npm run audit') && s.includes('npm run cdk synth')),
    ).toBe(true);
    // The mode signal is set on the synth step environment. CDK Pipelines renders a CodeBuildStep's
    // `env` into the CodeBuild project's Environment.EnvironmentVariables (not the buildspec string).
    const envVars = Object.values(projects).flatMap(
      (p: any) => (p.Properties?.Environment?.EnvironmentVariables ?? []) as Array<{ Name?: string; Value?: string }>,
    );
    expect(envVars.some((v) => v.Name === 'CDK_CICD_MODE' && v.Value === 'pipeline')).toBe(true);
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

  test('a proxy config exports HTTP(S)_PROXY ahead of the synth build and grants secret read', () => {
    const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
    const engine = new CdkPipelinesEngine(stack, 'Cd', {
      config: defineCICD({
        application: 'shop',
        repository: Repository.codecommit('shop'),
        stages: ['dev'],
        proxy: { proxySecretArn: 'arn:aws:secretsmanager:us-west-2:111111111111:secret:proxy-abc123' },
      }),
      stages: new StubStages(),
    });
    void engine;
    const t = Template.fromStack(stack);
    const projects = t.findResources('AWS::CodeBuild::Project');
    const spec = JSON.parse(Object.values(projects)[0].Properties.Source.BuildSpec);
    expect(spec.phases.install.commands).toEqual(
      expect.arrayContaining([
        'export HTTP_PROXY="http://$PROXY_USERNAME:$PROXY_PASSWORD@$PROXY_DOMAIN:$HTTP_PROXY_PORT"',
        'curl -Is --connect-timeout 5 https://aws.amazon.com | grep "HTTP/"',
      ]),
    );
    expect(spec.env['secrets-manager']).toEqual(
      expect.objectContaining({
        PROXY_USERNAME: 'arn:aws:secretsmanager:us-west-2:111111111111:secret:proxy-abc123:username',
      }),
    );
    const policies = JSON.stringify(t.findResources('AWS::IAM::Policy'));
    expect(policies).toContain('secretsmanager:GetSecretValue');
  });

  test('a generic npm registry authenticates Synth before npm ci and merges secret buildspec bindings', () => {
    const npmSecretArn = 'arn:aws:secretsmanager:eu-west-1:111111111111:secret:npm-token-abc123';
    const proxySecretArn = 'arn:aws:secretsmanager:us-west-2:111111111111:secret:proxy-abc123';
    const stack = new Stack(new App(), 'PipelineStack', {
      env: { account: '111111111111', region: 'us-west-2' },
    });
    new CdkPipelinesEngine(stack, 'Cd', {
      config: defineCICD({
        application: 'shop',
        repository: Repository.codecommit('shop'),
        stages: ['dev'],
        proxy: { proxySecretArn },
        npmRegistry: {
          url: 'https://npm.example.com/',
          scope: 'cdklabs',
          basicAuthSecretArn: npmSecretArn,
        },
        codeArtifact: { domain: 'domain', repository: 'repository', npmScope: 'internal' },
        ci: {
          partialBuildSpec: codebuild.BuildSpec.fromObject({
            env: { variables: { CALLER_BUILD_SPEC: 'preserved' } },
          }),
        },
      }),
      stages: new StubStages(),
    });

    const t = Template.fromStack(stack);
    const projects = Object.values(t.findResources('AWS::CodeBuild::Project')) as any[];
    const synthProject = projects.find((project) =>
      (project.Properties.Environment.EnvironmentVariables ?? []).some(
        (variable: { Name?: string }) => variable.Name === 'CDK_CICD_MODE',
      ),
    );
    expect(synthProject).toBeDefined();
    const spec = JSON.parse(synthProject.Properties.Source.BuildSpec);
    const installCommands = spec.phases.install.commands as string[];
    const proxyIndex = installCommands.findIndex((command) => command.includes('export HTTP_PROXY='));
    const npmRegistryIndex = installCommands.findIndex((command) =>
      command.includes('@cdklabs:registry=https://npm.example.com/'),
    );
    const codeArtifactIndex = installCommands.findIndex((command) => command.includes('aws codeartifact login'));

    expect(proxyIndex).toBeGreaterThanOrEqual(0);
    expect(npmRegistryIndex).toBeGreaterThan(proxyIndex);
    expect(codeArtifactIndex).toBeGreaterThan(npmRegistryIndex);
    expect(spec.phases.build.commands).toContain('npm ci');
    expect(spec.env.variables).toEqual(expect.objectContaining({ CALLER_BUILD_SPEC: 'preserved' }));
    expect(spec.env['secrets-manager']).toEqual(
      expect.objectContaining({
        PROXY_USERNAME: `${proxySecretArn}:username`,
        NPM_AUTH_TOKEN: npmSecretArn,
      }),
    );
    t.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'secretsmanager:GetSecretValue',
            Resource: npmSecretArn,
          }),
        ]),
      }),
    });
  });

  test('a secret-backed deploy-role ExternalId grants the synth project access to that secret', () => {
    const secretArn = 'arn:aws:secretsmanager:eu-west-1:111111111111:secret:deploy-external-id-abc123';
    const stack = new Stack(new App(), 'PipelineStack', {
      env: { account: '111111111111', region: 'us-west-2' },
    });
    new CdkPipelinesEngine(stack, 'Cd', {
      config: defineCICD({
        application: 'shop',
        repository: Repository.codecommit('shop'),
        deployRoleExternalId: `resolve:secretsmanager:${secretArn}`,
        stages: [{ name: 'prod', deployment: { deployRole: 'arn:aws:iam::222222222222:role/Deploy' } }],
      }),
      stages: new StubStages(),
    });

    const policies = JSON.stringify(Template.fromStack(stack).findResources('AWS::IAM::Policy'));
    expect(policies).toContain('secretsmanager:GetSecretValue');
    expect(policies).toContain(secretArn);
  });

  test('warmAccountsFromSsm scans SSM and exports ACCOUNT_<STAGE> ahead of the synth build', () => {
    const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
    const engine = new CdkPipelinesEngine(stack, 'Cd', {
      config: defineCICD({
        application: 'shop',
        repository: Repository.codecommit('shop'),
        stages: ['dev'],
        warmAccountsFromSsm: true,
      }),
      stages: new StubStages(),
    });
    void engine;
    const t = Template.fromStack(stack);
    const projects = t.findResources('AWS::CodeBuild::Project');
    // The synth build's install phase carries the dynamic SSM scan + the ACCOUNT_ export loop. The
    // qualifier is the config's derived qualifier ('shop'), scanned under /shop/.
    const specs = Object.values(projects).map((p: any) => JSON.stringify(p.Properties.Source.BuildSpec));
    const synthSpec = specs.find((s) => s.includes('get-parameters-by-path'));
    expect(synthSpec).toBeDefined();
    expect(synthSpec).toContain('/shop/');
    expect(synthSpec).toContain('ACCOUNT_${_warm_stage}');
    expect(synthSpec).toContain('*Account*');
    // Fails loud when the scan finds nothing.
    expect(synthSpec).toContain('exit 1');
  });

  test('warmAccountsFromSsm grants the synth build ssm:GetParametersByPath scoped to the qualifier path', () => {
    const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
    const engine = new CdkPipelinesEngine(stack, 'Cd', {
      config: defineCICD({
        application: 'shop',
        repository: Repository.codecommit('shop'),
        stages: ['dev'],
        warmAccountsFromSsm: true,
      }),
      stages: new StubStages(),
    });
    void engine;
    const t = Template.fromStack(stack);
    t.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'ssm:GetParametersByPath',
            Resource: {
              'Fn::Join': Match.arrayWith([Match.arrayWith([Match.stringLikeRegexp(':parameter/shop/\\*$')])]),
            },
          }),
        ]),
      }),
    });
  });

  test('without warmAccountsFromSsm neither the SSM scan nor the GetParametersByPath grant is present', () => {
    const t = render();
    const projects = t.findResources('AWS::CodeBuild::Project');
    const specs = Object.values(projects).map((p: any) => JSON.stringify(p.Properties.Source.BuildSpec));
    expect(specs.some((s) => s.includes('get-parameters-by-path'))).toBe(false);
    const policies = JSON.stringify(t.findResources('AWS::IAM::Policy'));
    expect(policies).not.toContain('ssm:GetParametersByPath');
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
    // Synth + self-mutation: Blueprint's uniform-application semantics, achieved here via CDK Pipelines' own
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

  test('ci.image overrides only the Synth CodeBuild project, not self-mutation or asset publishing', () => {
    class DockerAssetStages implements IStageProvider {
      public stacks(stage: Stage, context: CdkPipelinesStageContext): void {
        const stack = new Stack(stage, 'App');
        new ecr_assets.DockerImageAsset(stack, `Img-${context.stageName}`, {
          directory: path.join(__dirname, 'fixtures', 'docker'),
        });
      }
    }

    const customImage = 'public.ecr.aws/example/ci-image:2026-09';
    const stack = new Stack(new App(), 'PipelineStack', {
      env: { account: '111111111111', region: 'us-west-2' },
    });
    new CdkPipelinesEngine(stack, 'Cd', {
      config: defineCICD({
        application: 'shop',
        repository: Repository.codecommit('shop'),
        stages: ['dev'],
        ci: { image: customImage },
      }),
      stages: new DockerAssetStages(),
    });

    const projects = Object.values(Template.fromStack(stack).findResources('AWS::CodeBuild::Project')) as any[];
    expect(projects.length).toBeGreaterThanOrEqual(3);
    const synthProject = projects.find((project) =>
      (project.Properties.Environment.EnvironmentVariables ?? []).some(
        (variable: { Name?: string }) => variable.Name === 'CDK_CICD_MODE',
      ),
    );
    expect(synthProject.Properties.Environment.Image).toBe(customImage);
    for (const project of projects.filter((candidate) => candidate !== synthProject)) {
      expect(project.Properties.Environment.Image).not.toBe(customImage);
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

  test('a managed vpc config attaches the synth + self-mutation projects to it', () => {
    const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
    const engine = new CdkPipelinesEngine(stack, 'Cd', {
      config: defineCICD({
        application: 'shop',
        repository: Repository.codecommit('shop'),
        stages: ['dev'],
        vpc: { managedVpc: { cidrBlock: '10.0.0.0/16' } },
      }),
      stages: new StubStages(),
    });
    void engine;

    const t = Template.fromStack(stack);
    t.resourceCountIs('AWS::EC2::VPC', 1);
    // Synth + self-mutation: CDK Pipelines' own `codeBuildDefaults`, same uniform application as
    // codeBuildEnvSettings above.
    const projects = Object.values(t.findResources('AWS::CodeBuild::Project'));
    expect(projects).toHaveLength(2);
    for (const p of projects as any[]) {
      expect(p.Properties.VpcConfig).toBeDefined();
      expect(p.Properties.VpcConfig.VpcId).toBeDefined();
    }
  });

  test('without a vpc config no CodeBuild project gets a VpcConfig', () => {
    const t = render();
    t.resourceCountIs('AWS::EC2::VPC', 0);
    for (const p of Object.values(t.findResources('AWS::CodeBuild::Project')) as any[]) {
      expect(p.Properties.VpcConfig).toBeUndefined();
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
    // AwsSolutionsChecks (as Blueprint ran it) flags CDK Pipelines' generated roles/buckets. The engine
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

  describe('pipelineRoleNames (Blueprint PipelineRoleNameEnforcementPlugin parity)', () => {
    // The asset-publishing roles (FileRole/DockerRole) only exist when the pipeline actually publishes
    // file AND docker assets, so this stub emits both -- a Lambda (file asset) and a Docker image asset.
    class AssetStages implements IStageProvider {
      public stacks(stage: Stage, context: CdkPipelinesStageContext): void {
        const stack = new Stack(stage, 'App');
        new lambda.Function(stack, `Fn-${context.stageName}`, {
          runtime: lambda.Runtime.NODEJS_20_X,
          handler: 'index.handler',
          code: lambda.Code.fromAsset(path.join(__dirname, 'fixtures', 'asset')),
        });
        new ecr_assets.DockerImageAsset(stack, `Img-${context.stageName}`, {
          directory: path.join(__dirname, 'fixtures', 'docker'),
        });
      }
    }

    function renderWithRoleNames(names: { pipeline?: string; assetsFile?: string; assetsDocker?: string }): Template {
      const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
      const engine = new CdkPipelinesEngine(stack, 'Cd', {
        config: defineCICD({
          application: 'shop',
          repository: Repository.codecommit('shop'),
          stages: ['dev'],
          pipelineRoleNames: names,
        }),
        stages: new AssetStages(),
      });
      void engine;
      return Template.fromStack(stack);
    }

    test('forces RoleName on the pipeline role and the file/docker asset roles', () => {
      const t = renderWithRoleNames({
        pipeline: 'shop-codepipeline-role',
        assetsFile: 'shop-codepipeline-assets-file-role',
        assetsDocker: 'shop-codepipeline-assets-docker-role',
      });
      const roleNames = Object.values(t.findResources('AWS::IAM::Role'))
        .map((r: any) => r.Properties.RoleName)
        .filter((n): n is string => typeof n === 'string');
      expect(roleNames).toEqual(
        expect.arrayContaining([
          'shop-codepipeline-role',
          'shop-codepipeline-assets-file-role',
          'shop-codepipeline-assets-docker-role',
        ]),
      );
    });

    test('omitting a field keeps the CDK-generated name (no RoleName override)', () => {
      // Only the pipeline name is set; the asset roles must NOT carry an explicit RoleName.
      const t = renderWithRoleNames({ pipeline: 'shop-codepipeline-role' });
      const roles = Object.values(t.findResources('AWS::IAM::Role')) as any[];
      const named = roles.map((r) => r.Properties.RoleName).filter((n) => typeof n === 'string');
      expect(named).toContain('shop-codepipeline-role');
      expect(named).not.toContain('shop-codepipeline-assets-file-role');
      expect(named).not.toContain('shop-codepipeline-assets-docker-role');
    });

    test('no pipelineRoleNames at all leaves every role CDK-named', () => {
      const t = render();
      for (const r of Object.values(t.findResources('AWS::IAM::Role')) as any[]) {
        // CDK-generated pipeline roles do not set an explicit RoleName.
        expect(r.Properties.RoleName).toBeUndefined();
      }
    });
  });

  describe('complianceLogBucketName under CDK_PIPELINES', () => {
    function renderWithCompliance(regionOfStage: string): Template {
      // Pipeline in us-west-2; a stage in a different region exercises the per-region name substitution.
      const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
      const engine = new CdkPipelinesEngine(stack, 'Cd', {
        config: defineCICD({
          application: 'shop',
          repository: Repository.codecommit('shop'),
          stages: [{ name: 'prod', env: { account: '111111111111', region: regionOfStage } }],
          complianceLogBucketName: 'compliance-log-111111111111-us-west-2',
        }),
        stages: new StubStages(),
      });
      void engine;
      return Template.fromStack(stack);
    }

    test('provisions the compliance-log bucket in the pipeline stack when the name is set', () => {
      const t = renderWithCompliance('us-west-2');
      const buckets = Object.values(t.findResources('AWS::S3::Bucket')) as any[];
      const names = buckets.map((b) => b.Properties.BucketName).filter((n) => typeof n === 'string');
      expect(names).toContain('compliance-log-111111111111-us-west-2');
    });

    test('is absent when no complianceLogBucketName is configured', () => {
      const t = render();
      const buckets = Object.values(t.findResources('AWS::S3::Bucket')) as any[];
      const names = buckets.map((b) => b.Properties.BucketName).filter((n) => typeof n === 'string');
      expect(names.some((n) => n.startsWith('compliance-log-'))).toBe(false);
    });

    test('passes AwsSolutions-S1 with no suppression (MUTATING aspect ordering)', () => {
      const app = new App();
      const stack = new Stack(app, 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
      const engine = new CdkPipelinesEngine(stack, 'Cd', {
        config: defineCICD({
          application: 'shop',
          repository: Repository.codecommit('shop'),
          stages: ['dev'],
          complianceLogBucketName: 'compliance-log-111111111111-us-west-2',
        }),
        stages: new StubStages(),
      });
      void engine;
      Aspects.of(app).add(new AwsSolutionsChecks({ verbose: false }));
      expect(Annotations.fromStack(stack).findError('*', Match.stringLikeRegexp('AwsSolutions-S1'))).toHaveLength(0);
    });
  });

  describe('CodeCommit source repository', () => {
    function renderWithRepo(repo: Repository): Template {
      const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
      const engine = new CdkPipelinesEngine(stack, 'Cd', {
        config: defineCICD({ application: 'shop', repository: repo, stages: ['dev'] }),
        stages: new StubStages(),
      });
      void engine;
      return Template.fromStack(stack);
    }

    test('is created by default (Blueprint parity)', () => {
      const t = renderWithRepo(Repository.codecommit('shop'));
      t.hasResourceProperties('AWS::CodeCommit::Repository', { RepositoryName: 'shop' });
    });

    test('is imported, not created, when existing is true', () => {
      const t = renderWithRepo(Repository.codecommit('shop', undefined, { existing: true }));
      t.resourceCountIs('AWS::CodeCommit::Repository', 0);
    });
  });
});
