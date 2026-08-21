// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Container mode (Repo 2): the CD pipeline consumes the pushed image and deploys each target -- Source
// (the config repo) -> Deploy (one privileged CodeBuild that ECR-logs-in and runs deploy --from-image).

import { App, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { defineDeployment } from '../../../../src/v3/config/define';
import { Repository } from '../../../../src/v3/config/repository';
import { DeploymentPipeline } from '../../../../src/v3/engine/codepipeline/DeploymentPipeline';

function render(config: ReturnType<typeof defineDeployment>, removalPolicy?: RemovalPolicy): Template {
  const stack = new Stack(new App(), 'CdStack', { env: { account: '111111111111', region: 'eu-west-1' } });
  new DeploymentPipeline(stack, 'Cd', { config, removalPolicy });
  return Template.fromStack(stack);
}

const cfg = () =>
  defineDeployment({
    image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/my-app-deployer:1.2.3',
    repository: Repository.codecommit('my-deploy-config'),
    targets: [
      { stage: 'dev', env: { account: '111111111111', region: 'eu-west-1' } },
      { stage: 'prod', env: { account: '222222222222', region: 'eu-west-1' }, deployment: { deployRole: 'arn:aws:iam::222222222222:role/deployer' } },
    ],
  });

describe('m6-container: CD DeploymentPipeline (Repo 2)', () => {
  test('renders Source -> Deploy with a privileged CodeBuild deploy project', () => {
    const t = render(cfg());
    const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    expect((pipeline.Properties.Stages as any[]).map((s) => s.Name)).toEqual(['Source', 'Deploy']);
    t.hasResourceProperties('AWS::CodeBuild::Project', Match.objectLike({ Environment: Match.objectLike({ PrivilegedMode: true }) }));
  });

  test('the deploy buildspec logs in to ECR, materializes creds, and runs cdk-cicd deploy --from-image', () => {
    const t = render(cfg());
    const project = Object.values(t.findResources('AWS::CodeBuild::Project'))[0] as any;
    const spec = JSON.stringify(project.Properties.Source.BuildSpec);
    expect(spec).toContain('docker login');
    expect(spec).toContain('get-login-password');
    expect(spec).toContain('cdk-cicd deploy --from-image --yes');
    expect(spec).toContain('npm ci');
    // CodeBuild serves creds via the container-credentials endpoint; they must be materialized to static
    // AWS_* env vars so `deploy --from-image` (which forwards by name) reaches the inner container.
    expect(spec).toContain('export-credentials');
    expect(project.Properties.Environment.PrivilegedMode).toBe(true);
  });

  test("logs in to the image's OWN ECR registry/region, not the pipeline account", () => {
    // image in account 999999999999 / us-east-2, pipeline in 111111111111 / eu-west-1
    const crossAccount = defineDeployment({
      image: '999999999999.dkr.ecr.us-east-2.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: [{ stage: 'dev', env: { account: '111111111111', region: 'eu-west-1' } }],
    });
    const t = render(crossAccount);
    const project = Object.values(t.findResources('AWS::CodeBuild::Project'))[0] as any;
    const spec = JSON.stringify(project.Properties.Source.BuildSpec);
    expect(spec).toContain('999999999999.dkr.ecr.us-east-2.amazonaws.com');
    expect(spec).toContain('--region us-east-2');
  });

  test('grants sts:AssumeRole on the CDK bootstrap roles for each target account/region', () => {
    const policies = JSON.stringify(render(cfg()).findResources('AWS::IAM::Policy'));
    // bootstrap deploy + publishing roles for the dev target (111111111111 / eu-west-1)
    expect(policies).toContain('role/cdk-hnb659fds-deploy-role-111111111111-eu-west-1');
    expect(policies).toContain('role/cdk-hnb659fds-file-publishing-role-111111111111-eu-west-1');
  });

  test('grants sts:AssumeRole for any forced target deploy roles', () => {
    const t = render(cfg());
    // the prod target's deployRole must be assumable by the deploy project role. CDK renders a single
    // Resource as a string (not a 1-element array), so assert on the serialized policies robustly.
    const policies = JSON.stringify(t.findResources('AWS::IAM::Policy'));
    expect(policies).toContain('sts:AssumeRole');
    expect(policies).toContain('arn:aws:iam::222222222222:role/deployer');
  });

  test('a disposable pipeline empties/destroys its own artifact bucket', () => {
    const t = render(cfg(), RemovalPolicy.DESTROY);
    t.hasResource('AWS::S3::Bucket', Match.objectLike({ DeletionPolicy: 'Delete' }));
  });

  test('throws when the deployment config has no repository (nothing to source from)', () => {
    const noRepo = defineDeployment({ image: 'img:1', targets: [{ stage: 'dev' }] });
    expect(() => render(noRepo)).toThrow(/needs a `repository`/);
  });
});
