// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { defineCICD } from '../../../../src/v3/config/define';
import { Repository } from '../../../../src/v3/config/repository';
import { CodePipelineEngine } from '../../../../src/v3/engine/codepipeline/CodePipelineEngine';

function render(config: ReturnType<typeof defineCICD>): Template {
  const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
  new CodePipelineEngine().render(stack, { config, pipelineName: 'shop-pipeline' });
  return Template.fromStack(stack);
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
    const config = defineCICD({ application: 'shop', repository: Repository.s3('shop-src/nested/app.zip'), stages: ['dev'] });
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
});
