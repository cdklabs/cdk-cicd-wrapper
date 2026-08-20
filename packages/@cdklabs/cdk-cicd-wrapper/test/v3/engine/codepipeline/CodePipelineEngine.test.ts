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
    // 1 build project + 1 per stage (dev, prod) = 3 -- and NOT one-per-region (dev has 2 regions).
    t.resourceCountIs('AWS::CodeBuild::Project', 3);
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
