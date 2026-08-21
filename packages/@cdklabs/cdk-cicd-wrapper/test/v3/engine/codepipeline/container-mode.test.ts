// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Container mode (Repo 1): the CodePipeline engine renders a build-and-push-to-ECR pipeline instead of a
// deploy pipeline when the config carries a deployerImage.

import { App, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { BuildImage, ImageTagStrategy } from '../../../../src/v3/config/build-image';
import { defineCICD } from '../../../../src/v3/config/define';
import { Repository } from '../../../../src/v3/config/repository';
import { CodePipelineEngine } from '../../../../src/v3/engine/codepipeline/CodePipelineEngine';

function render(config: ReturnType<typeof defineCICD>, removalPolicy?: RemovalPolicy): Template {
  const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
  new CodePipelineEngine({ removalPolicy }).render(stack, { config, pipelineName: 'shop-pipeline' });
  return Template.fromStack(stack);
}
const cfg = (deployerImage: BuildImage) =>
  defineCICD({ application: 'shop', repository: Repository.s3('shop-src/app.zip'), stages: ['dev'], deployerImage });

// The one CodeBuild project's buildspec, stringified. It embeds account/region tokens, so CDK renders it
// as a Fn::Join object (not a JSON string); the command literals sit in that structure, so a substring
// search over the stringified object is the reliable assertion.
function buildCommands(t: Template): string {
  const p = Object.values(t.findResources('AWS::CodeBuild::Project'))[0];
  return JSON.stringify(p.Properties.Source.BuildSpec);
}

describe('m6-container: image-build pipeline', () => {
  test('deployerImage renders Source -> BuildImage and NO deploy/self-update/approval stages', () => {
    const t = render(cfg(BuildImage.docker()));
    const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stageNames = (pipeline.Properties.Stages as any[]).map((s) => s.Name);

    expect(stageNames).toEqual(['Source', 'BuildImage']); // deploys nothing -- Repo 2 deploys from the image
    expect(stageNames).not.toContain('UpdatePipeline');
    expect(stageNames).not.toContain('dev');
    // Exactly one build project (no per-stage deploy projects).
    t.resourceCountIs('AWS::CodeBuild::Project', 1);
  });

  test('provisions an ECR repo named <application>-deployer and the build logs in, builds and pushes', () => {
    const t = render(cfg(BuildImage.docker()));
    t.hasResourceProperties('AWS::ECR::Repository', { RepositoryName: 'shop-deployer' });
    // The docker build needs a privileged environment.
    t.hasResourceProperties('AWS::CodeBuild::Project', {
      Environment: Match.objectLike({ PrivilegedMode: true }),
    });
    const cmds = buildCommands(t);
    expect(cmds).toContain('aws ecr get-login-password');
    expect(cmds).toContain('docker build -f Dockerfile');
    expect(cmds).toContain('docker push');
    // GIT_SHA is the default: the tag is the resolved source commit, not a static tag.
    expect(cmds).toContain('CODEBUILD_RESOLVED_SOURCE_VERSION');
  });

  test('a custom dockerfile path and LATEST tag strategy are honoured', () => {
    const cmds = buildCommands(
      render(cfg(BuildImage.docker({ dockerfile: 'ci/Dockerfile', tagStrategy: ImageTagStrategy.LATEST }))),
    );
    expect(cmds).toContain('docker build -f ci/Dockerfile');
    expect(cmds).toContain(':latest');
    expect(cmds).not.toContain('CODEBUILD_RESOLVED_SOURCE_VERSION');
  });

  test('an existing repositoryName is REFERENCED, not provisioned (no new ECR resource)', () => {
    const t = render(cfg(BuildImage.docker({ repositoryName: 'existing-repo' })));
    t.resourceCountIs('AWS::ECR::Repository', 0); // referenced by name, not created
    expect(buildCommands(t)).toContain('existing-repo');
  });

  test('a disposable pipeline empties + deletes its provisioned ECR repo', () => {
    const t = render(cfg(BuildImage.docker()), RemovalPolicy.DESTROY);
    // EmptyOnDelete so the delete succeeds even with images pushed; Delete policy so teardown leaves none.
    t.hasResource('AWS::ECR::Repository', {
      DeletionPolicy: 'Delete',
      Properties: Match.objectLike({ EmptyOnDelete: true }),
    });
  });
});
