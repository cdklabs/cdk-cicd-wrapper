// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { App, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { defineCICD } from '../../../../src/v3/config/define';
import { Repository } from '../../../../src/v3/config/repository';
import { CodePipelineEngine } from '../../../../src/v3/engine/codepipeline/CodePipelineEngine';

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

  test('the default CI run includes the checks, so validate/audit/license/security are default-on', () => {
    const config = defineCICD({ application: 'shop', repository: Repository.s3('shop-src/app.zip'), stages: ['dev'] });
    // Without this the checks exist as a CLI command nobody in CI ever calls.
    render(config).hasResourceProperties('AWS::CodeBuild::Project', {
      Source: { BuildSpec: Match.stringLikeRegexp('cdk-cicd check') },
    });
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
});
