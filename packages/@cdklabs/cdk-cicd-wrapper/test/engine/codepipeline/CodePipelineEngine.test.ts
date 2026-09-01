// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { App, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { Runtime, RuntimeFamily } from 'aws-cdk-lib/aws-lambda';
import { defineCICD } from '../../../src/config/define';
import { Repository } from '../../../src/config/repository';
import { DeployModel } from '../../../src/config/types';
import { CodePipelineEngine } from '../../../src/engine/codepipeline/CodePipelineEngine';

function render(config: ReturnType<typeof defineCICD>): Template {
  const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
  new CodePipelineEngine().render(stack, { config, pipelineName: 'shop-pipeline' });
  return Template.fromStack(stack);
}

/**
 * Matches an ARN built on the stack's partition token, which renders as
 * `{ 'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, '<suffix>']] }` rather than a plain string.
 */
function arnEndingIn(suffix: string) {
  return Match.objectLike({ 'Fn::Join': Match.arrayWith([Match.arrayWith([suffix])]) });
}

/** The parsed buildspec of the one CodeBuild project whose build commands contain `marker`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function specContaining(t: Template, marker: string): any {
  return Object.values(t.findResources('AWS::CodeBuild::Project'))
    .map((p) => JSON.parse(p.Properties.Source.BuildSpec))
    .find((s) => JSON.stringify(s.phases.build.commands).includes(marker));
}

describe('m4-codepipeline: CodePipelineEngine', () => {
  test('builds ONE pipeline with a flat footprint: 1 build project + 1 project per stage', () => {
    const config = defineCICD({
      application: 'shop',
      repository: Repository.s3('shop-src/app.zip'),
      stages: [{ name: 'dev', env: { account: '111111111111', regions: ['us-west-2', 'us-west-1'] } }, 'prod'],
    });
    const t = render(config);

    t.resourceCountIs('AWS::CodePipeline::Pipeline', 1);
    // 1 CI build + 1 self-update + 1 per stage (dev, prod) = 4 -- and NOT one-per-region (dev has 2).
    t.resourceCountIs('AWS::CodeBuild::Project', 4);
  });

  test('a self-update stage re-deploys the pipeline from config, before any application deploy', () => {
    const config = defineCICD({ application: 'shop', repository: Repository.s3('shop-src/app.zip'), stages: ['dev'] });
    const t = render(config);
    const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const names = (pipeline.Properties.Stages as any[]).map((s) => s.Name);

    // Ordered after the CI build and AHEAD of the first deploy: a config change (new stage, changed
    // gate) is applied to the pipeline before the run reaches the stages it affects.
    expect(names).toEqual(['Source', 'Build', 'UpdatePipeline', 'dev']);
    // The action runs `deploy-ci`, which re-synths the pipeline from cicd.config.ts and redeploys it.
    t.hasResourceProperties('AWS::CodeBuild::Project', {
      Source: { BuildSpec: Match.stringLikeRegexp('cdk-cicd deploy-ci') },
    });
  });

  test('the self-update project may assume the bootstrap roles in the pipeline own account/region', () => {
    const config = defineCICD({ application: 'shop', repository: Repository.s3('shop-src/app.zip'), stages: ['dev'] });

    // deploy-ci deploys the pipeline stack into the pipeline's own env (111111111111/us-west-2 here),
    // so its project needs the bootstrap roles THERE -- not for any application stage's account.
    render(config).hasResourceProperties('AWS::IAM::Policy', {
      Roles: [{ Ref: Match.stringLikeRegexp('UpdatePipelineRole') }],
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sts:AssumeRole',
            Resource: Match.arrayWith([
              arnEndingIn(':iam::111111111111:role/cdk-hnb659fds-deploy-role-111111111111-us-west-2'),
            ]),
          }),
        ]),
      }),
    });
  });

  test('a multi-region stage is ONE deploy action (region fan-out is inside cdk-cicd deploy)', () => {
    const config = defineCICD({
      application: 'shop',
      repository: Repository.s3('shop-src/app.zip'),
      stages: [{ name: 'dev', env: { account: '111111111111', regions: ['us-west-2', 'us-west-1'] } }],
    });
    const t = render(config);
    // Source + Build + one dev stage = 3 pipeline stages.
    t.hasResourceProperties('AWS::CodePipeline::Pipeline', {
      Stages: Match.arrayWith([Match.objectLike({ Name: 'dev' })]),
    });
    // dev deploy project runs the M3 CLI for the whole stage, once.
    t.hasResourceProperties('AWS::CodeBuild::Project', {
      Source: { BuildSpec: Match.stringLikeRegexp('cdk-cicd deploy --stage dev --yes') },
    });
  });

  test('the S3 repository yields an S3 source action with the bucket and key split correctly', () => {
    const config = defineCICD({
      application: 'shop',
      repository: Repository.s3('shop-src/nested/app.zip'),
      stages: ['dev'],
    });
    render(config).hasResourceProperties('AWS::CodePipeline::Pipeline', {
      Stages: Match.arrayWith([
        Match.objectLike({
          Name: 'Source',
          Actions: Match.arrayWith([
            Match.objectLike({
              ActionTypeId: Match.objectLike({ Provider: 'S3' }),
              // bucket is the first path segment, key is the remainder -- pins the split so a
              // bucket/key regression can't pass silently.
              Configuration: Match.objectLike({ S3Bucket: 'shop-src', S3ObjectKey: 'nested/app.zip' }),
            }),
          ]),
        }),
      ]),
    });
  });

  test('a CodeCommit repository yields a CodeCommit source action for that repo', () => {
    const config = defineCICD({ application: 'shop', repository: Repository.codecommit('shop-repo'), stages: ['dev'] });
    render(config).hasResourceProperties('AWS::CodePipeline::Pipeline', {
      Stages: Match.arrayWith([
        Match.objectLike({
          Name: 'Source',
          Actions: Match.arrayWith([
            Match.objectLike({
              ActionTypeId: Match.objectLike({ Provider: 'CodeCommit' }),
              Configuration: Match.objectLike({ RepositoryName: 'shop-repo' }),
            }),
          ]),
        }),
      ]),
    });
  });

  test('a CodeStar/GitHub source without a connection ARN is a clear error', () => {
    const config = defineCICD({ application: 'shop', repository: Repository.github('org/shop'), stages: ['dev'] });
    expect(() => render(config)).toThrow(/CodeStar connection ARN is required/);
  });

  test('the CI build project runs the default synth --all when no ci.steps are configured', () => {
    const config = defineCICD({ application: 'shop', repository: Repository.s3('shop-src/app.zip'), stages: ['dev'] });
    render(config).hasResourceProperties('AWS::CodeBuild::Project', {
      Source: { BuildSpec: Match.stringLikeRegexp('cdk-cicd synth --all') },
    });
  });

  test('the default CI run invokes the project npm scripts (audit/build/test), not a bespoke CLI', () => {
    const config = defineCICD({ application: 'shop', repository: Repository.s3('shop-src/app.zip'), stages: ['dev'] });
    // The default build phase runs the project's own npm scripts, each run-only-if-present with a
    // warning otherwise -- so the checks are encouraged guidance, discoverable and local==CI.
    render(config).hasResourceProperties('AWS::CodeBuild::Project', {
      Source: { BuildSpec: Match.stringLikeRegexp('npm run audit') },
    });
  });

  test('custom ci.steps are the build phase verbatim -- the engine injects no npm ci of its own', () => {
    // A project that configures ci.steps owns its build phase, including whether/where `npm ci` runs.
    // The engine must not prepend one: the CI build commands are exactly the configured steps, in order.
    const config = defineCICD({
      application: 'shop',
      repository: Repository.s3('shop-src/app.zip'),
      stages: ['dev'],
      ci: { steps: { install: 'npm ci --ignore-scripts', build: 'npm run build' } },
    });
    const spec = specContaining(render(config), 'npm run build');
    // The build commands begin with the user's OWN first step, not an engine-injected `npm ci`, and
    // synth is still appended after.
    expect(spec.phases.build.commands[0]).toBe('npm ci --ignore-scripts');
    expect(spec.phases.build.commands).toContain('npm run build');
    // Exactly one `npm ci ...` -- the user's -- not a duplicate injected before it.
    const npmCiCount = spec.phases.build.commands.filter((c: string) => c.startsWith('npm ci')).length;
    expect(npmCiCount).toBe(1);
  });

  test('a codeArtifact config logs every build project into the private repo before npm ci', () => {
    const config = defineCICD({
      application: 'shop',
      repository: Repository.s3('shop-src/app.zip'),
      stages: ['dev', 'prod'],
      codeArtifact: { domain: 'shop-domain', repository: 'shop-repo', npmScope: 'cdklabs' },
    });
    const t = render(config);

    // Every project runs npm ci, so every project must log in first -- CI build, self-update and both
    // deploys. A login missing from any one of them fails that project's install on the private packages.
    const projects = Object.values(t.findResources('AWS::CodeBuild::Project'));
    expect(projects).toHaveLength(4);
    for (const p of projects) {
      const spec = JSON.stringify(p.Properties.Source.BuildSpec);
      expect(spec).toContain(
        'aws codeartifact login --tool npm --domain shop-domain --domain-owner 111111111111 ' +
          '--region us-west-2 --repository shop-repo --namespace cdklabs',
      );
    }
    // And the projects' roles can actually fetch the token + read the repo.
    t.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'codeartifact:GetAuthorizationToken',
            Resource: arnEndingIn(':codeartifact:us-west-2:111111111111:domain/shop-domain'),
          }),
          Match.objectLike({
            Action: Match.arrayWith(['codeartifact:ReadFromRepository']),
            Resource: arnEndingIn(':codeartifact:us-west-2:111111111111:repository/shop-domain/shop-repo'),
          }),
        ]),
      }),
    });
  });

  test('a codeArtifact config without npmScope logs in against the default scope (no --namespace)', () => {
    const config = defineCICD({
      application: 'shop',
      repository: Repository.s3('shop-src/app.zip'),
      stages: ['dev'],
      codeArtifact: { domain: 'shop-domain', repository: 'shop-repo' },
    });
    const build = Object.values(render(config).findResources('AWS::CodeBuild::Project'))[0];
    const spec = JSON.stringify(build.Properties.Source.BuildSpec);

    // The doc calls npmScope optional; when omitted the login must NOT carry a dangling `--namespace`,
    // which CodeArtifact would reject. Assert the login is present AND the flag is absent.
    expect(spec).toContain('aws codeartifact login --tool npm --domain shop-domain');
    expect(spec).not.toContain('--namespace');
  });

  test('without a codeArtifact config no project logs in and no codeartifact grant is made', () => {
    const config = defineCICD({ application: 'shop', repository: Repository.s3('shop-src/app.zip'), stages: ['dev'] });
    const t = render(config);

    // The private-registry login must be strictly opt-in: a default pipeline talks to public npm.
    const projects = Object.values(t.findResources('AWS::CodeBuild::Project'));
    for (const p of projects) {
      expect(JSON.stringify(p.Properties.Source.BuildSpec)).not.toContain('codeartifact login');
    }
    const policies = Object.values(t.findResources('AWS::IAM::Policy'));
    const grantsCodeArtifact = policies.some((p) =>
      JSON.stringify(p.Properties.PolicyDocument).includes('codeartifact:GetAuthorizationToken'),
    );
    expect(grantsCodeArtifact).toBe(false);
  });

  test('a proxy config exports HTTP(S)_PROXY and curls the test URL before every build runs', () => {
    const config = defineCICD({
      application: 'shop',
      repository: Repository.s3('shop-src/app.zip'),
      stages: ['dev'],
      proxy: { proxySecretArn: 'arn:aws:secretsmanager:us-west-2:111111111111:secret:proxy-abc123' },
    });
    const t = render(config);

    // Every project (build, self-update, deploy) must set up the tunnel before its own commands run.
    const projects = Object.values(t.findResources('AWS::CodeBuild::Project'));
    expect(projects).toHaveLength(3);
    for (const p of projects) {
      const spec = JSON.parse(p.Properties.Source.BuildSpec);
      expect(spec.phases.install.commands).toEqual([
        'export HTTP_PROXY="http://$PROXY_USERNAME:$PROXY_PASSWORD@$PROXY_DOMAIN:$HTTP_PROXY_PORT"',
        'export HTTPS_PROXY="https://$PROXY_USERNAME:$PROXY_PASSWORD@$PROXY_DOMAIN:$HTTPS_PROXY_PORT"',
        'echo "--- Proxy Test ---"',
        'curl -Is --connect-timeout 5 https://aws.amazon.com | grep "HTTP/"',
      ]);
      // The plain env vars and the Secrets Manager-backed ones both land on every project's buildspec.
      expect(spec.env.variables).toEqual(
        expect.objectContaining({
          NO_PROXY: 'us-west-2.amazonaws.com',
          PROXY_SECRET_ARN: expect.stringContaining('proxy-abc123'),
        }),
      );
      expect(spec.env['secrets-manager']).toEqual({
        PROXY_USERNAME: 'arn:aws:secretsmanager:us-west-2:111111111111:secret:proxy-abc123:username',
        PROXY_PASSWORD: 'arn:aws:secretsmanager:us-west-2:111111111111:secret:proxy-abc123:password',
        HTTP_PROXY_PORT: 'arn:aws:secretsmanager:us-west-2:111111111111:secret:proxy-abc123:http_proxy_port',
        HTTPS_PROXY_PORT: 'arn:aws:secretsmanager:us-west-2:111111111111:secret:proxy-abc123:https_proxy_port',
        PROXY_DOMAIN: 'arn:aws:secretsmanager:us-west-2:111111111111:secret:proxy-abc123:proxy_domain',
      });
    }
    // And each project's role can actually read the secret.
    t.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'secretsmanager:GetSecretValue',
            Resource: 'arn:aws:secretsmanager:us-west-2:111111111111:secret:proxy-abc123',
          }),
        ]),
      }),
    });
  });

  test('an explicit noProxy is used as-is, without the default region endpoint added', () => {
    const config = defineCICD({
      application: 'shop',
      repository: Repository.s3('shop-src/app.zip'),
      stages: ['dev'],
      proxy: {
        proxySecretArn: 'arn:aws:secretsmanager:us-west-2:111111111111:secret:proxy-abc123',
        noProxy: ['internal.example.com'],
      },
    });
    const build = Object.values(render(config).findResources('AWS::CodeBuild::Project'))[0];
    const spec = JSON.parse(build.Properties.Source.BuildSpec);
    expect(spec.env.variables.NO_PROXY).toBe('internal.example.com');
  });

  test('without a proxy config no project sets up a tunnel and no secret grant is made', () => {
    const config = defineCICD({ application: 'shop', repository: Repository.s3('shop-src/app.zip'), stages: ['dev'] });
    const t = render(config);

    const projects = Object.values(t.findResources('AWS::CodeBuild::Project'));
    for (const p of projects) {
      const spec = JSON.parse(p.Properties.Source.BuildSpec);
      expect(spec.env).toBeUndefined();
    }
    const policies = Object.values(t.findResources('AWS::IAM::Policy'));
    expect(policies.some((p) => JSON.stringify(p.Properties.PolicyDocument).includes('secretsmanager'))).toBe(false);
  });

  test('codeBuildEnvSettings (privileged, compute type, env vars) applies to every build project', () => {
    const config = defineCICD({
      application: 'shop',
      repository: Repository.s3('shop-src/app.zip'),
      stages: ['dev'],
      codeBuildEnvSettings: {
        privileged: true,
        computeType: codebuild.ComputeType.LARGE,
        environmentVariables: { FOO: { value: 'bar' } },
      },
    });
    const t = render(config);

    // Build, self-update, and the one deploy project -- v2's uniform application to every project.
    const projects = Object.values(t.findResources('AWS::CodeBuild::Project'));
    expect(projects).toHaveLength(3);
    for (const p of projects) {
      expect(p.Properties.Environment).toEqual(
        expect.objectContaining({
          PrivilegedMode: true,
          ComputeType: 'BUILD_GENERAL1_LARGE',
          EnvironmentVariables: expect.arrayContaining([expect.objectContaining({ Name: 'FOO', Value: 'bar' })]),
        }),
      );
    }
  });

  test('a Docker-registry buildImage on the engine still wins over codeBuildEnvSettings.buildImage', () => {
    const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
    new CodePipelineEngine({ buildImage: 'public.ecr.aws/example/node:22' }).render(stack, {
      config: defineCICD({
        application: 'shop',
        repository: Repository.s3('shop-src/app.zip'),
        stages: ['dev'],
        codeBuildEnvSettings: { computeType: codebuild.ComputeType.MEDIUM },
      }),
      pipelineName: 'shop-pipeline',
    });

    const t = Template.fromStack(stack);
    for (const p of Object.values(t.findResources('AWS::CodeBuild::Project'))) {
      // The ctor's Docker image is used, not overridden by the (unset) codeBuildEnvSettings.buildImage.
      expect(p.Properties.Environment.Image).toBe('public.ecr.aws/example/node:22');
      // But the config's other settings still apply alongside it.
      expect(p.Properties.Environment.ComputeType).toBe('BUILD_GENERAL1_MEDIUM');
    }
  });

  test('without codeBuildEnvSettings every build project keeps the CDK-managed environment default', () => {
    const config = defineCICD({ application: 'shop', repository: Repository.s3('shop-src/app.zip'), stages: ['dev'] });
    const t = render(config);

    for (const p of Object.values(t.findResources('AWS::CodeBuild::Project'))) {
      expect(p.Properties.Environment.PrivilegedMode).toBe(false);
      expect(p.Properties.Environment.EnvironmentVariables).toBeUndefined();
    }
  });

  test('a managed vpc config attaches every build project to it (build, self-update, deploy)', () => {
    const config = defineCICD({
      application: 'shop',
      repository: Repository.s3('shop-src/app.zip'),
      stages: ['dev'],
      vpc: { managedVpc: { cidrBlock: '10.0.0.0/16' } },
    });
    const t = render(config);

    t.resourceCountIs('AWS::EC2::VPC', 1);
    const projects = Object.values(t.findResources('AWS::CodeBuild::Project'));
    expect(projects).toHaveLength(3);
    for (const p of projects) {
      expect(p.Properties.VpcConfig).toBeDefined();
      expect(p.Properties.VpcConfig.VpcId).toBeDefined();
      expect(p.Properties.VpcConfig.Subnets.length).toBeGreaterThan(0);
      expect(p.Properties.VpcConfig.SecurityGroupIds.length).toBeGreaterThan(0);
    }
  });

  test('without a vpc config no build project gets a VpcConfig and no VPC is created', () => {
    const config = defineCICD({ application: 'shop', repository: Repository.s3('shop-src/app.zip'), stages: ['dev'] });
    const t = render(config);

    t.resourceCountIs('AWS::EC2::VPC', 0);
    for (const p of Object.values(t.findResources('AWS::CodeBuild::Project'))) {
      expect(p.Properties.VpcConfig).toBeUndefined();
    }
  });

  describe('m9-migrate-compliance-bucket: complianceLogBucketName', () => {
    test('a configured name provisions the compliance bucket, even though nothing reads it yet', () => {
      const config = defineCICD({
        application: 'shop',
        repository: Repository.s3('shop-src/app.zip'),
        stages: ['dev'],
        complianceLogBucketName: 'shop-compliance-log-bucket',
      });
      const t = render(config);

      t.hasResourceProperties('AWS::S3::Bucket', { BucketName: 'shop-compliance-log-bucket' });
    });

    test('without complianceLogBucketName no compliance bucket is created', () => {
      const config = defineCICD({
        application: 'shop',
        repository: Repository.s3('shop-src/app.zip'),
        stages: ['dev'],
      });
      const t = render(config);

      const buckets = Object.values(t.findResources('AWS::S3::Bucket'));
      // Only the pipeline's own artifact bucket -- no second bucket for compliance logs.
      expect(buckets).toHaveLength(1);
    });
  });

  test('every build project pins a Node runtime new enough for aws-cdk-lib', () => {
    const config = defineCICD({
      application: 'shop',
      repository: Repository.s3('shop-src/app.zip'),
      stages: ['dev', 'prod'],
    });
    const projects = Object.values(render(config).findResources('AWS::CodeBuild::Project'));

    // Measured in a real pipeline run: with no runtime-versions the image default is Node 18, while
    // aws-cdk-lib declares node >= 20, so npm ci warns EBADENGINE and the app runs on unsupported Node.
    // Asserted on EVERY project (build, self-update, both deploys) -- one unpinned project is one broken
    // stage -- and on the version being >= 20 rather than a literal, so a bump stays honest.
    expect(projects).toHaveLength(4);
    for (const p of projects) {
      const spec = JSON.parse(p.Properties.Source.BuildSpec);
      expect(spec.phases.install['runtime-versions'].nodejs).toBeGreaterThanOrEqual(20);
    }
  });

  test('a user-supplied buildImage gets NO runtime-versions pin', () => {
    const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
    new CodePipelineEngine({ buildImage: 'public.ecr.aws/example/node:18' }).render(stack, {
      config: defineCICD({ application: 'shop', repository: Repository.s3('shop-src/app.zip'), stages: ['dev'] }),
      pipelineName: 'shop-pipeline',
    });

    // `runtime-versions` is only honoured by the CodeBuild-managed standard images, and each offers a
    // fixed set of Node versions. Emitting the pin for a custom image (or standard:5.0/6.0, where nodejs
    // 22 does not exist) turns a working pipeline into a hard YAML_FILE_ERROR in the install phase, so a
    // user who brings their own image owns its Node version.
    for (const p of Object.values(Template.fromStack(stack).findResources('AWS::CodeBuild::Project'))) {
      const spec = JSON.parse(p.Properties.Source.BuildSpec);
      expect(spec.phases.install).toBeUndefined();
    }
  });

  test('the artifact store is the wrapper support bucket, encrypted with the support key', () => {
    const config = defineCICD({ application: 'shop', repository: Repository.s3('shop-src/app.zip'), stages: ['dev'] });
    const t = render(config);

    // Exactly one bucket: the pipeline uses ours instead of generating its own.
    t.resourceCountIs('AWS::S3::Bucket', 1);
    t.resourceCountIs('AWS::KMS::Key', 1);
    t.hasResourceProperties('AWS::CodePipeline::Pipeline', {
      ArtifactStore: Match.objectLike({
        Type: 'S3',
        Location: { Ref: Match.stringLikeRegexp('SupportArtifactBucket') },
        // The CMK link, not just the bucket -- without this the test would pass on an
        // unencrypted (or S3-managed) artifact store.
        EncryptionKey: Match.objectLike({
          Type: 'KMS',
          Id: { 'Fn::GetAtt': [Match.stringLikeRegexp('SupportEncryptionKey'), 'Arn'] },
        }),
      }),
    });
  });

  test('the engine removal policy reaches the pipeline artifact bucket', () => {
    const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
    new CodePipelineEngine({ removalPolicy: RemovalPolicy.DESTROY }).render(stack, {
      config: defineCICD({ application: 'shop', repository: Repository.s3('shop-src/app.zip'), stages: ['dev'] }),
      pipelineName: 'shop-pipeline',
    });

    // This is the path m4-verify's teardown depends on: a disposable pipeline must leave no bucket.
    const t = Template.fromStack(stack);
    t.hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Delete' });
    t.hasResource('AWS::KMS::Key', { DeletionPolicy: 'Delete' });
    t.resourceCountIs('Custom::S3AutoDeleteObjects', 1);
  });

  test('a disposable pipeline stays disposable: its self-update re-emits itself with --disposable', () => {
    const renderWith = (removalPolicy?: RemovalPolicy) => {
      const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
      new CodePipelineEngine({ removalPolicy }).render(stack, {
        config: defineCICD({ application: 'shop', repository: Repository.s3('shop-src/app.zip'), stages: ['dev'] }),
        pipelineName: 'shop-pipeline',
      });
      return Template.fromStack(stack);
    };

    // Without the flag the self-update runs a default (RETAIN) deploy-ci and un-disposes the pipeline's
    // own bucket/key on its first execution -- the teardown m4-verify relies on would then leak them.
    renderWith(RemovalPolicy.DESTROY).hasResourceProperties('AWS::CodeBuild::Project', {
      Source: { BuildSpec: Match.stringLikeRegexp('cdk-cicd deploy-ci --disposable') },
    });
    // And the default pipeline must NOT pass --disposable, or a real pipeline would delete its own
    // artifact history on the next push.
    const disposableProjects = Object.values(renderWith().findResources('AWS::CodeBuild::Project')).filter((p) =>
      JSON.stringify(p.Properties.Source.BuildSpec).includes('--disposable'),
    );
    expect(disposableProjects).toEqual([]);
  });

  test('a stage deploy project may assume the bootstrap roles in every region of its stage', () => {
    const config = defineCICD({
      application: 'shop',
      repository: Repository.s3('shop-src/app.zip'),
      stages: [{ name: 'dev', env: { account: '222222222222', regions: ['us-west-2', 'us-west-1'] } }],
    });

    // Without this the deploy project runs and fails AccessDenied -- cdk deploy does everything
    // through the bootstrap roles.
    render(config).hasResourceProperties('AWS::IAM::Policy', {
      // Pin the principal too, so the statements landing on some other role would not pass.
      Roles: [{ Ref: Match.stringLikeRegexp('DeploydevRole') }],
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sts:AssumeRole',
            Resource: Match.arrayWith([
              arnEndingIn(':iam::222222222222:role/cdk-hnb659fds-deploy-role-222222222222-us-west-2'),
              arnEndingIn(':iam::222222222222:role/cdk-hnb659fds-file-publishing-role-222222222222-us-west-2'),
              arnEndingIn(':iam::222222222222:role/cdk-hnb659fds-image-publishing-role-222222222222-us-west-2'),
              arnEndingIn(':iam::222222222222:role/cdk-hnb659fds-lookup-role-222222222222-us-west-2'),
              arnEndingIn(':iam::222222222222:role/cdk-hnb659fds-deploy-role-222222222222-us-west-1'),
            ]),
          }),
          Match.objectLike({
            Action: 'ssm:GetParameter',
            Resource: Match.arrayWith([
              arnEndingIn(':ssm:us-west-2:222222222222:parameter/cdk-bootstrap/hnb659fds/version'),
              arnEndingIn(':ssm:us-west-1:222222222222:parameter/cdk-bootstrap/hnb659fds/version'),
            ]),
          }),
        ]),
      }),
    });
  });

  test("a stage's forced deploy role is assumable too", () => {
    const config = defineCICD({
      application: 'shop',
      repository: Repository.s3('shop-src/app.zip'),
      stages: [
        {
          name: 'dev',
          env: { account: '222222222222', region: 'us-west-2' },
          deployment: { deployRole: 'arn:aws:iam::222222222222:role/forced-deployer' },
        },
      ],
    });

    render(config).hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sts:AssumeRole',
            Resource: Match.arrayWith(['arn:aws:iam::222222222222:role/forced-deployer']),
          }),
        ]),
      }),
    });
  });

  test('a blank configured deploy role is no forced role, not an empty ARN', () => {
    const config = defineCICD({
      application: 'shop',
      repository: Repository.s3('shop-src/app.zip'),
      stages: [{ name: 'dev', env: { account: '222222222222', region: 'us-west-2' }, deployment: { deployRole: '' } }],
    });

    // An empty string in Resource makes the policy document malformed and fails the stack deploy.
    const statements = render(config).findResources('AWS::IAM::Policy');
    const resources = Object.values(statements).flatMap((p) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p.Properties.PolicyDocument.Statement as any[]).flatMap((s) =>
        Array.isArray(s.Resource) ? s.Resource : [s.Resource],
      ),
    );
    expect(resources).not.toContain('');
  });

  test('a gated stage gets a manual approval action ordered ahead of its deploy', () => {
    const config = defineCICD({
      application: 'shop',
      repository: Repository.s3('shop-src/app.zip'),
      stages: ['dev', 'prod'],
    });

    // Run order is what actually holds the deploy back, so assert it rather than mere co-presence:
    // an approval at the same run order as the deploy would run alongside it and gate nothing.
    render(config).hasResourceProperties('AWS::CodePipeline::Pipeline', {
      Stages: Match.arrayWith([
        Match.objectLike({
          Name: 'prod',
          Actions: Match.arrayWith([
            Match.objectLike({
              Name: 'Approve-prod',
              ActionTypeId: Match.objectLike({ Category: 'Approval', Provider: 'Manual' }),
              RunOrder: 1,
            }),
            Match.objectLike({ Name: 'Deploy-prod', RunOrder: 2 }),
          ]),
        }),
      ]),
    });
  });

  test('an ungated stage has no approval action at all, and its deploy still runs first', () => {
    const config = defineCICD({
      application: 'shop',
      repository: Repository.s3('shop-src/app.zip'),
      stages: ['dev', 'prod'],
    });
    const pipeline = Object.values(render(config).findResources('AWS::CodePipeline::Pipeline'))[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dev = (pipeline.Properties.Stages as any[]).find((s) => s.Name === 'dev');

    // `dev` auto-approves, so a gate here would stall the inner loop the default is meant to keep fast.
    expect(dev.Actions.map((a: { Name: string }) => a.Name)).toEqual(['Deploy-dev']);
    expect(dev.Actions[0].RunOrder).toBe(1);
  });

  test('gating a stage adds no pipeline stage and no CodeBuild project', () => {
    const stages = (manualApproval: boolean) =>
      defineCICD({
        application: 'shop',
        repository: Repository.s3('shop-src/app.zip'),
        stages: [{ name: 'prod', env: { account: '222222222222', region: 'us-west-2' }, manualApproval }],
      });

    // The approval rides in the deploy stage; putting it in a stage of its own would inflate the
    // pipeline shape that the flat-footprint claim is measured against.
    for (const gated of [true, false]) {
      const t = render(stages(gated));
      const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((pipeline.Properties.Stages as any[]).map((s) => s.Name)).toEqual([
        'Source',
        'Build',
        'UpdatePipeline',
        'prod',
      ]);
      // CI build + self-update + the one deploy = 3; the gate itself adds no project.
      t.resourceCountIs('AWS::CodeBuild::Project', 3);
      // ManualApprovalAction creates a topic as soon as it is given notifyEmails, so pin the absence:
      // a notification default sneaking in would put an unmanaged SNS topic in every user's pipeline.
      t.resourceCountIs('AWS::SNS::Topic', 0);
    }
  });

  test('manualApproval: false overrides the approval-by-default a non-dev stage name would get', () => {
    const config = defineCICD({
      application: 'shop',
      repository: Repository.s3('shop-src/app.zip'),
      stages: [{ name: 'prod', env: { account: '222222222222', region: 'us-west-2' }, manualApproval: false }],
    });
    const actionTypes = Object.values(render(config).findResources('AWS::CodePipeline::Pipeline')).flatMap((p) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p.Properties.Stages as any[]).flatMap((s) => s.Actions.map((a: any) => a.ActionTypeId.Category)),
    );
    // Asserted positively rather than as `not.toContain('Approval')`: a bare negative over a derived
    // list passes when the list is EMPTY, so a future change that moves the pipeline into a nested
    // stack would make this test green while checking nothing. Source, CI Build, self-update, deploy --
    // all Build category except Source, and crucially no Approval.
    expect(actionTypes).toEqual(['Source', 'Build', 'Build', 'Build']);
  });

  // NOTE: the nag suppressions the engine registers (AwsSolutions-IAM5 on the pipeline/project roles,
  // S1 on the artifact bucket) are not asserted here, because `NagSuppressions.addResourceSuppressions`
  // gates on `instanceof CfnResource` against cdk-nag's own aws-cdk-lib copy, which the wrapper's nested
  // copy fails -- the same duplicate-copy issue that makes the checker itself inert in this workspace.
  // Their liveness is proven end-to-end by `m4-verify` (a real single-copy install, where deploy-ci's
  // synth passes only because the suppressions register).
  //
  // It is NOT unassertable in principle: forcing a single copy (a jest `moduleNameMapper` for
  // `^aws-cdk-lib(/.*)?$`, or a `Module._resolveFilename` shim) makes nag live here and reproduces
  // 53 findings -> 0, control assertion included. Wiring that into this suite is `m4-nag-compliance`.

  describe('m4-assembly-promotion: deploy model', () => {
    const cfg = (deployModel?: DeployModel) =>
      defineCICD({
        application: 'shop',
        repository: Repository.s3('shop-src/app.zip'),
        stages: ['dev', 'prod'],
        deployModel,
      });

    /** The buildspec of the project whose commands contain `marker`, parsed. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    test('promotion is the DEFAULT: Build publishes cdk.out and deploys consume it without synthing', () => {
      const t = render(cfg());

      // The Build project publishes the WHOLE source tree plus cdk.out, minus node_modules. A hardcoded
      // allowlist broke multi-file configs, tsconfig-compiled configs, and postinstall inputs -- all of
      // which `cdk-cicd deploy --from-assembly` still needs because it loads cicd.config.ts under ts-node
      // and runs `npm ci`. Assert the whole-tree publish AND the node_modules exclusion, since dropping
      // either silently breaks a promoted deploy while leaving Build green.
      const build = specContaining(t, 'cdk-cicd synth --all');
      expect(build.artifacts.files).toEqual(['**/*']);
      expect(build.artifacts['exclude-paths']).toEqual(['node_modules/**/*']);

      // ...and each deploy consumes it rather than synthesizing.
      for (const stage of ['dev', 'prod']) {
        expect(JSON.stringify(specContaining(t, `deploy --stage ${stage}`).phases.build.commands)).toContain(
          '--from-assembly',
        );
      }
    });

    test('the deploy actions take the Build output artifact as input, not the source', () => {
      const pipeline = Object.values(render(cfg()).findResources('AWS::CodePipeline::Pipeline'))[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stages = pipeline.Properties.Stages as any[];
      const build = stages.find((s) => s.Name === 'Build').Actions[0];
      const deploy = stages.find((s) => s.Name === 'dev').Actions[0];

      // Without this wiring the deploy would run --from-assembly against a source-only input and fail
      // (by design) -- so pin that the artifact Build produces is exactly what the deploy consumes.
      expect(build.OutputArtifacts).toEqual([{ Name: 'Assembly' }]);
      expect(deploy.InputArtifacts).toEqual([{ Name: 'Assembly' }]);
    });

    test('deploy-time synth: CI synths ONE env by default, that stage reuses it, the rest synth themselves', () => {
      const t = render(cfg(DeployModel.DEPLOY_TIME_SYNTH));
      const build = specContaining(t, 'cdk-cicd synth');
      const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stages = pipeline.Properties.Stages as any[];

      // Efficiency rule 2: one env in CI, not `--all`. Synthesizing every stage in CI and then again per
      // stage is the waste that prompted the D-deploy amendment.
      const ciCommands = JSON.stringify(build.phases.build.commands);
      expect(ciCommands).toContain('cdk-cicd synth --stage dev');
      expect(ciCommands).not.toContain('--all');
      expect(ciCommands).not.toContain('--stage prod');

      // dev reuses what CI already built... (marker must say `deploy`, since CI now also mentions
      // `--stage dev` via its synth command)
      expect(JSON.stringify(specContaining(t, 'deploy --stage dev').phases.build.commands)).toContain(
        '--from-assembly',
      );
      // ...prod still synthesizes, so it must receive the RAW SOURCE, not the reduced assembly artifact
      // (which omits bin/ and lib/ and could not be synthesized).
      expect(JSON.stringify(specContaining(t, 'deploy --stage prod').phases.build.commands)).not.toContain(
        '--from-assembly',
      );
      expect(stages.find((s) => s.Name === 'dev').Actions[0].InputArtifacts).toEqual([{ Name: 'Assembly' }]);
      expect(stages.find((s) => s.Name === 'prod').Actions[0].InputArtifacts).not.toEqual([{ Name: 'Assembly' }]);
    });

    test('ci.synthStages selects which stages CI synthesizes, and rejects an unknown name', () => {
      const t = render(
        defineCICD({
          application: 'shop',
          repository: Repository.s3('shop-src/app.zip'),
          stages: ['dev', 'prod'],
          deployModel: DeployModel.DEPLOY_TIME_SYNTH,
          ci: { synthStages: ['prod'] },
        }),
      );
      // The lever now does something: it was declared, normalized and read by nothing before this task
      // (finding `qa-ci-synthstages-declared-but-inert`).
      const ciCommands = JSON.stringify(specContaining(t, 'cdk-cicd synth').phases.build.commands);
      expect(ciCommands).toContain('--stage prod');
      expect(ciCommands).not.toContain('--stage dev');
      expect(JSON.stringify(specContaining(t, '--stage prod --yes').phases.build.commands)).toContain(
        '--from-assembly',
      );

      // A typo used to be silently ignored; now it names the offending stage.
      expect(() =>
        render(
          defineCICD({
            application: 'shop',
            repository: Repository.s3('shop-src/app.zip'),
            stages: ['dev'],
            deployModel: DeployModel.DEPLOY_TIME_SYNTH,
            ci: { synthStages: ['staging'] },
          }),
        ),
      ).toThrow(/unknown stage\(s\): staging/);
    });

    test("ci.synthStages: 'all' synthesizes EVERY stage under deploy-time synth, not just the first", () => {
      // The documented meaning of 'all'. It once collapsed to [] and the engine read [] as "one env",
      // so 'all' silently synthesized only the first stage -- the opposite of what it says.
      const t = render(
        defineCICD({
          application: 'shop',
          repository: Repository.s3('shop-src/app.zip'),
          stages: ['dev', 'prod'],
          deployModel: DeployModel.DEPLOY_TIME_SYNTH,
          ci: { synthStages: 'all' },
        }),
      );
      const ci = JSON.stringify(specContaining(t, 'cdk-cicd synth').phases.build.commands);
      expect(ci).toContain('--stage dev');
      expect(ci).toContain('--stage prod');
      // ...and both stages then reuse what CI built, rather than re-synthing.
      for (const s of ['dev', 'prod']) {
        expect(JSON.stringify(specContaining(t, `deploy --stage ${s}`).phases.build.commands)).toContain(
          '--from-assembly',
        );
      }
    });

    test('narrowing synthStages under promotion is a clear error, not a silently broken pipeline', () => {
      // Every stage's assembly IS its deployed artifact here, so a narrowed set would leave a stage with
      // nothing to deploy -- the failure would otherwise surface as a deploy-time "no manifest.json".
      expect(() =>
        render(
          defineCICD({
            application: 'shop',
            repository: Repository.s3('shop-src/app.zip'),
            stages: ['dev', 'prod'],
            ci: { synthStages: ['dev'] },
          }),
        ),
      ).toThrow(/ci.synthStages cannot be narrowed when deployModel is ASSEMBLY_PROMOTION/);
    });

    test('the self-update never uses --from-assembly: it re-synths the pipeline from config', () => {
      // The pipeline's own definition comes from cicd.config.ts, not from the app's promoted assembly --
      // pointing deploy-ci at a promoted cdk.out would deploy the app's stacks, not the pipeline.
      const commands = JSON.stringify(specContaining(render(cfg()), 'deploy-ci').phases.build.commands);
      expect(commands).toContain('cdk-cicd deploy-ci');
      expect(commands).not.toContain('--from-assembly');
    });
  });

  describe('m4-deploy-observer: asyncDeploy', () => {
    const asyncCfg = () =>
      defineCICD({
        application: 'shop',
        repository: Repository.s3('shop-src/app.zip'),
        stages: ['dev', 'prod'],
        asyncDeploy: true,
      });

    test('the deploy prepares change sets and a Lambda action awaits them, ordered after it', () => {
      const t = render(asyncCfg());
      const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prod = (pipeline.Properties.Stages as any[]).find((s) => s.Name === 'prod');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const byName = (n: string) => prod.Actions.find((a: any) => a.Name === n);

      // prod is gated, so: approval(1) -> prepare(2) -> await(3). The await MUST be strictly after the
      // prepare -- it reads the plan that step writes, so equal run orders would race.
      expect(byName('Approve-prod').RunOrder).toBe(1);
      expect(byName('Deploy-prod').RunOrder).toBe(2);
      expect(byName('Await-prod').RunOrder).toBe(3);
      expect(byName('Await-prod').ActionTypeId).toMatchObject({ Category: 'Invoke', Provider: 'Lambda' });

      // One driver per stage, and the build only prepares.
      t.resourceCountIs('AWS::Lambda::Function', 2);
      expect(JSON.stringify(specContaining(t, 'deploy --stage prod').phases.build.commands)).toContain(
        '--prepare-only --plan-parameter /cdk-cicd/shop-pipeline/prod/deploy-plan',
      );

      // The Await action must tell the Lambda WHICH parameter to read -- assert the payload, not just the
      // action's existence. A wrong/absent planParameterName had the Lambda read the wrong plan while the
      // template still rendered (mutation-confirmed in review).
      expect(byName('Await-prod').Configuration.UserParameters).toContain('/cdk-cicd/shop-pipeline/prod/deploy-plan');

      // And the driver must actually be granted to execute change sets -- deleting this grant left the
      // template green and failed only at runtime with AccessDenied.
      t.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(['cloudformation:ExecuteChangeSet', 'cloudformation:DescribeStacks']),
            }),
          ]),
        }),
      });
    });

    test('the driver Lambda is NOT granted sts:AssumeRole, even when the stage forces a deploy role', () => {
      // A stage's deployRole is a CloudFormation SERVICE role baked into the change set via --role-arn;
      // the Lambda executes under its own identity and must not try to assume it (that role does not
      // trust the Lambda). Regression guard for the two commits that disagreed on what deployRole means.
      const t = render(
        defineCICD({
          application: 'shop',
          repository: Repository.s3('shop-src/app.zip'),
          stages: [
            {
              name: 'dev',
              env: { account: '111111111111', region: 'us-west-2' },
              deployment: { deployRole: 'arn:aws:iam::111111111111:role/Deployer' },
            },
          ],
          asyncDeploy: true,
        }),
      );
      const awaitRolePolicies = Object.entries(t.findResources('AWS::IAM::Policy')).filter(([id]) =>
        id.includes('Await'),
      );
      const assumeOnAwait = awaitRolePolicies.some(([, p]) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p.Properties.PolicyDocument.Statement as any[]).some((s) =>
          JSON.stringify(s.Action).includes('sts:AssumeRole'),
        ),
      );
      expect(assumeOnAwait).toBe(false);
    });

    test('a cross-account stage with asyncDeploy is refused at render time, not left to fail mid-deploy', () => {
      expect(() =>
        render(
          defineCICD({
            application: 'shop',
            repository: Repository.s3('shop-src/app.zip'),
            stages: [{ name: 'dev', env: { account: '999999999999', region: 'us-west-2' } }],
            asyncDeploy: true,
          }),
        ),
      ).toThrow(/asyncDeploy does not yet support a cross-account stage/);
    });

    test('the plan parameter is the only channel: build writes it, driver reads it, both scoped to it', () => {
      const t = render(asyncCfg());
      const policies = Object.values(t.findResources('AWS::IAM::Policy'));
      const statements = policies.flatMap((p) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p.Properties.PolicyDocument.Statement as any[]).map((s) => ({
          actions: Array.isArray(s.Action) ? s.Action : [s.Action],
          resource: JSON.stringify(s.Resource),
        })),
      );

      // Least privilege on the handoff: the build may only PUT this one parameter, the driver only GET it.
      // Filtered on the plan parameter, because `ssm:GetParameter` is ALSO granted for the CDK bootstrap
      // version parameter -- a count over the bare action would silently include those.
      const onPlan = statements.filter((s) => s.resource.includes('deploy-plan'));
      const put = onPlan.filter((s) => s.actions.includes('ssm:PutParameter'));
      const get = onPlan.filter((s) => s.actions.includes('ssm:GetParameter'));
      expect(put).toHaveLength(2); // one prepare step per stage
      expect(get).toHaveLength(2); // one driver per stage
      for (const s of onPlan) {
        expect(s.resource).toContain('parameter/cdk-cicd/shop-pipeline/');
      }
      // And nothing hands out ssm on a wildcard.
      expect(
        statements.filter((s) => s.actions.some((a: string) => a.startsWith('ssm:')) && s.resource === '"*"'),
      ).toEqual([]);
    });

    test('the driver Lambda uses the newest runtime THIS aws-cdk-lib knows, not a hardcoded one', () => {
      const t = render(asyncCfg());
      const runtimes = Object.values(t.findResources('AWS::Lambda::Function')).map((f) => f.Properties.Runtime);
      const newest = Runtime.ALL.filter((r) => r.family === RuntimeFamily.NODEJS && /^nodejs\d+\./.test(r.name))
        .map((r) => parseInt(r.name.replace('nodejs', ''), 10))
        .reduce((a, b) => Math.max(a, b), 0);

      // Measured on a real run: cdk-nag's AwsSolutions-L1 derives "latest" from the RESOLVED aws-cdk-lib,
      // and the wrapper peer-depends on ^2.195.0, so a user gets whatever is current. A hardcoded runtime
      // becomes a synth ERROR -- blocking deploy-ci outright -- as soon as AWS ships a newer one. Pinning
      // 22 passed here (2.195.0 knows up to 22) and failed against 2.266.0 (which knows 24), so assert
      // against the library rather than a literal, or this test would re-freeze the bug.
      expect(runtimes).not.toEqual([]);
      for (const r of runtimes) {
        expect(r).toEqual(`nodejs${newest}.x`);
      }
    });

    test('asyncDeploy is off by default, so the proven build-compute path renders unchanged', () => {
      // Ground rule 1: the new capability ships alongside what already works, not in place of it.
      const t = render(
        defineCICD({ application: 'shop', repository: Repository.s3('shop-src/app.zip'), stages: ['dev', 'prod'] }),
      );
      t.resourceCountIs('AWS::Lambda::Function', 0);
      const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const names = (pipeline.Properties.Stages as any[]).flatMap((s) => s.Actions.map((a: any) => a.Name));
      expect(names.filter((n: string) => n.startsWith('Await-'))).toEqual([]);
      expect(JSON.stringify(specContaining(t, 'deploy --stage dev').phases.build.commands)).not.toContain(
        '--prepare-only',
      );
    });
  });

  test('a stage with no regions falls back to the pipeline stack region', () => {
    const config = defineCICD({ application: 'shop', repository: Repository.s3('shop-src/app.zip'), stages: ['dev'] });
    render(config).hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sts:AssumeRole',
            // account and region both come from the pipeline stack when the stage omits them.
            Resource: Match.arrayWith([
              arnEndingIn(':iam::111111111111:role/cdk-hnb659fds-deploy-role-111111111111-us-west-2'),
            ]),
          }),
        ]),
      }),
    });
  });

  describe('m9-migrate-custom-buildspec: ci.partialBuildSpec escape hatch', () => {
    test('a ci.partialBuildSpec is deep-merged into the CI build project, augmenting rather than replacing it', () => {
      const config = defineCICD({
        application: 'shop',
        repository: Repository.s3('shop-src/app.zip'),
        stages: ['dev'],
        ci: {
          partialBuildSpec: codebuild.BuildSpec.fromObject({
            version: '0.2',
            env: { variables: { CUSTOM_VAR: 'custom-value' } },
            phases: { install: { commands: ['echo custom-install'] } },
          }),
        },
      });
      const build = specContaining(render(config), 'npm run audit');

      // The user's fragment lands on the CI build project's spec...
      expect(build.env.variables.CUSTOM_VAR).toBe('custom-value');
      expect(build.phases.install.commands).toContain('echo custom-install');
      // ...WITHOUT dropping the engine's own generated content -- a naive `replace` here would drop the
      // Node runtime pin and the default CI commands, and a real pipeline would break silently.
      expect(build.phases.install['runtime-versions'].nodejs).toBeGreaterThanOrEqual(20);
      expect(build.phases.build.commands[0]).toBe('npm ci');
      expect(build.phases.build.commands.some((c: string) => c.includes('npm run audit'))).toBe(true);
    });

    test('the merge is scoped to the CI build project; self-update and stage deploys are untouched', () => {
      const config = defineCICD({
        application: 'shop',
        repository: Repository.s3('shop-src/app.zip'),
        stages: ['dev'],
        ci: {
          partialBuildSpec: codebuild.BuildSpec.fromObject({
            version: '0.2',
            env: { variables: { CUSTOM_VAR: 'custom-value' } },
          }),
        },
      });
      const projects = Object.values(render(config).findResources('AWS::CodeBuild::Project'));
      const withCustomVar = projects.filter((p) =>
        JSON.stringify(p.Properties.Source.BuildSpec).includes('CUSTOM_VAR'),
      );
      // Exactly the CI build project -- v2's `ciBuildSpec` scoped the same way (Synth only), not the
      // self-update or per-stage deploy projects.
      expect(withCustomVar).toHaveLength(1);
    });

    test('without ci.partialBuildSpec the CI build project renders exactly as before (no env block)', () => {
      const config = defineCICD({
        application: 'shop',
        repository: Repository.s3('shop-src/app.zip'),
        stages: ['dev'],
      });
      const build = specContaining(render(config), 'npm run audit');
      expect(build.env).toBeUndefined();
    });
  });

  describe('codePipelineRoleNames (Blueprint role-name parity for the flat engine)', () => {
    test('forces the pipeline role name and the per-stage build role names via prefix', () => {
      const config = defineCICD({
        application: 'shop',
        repository: Repository.s3('shop-src/app.zip'),
        stages: ['dev', 'prod'],
        codePipelineRoleNames: { pipeline: 'shop-codepipeline-role', buildRolePrefix: 'shop-build' },
      });
      const t = render(config);
      const roleNames = Object.values(t.findResources('AWS::IAM::Role'))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => r.Properties.RoleName)
        .filter((n): n is string => typeof n === 'string');
      // The pipeline role, plus the CI build, self-update, and per-stage deploy build roles.
      expect(roleNames).toEqual(
        expect.arrayContaining([
          'shop-codepipeline-role',
          'shop-build-build', // BuildProject
          'shop-build-updatepipeline', // UpdatePipeline
          'shop-build-deploy-dev', // Deploy-dev
          'shop-build-deploy-prod', // Deploy-prod
        ]),
      );
    });

    test('omitting codePipelineRoleNames leaves every role CDK-named', () => {
      const config = defineCICD({
        application: 'shop',
        repository: Repository.s3('shop-src/app.zip'),
        stages: ['dev'],
      });
      const t = render(config);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of Object.values(t.findResources('AWS::IAM::Role')) as any[]) {
        expect(r.Properties.RoleName).toBeUndefined();
      }
    });

    test('only the pipeline name set: build roles stay CDK-named', () => {
      const config = defineCICD({
        application: 'shop',
        repository: Repository.s3('shop-src/app.zip'),
        stages: ['dev'],
        codePipelineRoleNames: { pipeline: 'shop-codepipeline-role' },
      });
      const t = render(config);
      const named = Object.values(t.findResources('AWS::IAM::Role'))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => r.Properties.RoleName)
        .filter((n): n is string => typeof n === 'string');
      expect(named).toEqual(['shop-codepipeline-role']);
    });
  });

  describe('warmAccountsFromSsm (SSM account warming ahead of the synth build)', () => {
    test('flag true: the synth build scans SSM and exports ACCOUNT_<STAGE> ahead of cdk synth', () => {
      const config = defineCICD({
        application: 'shop',
        repository: Repository.s3('shop-src/app.zip'),
        stages: ['dev'],
        warmAccountsFromSsm: true,
      });
      // The scan lands in the CI Build project's build phase, ahead of the `cdk-cicd synth` command
      // (same shell, so the exports reach synth). Qualifier is the config's derived qualifier ('shop').
      const build = specContaining(render(config), 'get-parameters-by-path');
      expect(build).toBeDefined();
      const commands = JSON.stringify(build.phases.build.commands);
      expect(commands).toContain('/shop/');
      expect(commands).toContain('ACCOUNT_${_warm_stage}');
      expect(commands).toContain('*Account*');
      // Fails loud when the scan finds nothing.
      expect(commands).toContain('exit 1');
      // The warming runs BEFORE the synth command in the same phase.
      const cmds: string[] = build.phases.build.commands;
      const scanIdx = cmds.findIndex((c) => c.includes('get-parameters-by-path'));
      const synthIdx = cmds.findIndex((c) => c.includes('cdk-cicd synth'));
      expect(scanIdx).toBeGreaterThanOrEqual(0);
      expect(synthIdx).toBeGreaterThan(scanIdx);
    });

    test('flag true: the synth build role is granted ssm:GetParametersByPath scoped to the qualifier path', () => {
      const config = defineCICD({
        application: 'shop',
        repository: Repository.s3('shop-src/app.zip'),
        stages: ['dev'],
        warmAccountsFromSsm: true,
      });
      render(config).hasResourceProperties('AWS::IAM::Policy', {
        // Pin it to the CI Build project's role, not any deploy role -- the scan runs in the synth build.
        Roles: [{ Ref: Match.stringLikeRegexp('BuildProjectRole') }],
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'ssm:GetParametersByPath',
              Resource: arnEndingIn(':ssm:us-west-2:111111111111:parameter/shop/*'),
            }),
          ]),
        }),
      });
    });

    test('flag absent: neither the SSM scan nor the GetParametersByPath grant is present', () => {
      const config = defineCICD({
        application: 'shop',
        repository: Repository.s3('shop-src/app.zip'),
        stages: ['dev'],
      });
      const t = render(config);
      const specs = Object.values(t.findResources('AWS::CodeBuild::Project')).map((p) =>
        JSON.stringify(p.Properties.Source.BuildSpec),
      );
      expect(specs.some((s) => s.includes('get-parameters-by-path'))).toBe(false);
      const policies = JSON.stringify(t.findResources('AWS::IAM::Policy'));
      expect(policies).not.toContain('ssm:GetParametersByPath');
    });
  });
});
