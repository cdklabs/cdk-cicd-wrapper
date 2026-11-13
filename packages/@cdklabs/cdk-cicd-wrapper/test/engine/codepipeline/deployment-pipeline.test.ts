// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Container mode (Repo 2): the CD pipeline consumes the pushed image and deploys each target -- Source
// (the config repo) -> Deploy (one privileged CodeBuild that ECR-logs-in and runs deploy --from-image).

import { spawnSync } from 'child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { App, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import { defineDeployment } from '../../../src/config/define';
import { Repository } from '../../../src/config/repository';
import { RegionOrder, SynthesizerType } from '../../../src/config/types';
import { deploymentPipelineShapeFingerprint } from '../../../src/engine/codepipeline/deployment-shape';
import { DeploymentPipeline } from '../../../src/engine/codepipeline/DeploymentPipeline';

function deploymentStack(
  config: ReturnType<typeof defineDeployment>,
  removalPolicy?: RemovalPolicy,
  buildImage?: string,
): Stack {
  const stack = new Stack(new App(), 'CdStack', { env: { account: '111111111111', region: 'eu-west-1' } });
  new DeploymentPipeline(stack, 'Cd', { config, removalPolicy, buildImage });
  return stack;
}

function render(
  config: ReturnType<typeof defineDeployment>,
  removalPolicy?: RemovalPolicy,
  buildImage?: string,
): Template {
  return Template.fromStack(deploymentStack(config, removalPolicy, buildImage));
}

const cfg = () =>
  defineDeployment({
    image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/my-app-deployer:1.2.3',
    repository: Repository.codecommit('my-deploy-config'),
    targets: [
      { stage: 'dev', env: { account: '111111111111', region: 'eu-west-1' } },
      {
        stage: 'prod',
        env: { account: '222222222222', region: 'eu-west-1' },
        deployment: { deployRole: 'arn:aws:iam::222222222222:role/deployer' },
      },
    ],
  });

/** The privileged CodeBuild project behind every deploy action. */
function deployProject(t: Template): any {
  return Object.values(t.findResources('AWS::CodeBuild::Project')).find(
    (project: any) => project.Properties.Environment.PrivilegedMode === true,
  );
}

/** The unprivileged CodeBuild project behind the Plan action. */
function planProject(t: Template): any {
  return Object.values(t.findResources('AWS::CodeBuild::Project')).find(
    (project: any) => project.Properties.Environment.PrivilegedMode !== true,
  );
}

/** A CodeBuild project's environment variables, by name. */
function projectEnvironment(project: any): Record<string, string> {
  return Object.fromEntries(
    (project.Properties.Environment.EnvironmentVariables as any[]).map((entry) => [entry.Name, entry.Value]),
  );
}

/** The main (Git-triggered) CD pipeline: the one with the Plan stage. */
function mainPipeline(t: Template): any {
  return (Object.values(t.findResources('AWS::CodePipeline::Pipeline')) as any[]).find((pipeline) =>
    (pipeline.Properties.Stages as any[]).some((stage) => stage.Name === 'Plan'),
  );
}

describe('m6-container: CD DeploymentPipeline (Repo 2)', () => {
  test('renders Source followed by ordered deployment waves', () => {
    const t = render(cfg()); // cfg: dev (ungated) + prod (gated)
    const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    expect((pipeline.Properties.Stages as any[]).map((s) => s.Name)).toEqual([
      'Source',
      'Plan',
      'Deploy-1',
      'Deploy-2',
    ]);
    t.hasResourceProperties(
      'AWS::CodeBuild::Project',
      Match.objectLike({ Environment: Match.objectLike({ PrivilegedMode: true }) }),
    );
  });

  test('the deploy buildspec logs in to ECR and runs cdk-cicd deploy --from-image without exporting keys', () => {
    const t = render(cfg());
    const project = deployProject(t);
    const spec = JSON.stringify(project.Properties.Source.BuildSpec);
    expect(spec).toContain('docker login');
    expect(spec).toContain('get-login-password');
    // Each action deploys ONE target (its own image version), selected by the TARGET_STAGE env var.
    expect(spec.match(/npm run cdk-cicd -- deploy --from-image --target/g)).toHaveLength(1);
    expect(spec).not.toContain('npx cdk-cicd');
    expect(spec).toContain('TARGET_STAGE');
    expect(spec).toContain('npm ci');
    // The deployer container reaches the role through the container-credentials endpoint, so no access
    // key is ever written into the build's shell environment.
    expect(spec).not.toContain('export-credentials');
    expect(spec).not.toContain('AWS_SECRET_ACCESS_KEY');
    expect(spec).not.toContain('169.254.170.2');
    // No generated program in the buildspec: the CLI owns the fingerprint and region narrowing.
    expect(spec).not.toContain('node -r ts-node');
    expect(spec).not.toContain("-e '");
    expect(project.Properties.Environment.PrivilegedMode).toBe(true);
  });

  test('skips an unchanged target and records its fingerprint only after a successful deployment', () => {
    const t = render(cfg());
    const project = deployProject(t);
    const spec = JSON.stringify(project.Properties.Source.BuildSpec);

    // The CLI computes the selected target's fingerprint; the pipeline configuration it checks against
    // lives on the project, not in the logged command.
    const commandText = (JSON.parse(project.Properties.Source.BuildSpec).phases.build.commands as string[]).join('\n');
    expect(commandText).toContain('npm run --silent cdk-cicd -- pipeline fingerprint --target "$TARGET_STAGE"');
    expect(projectEnvironment(project).EXPECTED_DEPLOYMENT_TOPOLOGY).toMatch(/^[0-9a-f]{64}$/);

    // A missing state value means first deployment. Other SSM failures remain fatal rather than silently
    // skipping or redeploying, and an exact match exits before the image is pulled/run.
    expect(spec).toContain('ssm get-parameter');
    expect(spec).toContain('ParameterNotFound');
    expect(spec).toContain('target $TARGET_STAGE is unchanged; skipping deployment');
    expect(spec).toContain('exit 1');

    const deploy = spec.indexOf('cdk-cicd -- deploy --from-image');
    const record = spec.indexOf('ssm put-parameter');
    expect(deploy).toBeGreaterThan(-1);
    expect(record).toBeGreaterThan(deploy);
    // State is recorded only after the deploy loop exits successfully.
    expect(spec).toMatch(/done\\+naws ssm put-parameter/);

    const policies = JSON.stringify(t.findResources('AWS::IAM::Policy'));
    expect(policies).toContain('ssm:GetParameter');
    expect(policies).toContain('ssm:PutParameter');
    expect(policies).toContain('parameter/cdk-cicd/deployment-state/CdStack/');
  });

  test('grants the deploy project pull access and Plan only image describe access, per repository', () => {
    const t = render(cfg());
    const commands = JSON.parse(deployProject(t).Properties.Source.BuildSpec).phases.build.commands as string[];
    const fingerprintIndex = commands.findIndex((command) => command.includes('TARGET_FINGERPRINT=$('));
    const stateReadIndex = commands.findIndex((command) => command.includes('ssm get-parameter'));
    expect(fingerprintIndex).toBeGreaterThan(-1);
    expect(fingerprintIndex).toBeLessThan(stateReadIndex);

    const policies = Object.values(t.findResources('AWS::IAM::Policy')) as any[];
    const statements = policies.flatMap((policy) => policy.Properties.PolicyDocument.Statement as any[]);
    const statementActions = (statement: any): string[] =>
      Array.isArray(statement.Action) ? statement.Action : [statement.Action];
    const pull = statements.find((statement) => statementActions(statement).includes('ecr:BatchGetImage'));
    expect(statementActions(pull)).toEqual(
      expect.arrayContaining([
        'ecr:BatchCheckLayerAvailability',
        'ecr:BatchGetImage',
        'ecr:DescribeImages',
        'ecr:GetDownloadUrlForLayer',
      ]),
    );
    expect(JSON.stringify(pull.Resource)).toContain(':ecr:eu-west-1:111111111111:repository/my-app-deployer');
    expect(pull.Resource).not.toContain('*');
    const describeOnly = statements.find(
      (statement) => statementActions(statement).length === 1 && statement.Action === 'ecr:DescribeImages',
    );
    expect(JSON.stringify(describeOnly.Resource)).toContain(':ecr:eu-west-1:111111111111:repository/my-app-deployer');
    const authorizationStatement = statements.find((statement) =>
      statementActions(statement).includes('ecr:GetAuthorizationToken'),
    );
    expect(authorizationStatement.Resource).toBe('*');
    expect(statementActions(authorizationStatement)).not.toContain('ecr:DescribeImages');
  });

  test('adds no ECR permissions for a non-ECR image', () => {
    const nonEcr = defineDeployment({
      image: 'registry.example.com/team/app:base',
      repository: Repository.codecommit('cfg'),
      targets: [{ stage: 'dev', env: { account: '111111111111', region: 'eu-west-1' }, manualApproval: false }],
    });
    expect(JSON.stringify(render(nonEcr).findResources('AWS::IAM::Policy'))).not.toContain('ecr:DescribeImages');
  });

  test('the executable deploy-and-record command writes state only after a successful deploy', () => {
    const t = render(cfg());
    const project = deployProject(t);
    const commands = JSON.parse(project.Properties.Source.BuildSpec).phases.build.commands as string[];
    const deployAndRecord = commands.find((command) => command.includes('done\naws ssm put-parameter'))!;
    expect(deployAndRecord).toBeDefined();

    const cwd = mkdtempSync(path.join(tmpdir(), 'deployment-state-write-'));
    try {
      const bin = path.join(cwd, 'bin');
      mkdirSync(bin);
      const fakeCdkCicd = path.join(bin, 'fake-cdk-cicd');
      const aws = path.join(bin, 'aws');
      writeFileSync(
        path.join(cwd, 'package.json'),
        JSON.stringify({ private: true, scripts: { 'cdk-cicd': './bin/fake-cdk-cicd' } }),
      );
      writeFileSync(fakeCdkCicd, '#!/bin/sh\nprintf "deploy\\n" >> "$TRACE_FILE"\nexit "${DEPLOY_EXIT:-0}"\n');
      writeFileSync(aws, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$TRACE_FILE"\n');
      chmodSync(fakeCdkCicd, 0o755);
      chmodSync(aws, 0o755);

      const run = (deployExit: number, traceFile: string) =>
        spawnSync('/bin/sh', ['-c', deployAndRecord], {
          cwd,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH ?? ''}`,
            DEPLOY_EXIT: String(deployExit),
            TARGET_STAGE: 'dev',
            TARGET_STATE_PARAMETER: '/cdk-cicd/test/dev',
            TARGET_FINGERPRINT: 'a'.repeat(64),
            TRACE_FILE: traceFile,
          },
        });

      const failedTrace = path.join(cwd, 'failed.trace');
      const failed = run(7, failedTrace);
      expect(failed.status).toBe(7);
      expect(readFileSync(failedTrace, 'utf8')).toBe('deploy\n');

      const successfulTrace = path.join(cwd, 'successful.trace');
      const successful = run(0, successfulTrace);
      expect(successful.status).toBe(0);
      expect(readFileSync(successfulTrace, 'utf8')).toContain('ssm put-parameter');

      // A concurrent update of the same stack (the autoDeploy pipeline racing the main one) is retried;
      // the first attempt fails with an *_IN_PROGRESS error and the second succeeds.
      writeFileSync(path.join(bin, 'sleep'), '#!/bin/sh\nprintf "sleep %s\\n" "$1" >> "$TRACE_FILE"\n');
      chmodSync(path.join(bin, 'sleep'), 0o755);
      writeFileSync(
        fakeCdkCicd,
        '#!/bin/sh\nprintf "deploy\\n" >> "$TRACE_FILE"\n' +
          'if [ ! -f "$TRACE_FILE.once" ]; then touch "$TRACE_FILE.once"; ' +
          'echo "Stack app is in UPDATE_IN_PROGRESS state and can not be updated"; exit 1; fi\nexit 0\n',
      );
      const retriedTrace = path.join(cwd, 'retried.trace');
      const retried = run(0, retriedTrace);
      expect(retried.status).toBe(0);
      expect(readFileSync(retriedTrace, 'utf8')).toMatch(/^deploy\nsleep 60\ndeploy\n.*ssm put-parameter/s);

      // The same race can surface as CDK's shared change set having been replaced by the other deploy.
      writeFileSync(
        fakeCdkCicd,
        '#!/bin/sh\nprintf "deploy\\n" >> "$TRACE_FILE"\n' +
          'if [ ! -f "$TRACE_FILE.once" ]; then touch "$TRACE_FILE.once"; ' +
          'echo "ChangeSet [arn:aws:cloudformation:eu-west-1:111111111111:changeSet/cdk-deploy-change-set/x] does not exist"; ' +
          'exit 1; fi\nexit 0\n',
      );
      const changeSetTrace = path.join(cwd, 'changeset.trace');
      const changeSetRetried = run(0, changeSetTrace);
      expect(changeSetRetried.status).toBe(0);
      expect(readFileSync(changeSetTrace, 'utf8')).toMatch(/^deploy\nsleep 60\ndeploy\n.*ssm put-parameter/s);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('assigns each target a distinct stable SSM state parameter', () => {
    const pipeline = Object.values(render(cfg()).findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    const deployActions = (pipeline.Properties.Stages as any[])
      .flatMap((stage) => stage.Actions as any[])
      .filter((action) => action.Name.startsWith('Deploy-'));
    const parameterFor = (actionName: string) => {
      const action = deployActions.find((candidate) => candidate.Name === actionName);
      const environment = JSON.parse(action.Configuration.EnvironmentVariables);
      return environment.find((entry: any) => entry.name === 'TARGET_STATE_PARAMETER').value;
    };

    const dev = parameterFor('Deploy-dev');
    const prod = parameterFor('Deploy-prod');
    expect(dev).toContain('/cdk-cicd/deployment-state/CdStack/');
    expect(prod).toContain('/cdk-cicd/deployment-state/CdStack/');
    expect(dev).not.toEqual(prod);
  });

  test('keeps a sequential multi-region target in one action with no region override', () => {
    const sequential = defineDeployment({
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: [
        {
          stage: 'dev',
          env: {
            account: '111111111111',
            regions: ['eu-west-1', 'us-east-1'],
            regionOrder: RegionOrder.SEQUENTIAL,
          },
        },
      ],
    });
    const pipeline = Object.values(render(sequential).findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    const deploy = (pipeline.Properties.Stages as any[]).find((stage) => stage.Name === 'Deploy-1');
    expect((deploy.Actions as any[]).map((action) => action.Name)).toEqual(['Deploy-dev']);

    const environment = JSON.parse(deploy.Actions[0].Configuration.EnvironmentVariables);
    expect(environment.find((entry: any) => entry.name === 'TARGET_REGION')).toBeUndefined();
  });

  test('fans out a parallel multi-region target into independent same-stage actions', () => {
    const parallel = defineDeployment({
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: [
        {
          stage: 'dev',
          env: {
            account: '111111111111',
            regions: ['eu-west-1', 'us-east-1'],
            regionOrder: RegionOrder.PARALLEL,
          },
        },
      ],
    });
    const t = render(parallel);
    const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    const deploy = (pipeline.Properties.Stages as any[]).find((stage) => stage.Name === 'Deploy-1');
    const actions = deploy.Actions as any[];
    expect(actions.map((action) => action.Name)).toEqual(['Deploy-dev-eu-west-1', 'Deploy-dev-us-east-1']);
    expect(actions.map((action) => action.RunOrder ?? 1)).toEqual([1, 1]);

    const environmentFor = (action: any) =>
      Object.fromEntries(
        JSON.parse(action.Configuration.EnvironmentVariables).map((entry: any) => [entry.name, entry.value]),
      );
    const first = environmentFor(actions[0]);
    const second = environmentFor(actions[1]);
    expect(first.TARGET_REGION).toBe('eu-west-1');
    expect(second.TARGET_REGION).toBe('us-east-1');
    expect(first.TARGET_STATE_PARAMETER).not.toEqual(second.TARGET_STATE_PARAMETER);

    const project = deployProject(t);
    const commandText = (JSON.parse(project.Properties.Source.BuildSpec).phases.build.commands as string[]).join('\n');
    // A parallel action passes its Region to the CLI, which deploys just that Region of the target.
    expect(commandText).toContain(
      'deploy --from-image --target "$TARGET_STAGE" ${TARGET_REGION:+--region "$TARGET_REGION"} --yes',
    );
    expect(commandText).not.toContain('.cdk-cicd-target');
  });

  test('uses one approval before all parallel region actions for a gated target', () => {
    const gatedParallel = defineDeployment({
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: [
        {
          stage: 'prod',
          env: {
            account: '111111111111',
            regions: ['eu-west-1', 'us-east-1'],
            regionOrder: RegionOrder.PARALLEL,
          },
          manualApproval: true,
        },
      ],
    });
    const pipeline = Object.values(render(gatedParallel).findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    const gated = (pipeline.Properties.Stages as any[]).find((stage) => stage.Name === 'Deploy-1');
    const actions = gated.Actions as any[];

    expect(actions.map((action) => action.Name)).toEqual([
      'Approve-prod',
      'Deploy-prod-eu-west-1',
      'Deploy-prod-us-east-1',
    ]);
    expect(actions[0].RunOrder).toBe(1);
    expect(actions.slice(1).map((action) => action.RunOrder)).toEqual([2, 2]);
  });

  test("logs in to the image's own ECR region rather than the pipeline region", () => {
    const crossRegion = defineDeployment({
      image: '111111111111.dkr.ecr.us-east-2.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: [{ stage: 'dev', env: { account: '111111111111', region: 'eu-west-1' } }],
    });
    const t = render(crossRegion);
    const project = deployProject(t);
    const spec = JSON.stringify(project.Properties.Source.BuildSpec);
    expect(spec).toContain('111111111111.dkr.ecr.us-east-2.amazonaws.com');
    expect(spec).toContain('--region us-east-2');
  });

  test('grants ECR authorization and repository-scoped pull permissions for each distinct image repository', () => {
    const perRepository = defineDeployment({
      repository: Repository.codecommit('cfg'),
      targets: [
        {
          stage: 'dev',
          image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/team/apps/deployer:dev-42',
        },
        {
          stage: 'res',
          // Same repository with another tag must not duplicate the IAM resource.
          image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/team/apps/deployer:res-42',
        },
        {
          stage: 'prod',
          image: '111111111111.dkr.ecr.us-east-2.amazonaws.com/platform/prod/deployer@sha256:abcdef',
        },
      ],
    });
    const policies = JSON.stringify(render(perRepository).findResources('AWS::IAM::Policy'));
    const devRepository = ':ecr:eu-west-1:111111111111:repository/team/apps/deployer';
    const prodRepository = ':ecr:us-east-2:111111111111:repository/platform/prod/deployer';

    expect(policies).toContain('ecr:GetAuthorizationToken');
    expect(policies).toContain('ecr:BatchCheckLayerAvailability');
    expect(policies).toContain('ecr:BatchGetImage');
    expect(policies).toContain('ecr:GetDownloadUrlForLayer');
    expect(policies).toContain(devRepository);
    expect(policies).toContain(prodRepository);
    // Once in the deploy project's pull grant and once in Plan's describe-only grant.
    expect(policies.split(devRepository)).toHaveLength(3);
    expect(policies).not.toContain('repository/team/apps/deployer:dev-42');
    expect(policies).not.toContain('repository/platform/prod/deployer@sha256');
  });

  test('rejects cross-account ECR images unless the owner-side repository policy is acknowledged', () => {
    const crossAccount = defineDeployment({
      image: '999999999999.dkr.ecr.us-east-2.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: [{ stage: 'dev', env: { account: '111111111111', region: 'eu-west-1' } }],
    });

    expect(() => render(crossAccount)).toThrow(/crossAccountEcrRepositoryPolicyConfigured: true/);
  });

  test('rejects cross-partition or malformed ECR registry hosts', () => {
    const deploymentWithImage = (image: string) =>
      defineDeployment({
        image,
        repository: Repository.codecommit('cfg'),
        targets: [{ stage: 'dev', env: { account: '111111111111', region: 'eu-west-1' } }],
      });

    expect(() => render(deploymentWithImage('111111111111.dkr.ecr.us-iso-east-1.c2s.ic.gov/app:1'))).toThrow(
      /ECR authentication and IAM cannot cross AWS partitions/,
    );
    expect(() => render(deploymentWithImage('111111111111.dkr.ecr.eu-west-1.evil.example/app:1'))).toThrow(
      /registry suffix 'evil\.example'.*requires 'amazonaws\.com'/,
    );
    expect(() => render(deploymentWithImage('111111111111.dkr.ecr.us-isof-south-1.csp.hci.ic.gov/app:1'))).toThrow(
      /partition\/domain suffix is not known/,
    );
  });

  test('allows acknowledged cross-account ECR images with identity grants and an owner-policy warning', () => {
    const crossAccount = defineDeployment({
      image: '999999999999.dkr.ecr.us-east-2.amazonaws.com/platform/deployer:1',
      repository: Repository.codecommit('cfg'),
      crossAccountEcrRepositoryPolicyConfigured: true,
      targets: [{ stage: 'dev', env: { account: '111111111111', region: 'eu-west-1' } }],
    });
    const stack = deploymentStack(crossAccount);
    const policies = JSON.stringify(Template.fromStack(stack).findResources('AWS::IAM::Policy'));

    expect(policies).toContain('ecr:BatchCheckLayerAvailability');
    expect(policies).toContain(':ecr:us-east-2:999999999999:repository/platform/deployer');
    expect(
      Annotations.fromStack(stack).findWarning(
        '*',
        Match.stringLikeRegexp('identity-side pull permissions only.*owner-account repository policy'),
      ),
    ).toHaveLength(1);
  });

  test('uses CodeBuild credentials for managed build images and repository grants for private ECR images', () => {
    const managedProject = Object.values(
      render(cfg(), undefined, 'aws/codebuild/standard:7.0').findResources('AWS::CodeBuild::Project'),
    )[0] as any;
    expect(managedProject.Properties.Environment.ImagePullCredentialsType).toBe('CODEBUILD');

    const privateImage = '111111111111.dkr.ecr.eu-west-1.amazonaws.com/build/deployer@sha256:abcdef';
    const privateTemplate = render(cfg(), undefined, privateImage);
    const privateProject = deployProject(privateTemplate);
    expect(privateProject.Properties.Environment.ImagePullCredentialsType).toBe('SERVICE_ROLE');
    expect(JSON.stringify(privateProject.Properties.Environment.Image)).toContain('build/deployer@sha256:abcdef');
    expect(JSON.stringify(privateTemplate.findResources('AWS::IAM::Policy'))).toContain(
      ':ecr:eu-west-1:111111111111:repository/build/deployer',
    );
  });

  test('requires an ECR build image to be in the Repo 2 pipeline region', () => {
    expect(() => render(cfg(), undefined, '111111111111.dkr.ecr.us-west-2.amazonaws.com/build/deployer:1')).toThrow(
      /CodeBuild custom ECR images must be in the same region/,
    );
  });

  test('allows a same-region cross-account ECR build image only after owner-policy acknowledgement', () => {
    const image = '999999999999.dkr.ecr.eu-west-1.amazonaws.com/build/deployer:1';
    expect(() => render(cfg(), undefined, image)).toThrow(/crossAccountEcrRepositoryPolicyConfigured: true/);

    const acknowledged = defineDeployment({
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      crossAccountEcrRepositoryPolicyConfigured: true,
      targets: [{ stage: 'dev', env: { account: '111111111111', region: 'eu-west-1' } }],
    });
    const stack = deploymentStack(acknowledged, undefined, image);
    const template = Template.fromStack(stack);
    const project = deployProject(template);
    expect(project.Properties.Environment.ImagePullCredentialsType).toBe('SERVICE_ROLE');
    expect(JSON.stringify(template.findResources('AWS::IAM::Policy'))).toContain(
      ':ecr:eu-west-1:999999999999:repository/build/deployer',
    );
  });

  test('grants sts:AssumeRole on the CDK bootstrap roles for each target account/region', () => {
    const policies = JSON.stringify(render(cfg()).findResources('AWS::IAM::Policy'));
    // bootstrap deploy + publishing roles for the dev target (111111111111 / eu-west-1)
    expect(policies).toContain('role/cdk-hnb659fds-deploy-role-111111111111-eu-west-1');
    expect(policies).toContain('role/cdk-hnb659fds-file-publishing-role-111111111111-eu-west-1');
  });

  test('resolves environment-agnostic targets to the concrete pipeline account and region for IAM', () => {
    const environmentAgnostic = defineDeployment({
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: [{ stage: 'dev' }],
    });
    const policies = JSON.stringify(render(environmentAgnostic).findResources('AWS::IAM::Policy'));

    expect(policies).toContain('role/cdk-hnb659fds-deploy-role-111111111111-eu-west-1');
    expect(policies).toContain(':ssm:eu-west-1:111111111111:parameter/cdk-bootstrap/hnb659fds/version');
  });

  test('fails early when an environment-agnostic target cannot resolve the pipeline account or region', () => {
    const unresolvedAccountStack = new Stack(new App(), 'UnresolvedAccount');
    const noEnvironment = defineDeployment({
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: [{ stage: 'dev' }],
    });
    expect(() => new DeploymentPipeline(unresolvedAccountStack, 'Cd', { config: noEnvironment })).toThrow(
      /pipeline stack's account is unresolved/,
    );

    const unresolvedRegionStack = new Stack(new App(), 'UnresolvedRegion');
    const accountOnly = defineDeployment({
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: [{ stage: 'dev', env: { account: '111111111111' } }],
    });
    expect(() => new DeploymentPipeline(unresolvedRegionStack, 'Cd', { config: accountOnly })).toThrow(
      /pipeline stack's region is unresolved/,
    );
  });

  test('rejects deployment targets in a different or unknown AWS partition', () => {
    const targetInChina = defineDeployment({
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: [{ stage: 'china', env: { account: '222222222222', region: 'cn-north-1' } }],
    });
    expect(() => render(targetInChina)).toThrow(/partition 'aws-cn'.*Repo 2 pipeline is in 'aws'/);

    const unknownTargetRegion = defineDeployment({
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: [{ stage: 'future', env: { account: '222222222222', region: 'moon-north-1' } }],
    });
    expect(() => render(unknownTargetRegion)).toThrow(/AWS partition is not known/);
  });

  test('treats a missing legacy synthesizer as the default synthesizer', () => {
    const legacy = {
      ...defineDeployment({
        image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1',
        repository: Repository.codecommit('cfg'),
        targets: [{ stage: 'dev', env: { account: '111111111111', region: 'eu-west-1' } }],
      }),
      synthesizer: undefined,
    };
    const template = render(legacy);
    const policies = JSON.stringify(template.findResources('AWS::IAM::Policy'));
    const project = deployProject(template);

    expect(policies).toContain('role/cdk-hnb659fds-deploy-role-111111111111-eu-west-1');
    expect(policies).not.toContain('-file-role-eu-west-1');
    expect(projectEnvironment(project).EXPECTED_DEPLOYMENT_TOPOLOGY).toMatch(/^[0-9a-f]{64}$/);
  });

  test('rejects APP_STAGING because its bootstrapless support stack bypasses the deployment role', () => {
    const appStaging = defineDeployment({
      application: 'payments',
      synthesizer: { type: SynthesizerType.APP_STAGING },
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: [{ stage: 'prod', env: { account: '111111111111', region: 'eu-west-1' } }],
    });

    expect(() => render(appStaging)).toThrow(
      /DefaultStagingStack with BootstraplessSynthesizer.*CodeBuild project's base credentials/,
    );
  });

  test('grants sts:AssumeRole for any forced target deploy roles', () => {
    const t = render(cfg());
    // the prod target's deployRole must be assumable by the deploy project role. CDK renders a single
    // Resource as a string (not a 1-element array), so assert on the serialized policies robustly.
    const policies = JSON.stringify(t.findResources('AWS::IAM::Policy'));
    expect(policies).toContain('sts:AssumeRole');
    expect(policies).toContain('arn:aws:iam::222222222222:role/deployer');
  });

  test('specializes forced deploy-role placeholders for every target region', () => {
    const roleArn =
      'arn:${AWS::Partition}:iam::${AWS::AccountId}:role/cdk-${Qualifier}-deployer-${AWS::AccountId}-${AWS::Region}';
    const config = defineDeployment({
      qualifier: 'shopq',
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: [
        {
          stage: 'prod',
          env: {
            account: '222222222222',
            regions: ['eu-west-1', 'us-east-1'],
            regionOrder: RegionOrder.SEQUENTIAL,
          },
          deployment: { deployRole: roleArn },
        },
      ],
    });

    const policies = JSON.stringify(render(config).findResources('AWS::IAM::Policy'));
    expect(policies).toContain('arn:aws:iam::222222222222:role/cdk-shopq-deployer-222222222222-eu-west-1');
    expect(policies).toContain('arn:aws:iam::222222222222:role/cdk-shopq-deployer-222222222222-us-east-1');
    expect(policies).not.toContain('${Qualifier}');
    expect(policies).not.toContain('${AWS::AccountId}');
    expect(policies).not.toContain('${AWS::Region}');
    expect(policies).not.toContain('${AWS::Partition}');
  });

  test('pipeline role comparisons canonicalize placeholder and concrete ARNs', () => {
    const placeholderConfig = defineDeployment({
      qualifier: 'shopq',
      image: 'example.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: [
        {
          stage: 'prod',
          env: { account: '222222222222', region: 'eu-west-1' },
          deployment: {
            deployRole: 'arn:${AWS::Partition}:iam::${AWS::AccountId}:role/cdk-${Qualifier}-deployer-${AWS::Region}',
            cfnExecutionRole:
              'arn:${AWS::Partition}:iam::${AWS::AccountId}:role/cdk-${Qualifier}-cfn-exec-${AWS::Region}',
          },
        },
      ],
    });
    const concreteConfig = defineDeployment({
      qualifier: 'shopq',
      image: 'example.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: [
        {
          stage: 'prod',
          env: { account: '222222222222', region: 'eu-west-1' },
          deployment: {
            deployRole: 'arn:aws:iam::222222222222:role/cdk-shopq-deployer-eu-west-1',
            cfnExecutionRole: 'arn:aws:iam::222222222222:role/cdk-shopq-cfn-exec-eu-west-1',
          },
        },
      ],
    });
    const expectedTopology = (template: Template): string =>
      projectEnvironment(deployProject(template)).EXPECTED_DEPLOYMENT_TOPOLOGY;

    const placeholderTemplate = render(placeholderConfig);
    const expected = expectedTopology(placeholderTemplate);
    expect(expected).toBe(expectedTopology(render(concreteConfig)));
  });

  test('leaves custom CloudFormation execution-role passing to the assumed deployment role', () => {
    const cfnExecutionRole = 'arn:aws:iam::111111111111:role/cfn-execution';
    const withExecutionRole = defineDeployment({
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: [
        {
          stage: 'dev',
          env: { account: '111111111111', region: 'eu-west-1' },
          deployment: {
            deployRole: 'arn:aws:iam::111111111111:role/deployer',
            cfnExecutionRole,
          },
        },
      ],
    });
    const policies = Object.values(render(withExecutionRole).findResources('AWS::IAM::Policy')) as any[];
    const statements = policies.flatMap((policy) => policy.Properties.PolicyDocument.Statement as any[]);
    expect(JSON.stringify(statements)).not.toContain(cfnExecutionRole);
  });

  test('grants Secrets Manager read for effective target ExternalId references only', () => {
    const externalIdSecret = 'arn:aws:secretsmanager:us-east-1:222222222222:secret:repo2-external';
    const ignoredSecret = 'arn:aws:secretsmanager:us-east-1:222222222222:secret:ignored-without-role';
    const withExternalIds = defineDeployment({
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: [
        {
          stage: 'dev',
          deployment: {
            deployRole: 'arn:aws:iam::222222222222:role/deployer',
            cfnExecutionRole: 'arn:aws:iam::222222222222:role/cfn-exec',
            externalId: `resolve:secretsmanager:${externalIdSecret}`,
          },
        },
        {
          stage: 'res',
          deployment: {
            deployRole: 'arn:aws:iam::222222222222:role/res-deployer',
            externalId: 'literal-external-id',
          },
        },
        {
          stage: 'prod',
          deployment: { externalId: `resolve:secretsmanager:${ignoredSecret}` },
        },
      ],
    });

    const policies = JSON.stringify(render(withExternalIds).findResources('AWS::IAM::Policy'));
    expect(policies).toContain('secretsmanager:GetSecretValue');
    expect(policies).toContain(externalIdSecret);
    expect(policies).not.toContain(ignoredSecret);
    expect(policies).not.toContain('literal-external-id');
  });

  test('a disposable pipeline empties/destroys its own artifact bucket', () => {
    const t = render(cfg(), RemovalPolicy.DESTROY);
    t.hasResource('AWS::S3::Bucket', Match.objectLike({ DeletionPolicy: 'Delete' }));
  });

  test('throws when the deployment config has no repository (nothing to source from)', () => {
    const noRepo = defineDeployment({ image: 'img:1', targets: [{ stage: 'dev' }] });
    expect(() => render(noRepo)).toThrow(/needs a `repository`/);
  });

  test('an ungated wave stays before the following gated target', () => {
    const t = render(cfg()); // dev (ungated), prod (gated)
    const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    const stage = (n: string) => (pipeline.Properties.Stages as any[]).find((s) => s.Name === n);
    expect((stage('Deploy-1').Actions as any[]).map((a) => a.Name)).toEqual(['Deploy-dev']);
    const gated = stage('Deploy-2');
    const byName = (n: string) => (gated.Actions as any[]).find((a) => a.Name === n);
    // The native approval necessarily queues before CodeBuild can perform its fingerprint check. An
    // unchanged gated target therefore still needs approval, after which Deploy-prod exits as a no-op.
    expect(byName('Approve-prod').RunOrder).toBe(1);
    expect(byName('Deploy-prod').RunOrder).toBe(2);
    // each deploy action selects its target via TARGET_STAGE
    expect(JSON.stringify(byName('Deploy-prod').Configuration.EnvironmentVariables)).toContain('prod');
  });

  test('a gated-first target blocks the contiguous ungated wave declared after it', () => {
    const gatedFirst = defineDeployment({
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: [
        {
          stage: 'prod',
          env: { account: '111111111111', region: 'eu-west-1' },
          manualApproval: true,
        },
        {
          stage: 'smoke',
          env: { account: '111111111111', region: 'eu-west-1' },
          manualApproval: false,
        },
        {
          stage: 'verify',
          env: { account: '111111111111', region: 'eu-west-1' },
          manualApproval: false,
        },
      ],
    });
    const pipeline = Object.values(render(gatedFirst).findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    const stages = pipeline.Properties.Stages as any[];

    expect(stages.map((stage) => stage.Name)).toEqual(['Source', 'Plan', 'Deploy-1', 'Deploy-2']);
    expect(stages[2].Actions.map((action: any) => [action.Name, action.RunOrder])).toEqual([
      ['Approve-prod', 1],
      ['Deploy-prod', 2],
    ]);
    expect(stages[3].Actions.map((action: any) => action.Name)).toEqual(['Deploy-smoke', 'Deploy-verify']);
  });

  test('interleaved gates preserve target order and split only contiguous ungated waves', () => {
    const interleaved = defineDeployment({
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: [
        { stage: 'dev', env: { account: '111111111111', region: 'eu-west-1' }, manualApproval: false },
        { stage: 'qa', env: { account: '111111111111', region: 'eu-west-1' }, manualApproval: false },
        { stage: 'preprod', env: { account: '111111111111', region: 'eu-west-1' }, manualApproval: true },
        { stage: 'smoke', env: { account: '111111111111', region: 'eu-west-1' }, manualApproval: false },
        { stage: 'canary', env: { account: '111111111111', region: 'eu-west-1' }, manualApproval: false },
        { stage: 'prod', env: { account: '111111111111', region: 'eu-west-1' }, manualApproval: true },
        { stage: 'verify', env: { account: '111111111111', region: 'eu-west-1' }, manualApproval: false },
      ],
    });
    const pipeline = Object.values(render(interleaved).findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    const stages = pipeline.Properties.Stages as any[];

    expect(stages.map((stage) => stage.Name)).toEqual([
      'Source',
      'Plan',
      'Deploy-1',
      'Deploy-2',
      'Deploy-3',
      'Deploy-4',
      'Deploy-5',
    ]);
    expect(stages.slice(2).map((stage) => stage.Actions.map((action: any) => action.Name))).toEqual([
      ['Deploy-dev', 'Deploy-qa'],
      ['Approve-preprod', 'Deploy-preprod'],
      ['Deploy-smoke', 'Deploy-canary'],
      ['Approve-prod', 'Deploy-prod'],
      ['Deploy-verify'],
    ]);
  });

  test('two gated targets get independent approval/deploy pairs in declared order', () => {
    const twoGated = defineDeployment({
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: [
        { stage: 'int', env: { account: '111111111111', region: 'eu-west-1' }, manualApproval: true },
        { stage: 'prod', env: { account: '111111111111', region: 'eu-west-1' }, manualApproval: true },
      ],
    });
    const pipeline = Object.values(render(twoGated).findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    const names = (pipeline.Properties.Stages as any[]).map((s) => s.Name);
    expect(names).toEqual(['Source', 'Plan', 'Deploy-1', 'Deploy-2']);

    const pairedActions = (stageName: string) =>
      (pipeline.Properties.Stages as any[]).find((stage) => stage.Name === stageName).Actions as any[];
    expect(pairedActions('Deploy-1').map((action) => [action.Name, action.RunOrder])).toEqual([
      ['Approve-int', 1],
      ['Deploy-int', 2],
    ]);
    expect(pairedActions('Deploy-2').map((action) => [action.Name, action.RunOrder])).toEqual([
      ['Approve-prod', 1],
      ['Deploy-prod', 2],
    ]);
  });

  test('distinct per-target image registries are each logged in to', () => {
    const perTarget = defineDeployment({
      repository: Repository.codecommit('cfg'),
      targets: [
        {
          stage: 'dev',
          env: { account: '111111111111', region: 'eu-west-1' },
          image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:dev-42',
        },
        {
          stage: 'prod',
          env: { account: '222222222222', region: 'us-east-1' },
          image: '111111111111.dkr.ecr.us-east-2.amazonaws.com/app:prod-7',
        },
      ],
    });
    const project = deployProject(render(perTarget));
    const spec = JSON.stringify(project.Properties.Source.BuildSpec);
    // both distinct registries get a docker login, each in its own region
    expect(spec).toContain('111111111111.dkr.ecr.eu-west-1.amazonaws.com');
    expect(spec).toContain('111111111111.dkr.ecr.us-east-2.amazonaws.com');
    expect(spec).toContain('--region eu-west-1');
    expect(spec).toContain('--region us-east-2');
  });

  test('a npmRegistry config uses a temporary npmrc, cleans it, and grants secret/KMS access', () => {
    const encryptionKeyArn = 'arn:aws:kms:eu-west-1:111111111111:key/EXAMPLE_NOT_A_SECRET';
    const withRegistry = defineDeployment({
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/my-app-deployer:1.2.3',
      repository: Repository.codecommit('my-deploy-config'),
      npmRegistry: {
        url: 'https://npm.example.com/',
        basicAuthSecretArn: 'arn:npm-secret',
        encryptionKeyArn,
        scope: 'cdklabs',
      },
      targets: [{ stage: 'dev', env: { account: '111111111111', region: 'eu-west-1' } }],
    });
    const t = render(withRegistry);
    const project = deployProject(t);
    const buildSpec = JSON.parse(project.Properties.Source.BuildSpec);
    const spec = JSON.stringify(buildSpec);
    expect(spec).toContain('/tmp/cdk-cicd-npmrc');
    expect(spec).toContain('@cdklabs:registry=https://npm.example.com/');
    expect(spec).toContain('//npm.example.com/:_authToken=$NPM_AUTH_TOKEN');
    expect(
      (buildSpec.phases.build.commands as string[]).some((c) => c.includes('\nrm -f "$NPM_CONFIG_USERCONFIG"\n')),
    ).toBe(true);
    expect(buildSpec.phases.build.finally).toContain('rm -f "$NPM_CONFIG_USERCONFIG"');
    expect(spec).not.toContain('> ./.npmrc');
    const policies = JSON.stringify(t.findResources('AWS::IAM::Policy'));
    expect(policies).toContain('secretsmanager:GetSecretValue');
    expect(policies).toContain('arn:npm-secret');
    expect(policies).toContain('kms:Decrypt');
    expect(policies).toContain(encryptionKeyArn);
  });

  test('rejects a rendered stage that would exceed the 100-action CodePipeline quota', () => {
    const tooManyRegions = defineDeployment({
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: [
        {
          stage: 'prod',
          env: {
            account: '111111111111',
            regions: Array.from({ length: 100 }, (_, index) => `test-region-${index}`),
            regionOrder: RegionOrder.PARALLEL,
          },
          manualApproval: true,
        },
      ],
    });

    expect(() => render(tooManyRegions)).toThrow(/stage 'Deploy-1' would contain 101 actions.*100-action/);
  });

  test('rejects topologies that exceed total action or stage quotas', () => {
    const tooManyActions = defineDeployment({
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: Array.from({ length: 20 }, (_, targetIndex) => ({
        stage: `stage-${targetIndex}`,
        env: {
          account: '111111111111',
          regions: Array.from({ length: 50 }, (_unused, regionIndex) => `test-${targetIndex}-${regionIndex}`),
          regionOrder: RegionOrder.PARALLEL,
        },
        manualApproval: true,
      })),
    });
    // Source, Plan, and one approval + 50 region actions for each of the 20 gated targets.
    expect(() => render(tooManyActions)).toThrow(/would contain 1022 actions.*1000-action/);

    const tooManyStages = defineDeployment({
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: Array.from({ length: 50 }, (_, index) => ({
        stage: `stage-${index}`,
        env: { account: '111111111111', region: 'eu-west-1' },
        manualApproval: true,
      })),
    });
    expect(() => render(tooManyStages)).toThrow(/would contain 52 stages.*50-stage/);
  });

  test('rejects generated CodePipeline names that exceed the 100-character identifier limit', () => {
    const longStage = defineDeployment({
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: [
        {
          stage: 'a'.repeat(95),
          env: { account: '111111111111', region: 'eu-west-1' },
          manualApproval: true,
        },
      ],
    });

    expect(() => render(longStage)).toThrow(/generated CodePipeline action name.*1-100 characters/);
  });

  test('rejects duplicate generated actions in the shared ungated stage', () => {
    const collision = defineDeployment({
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: [
        {
          stage: 'dev-eu-west-1',
          env: { account: '111111111111', region: 'eu-west-1' },
          manualApproval: false,
        },
        {
          stage: 'dev',
          env: {
            account: '111111111111',
            regions: ['eu-west-1', 'us-east-1'],
            regionOrder: RegionOrder.PARALLEL,
          },
          manualApproval: false,
        },
      ],
    });

    expect(() => render(collision)).toThrow(/duplicate action name 'Deploy-dev-eu-west-1'/);
  });

  test('rejects duplicate target stage names (they would collide on action names)', () => {
    const dup = defineDeployment({
      image: 'i:1',
      repository: Repository.codecommit('cfg'),
      targets: [{ stage: 'dev' }, { stage: 'dev' }],
    });
    expect(() => render(dup)).toThrow(/duplicate deploy.config target stage 'dev'/);
  });
});

describe('Repo 2 autoDeploy targets', () => {
  const autoCfg = (overrides: { image?: string; account?: string } = {}) =>
    defineDeployment({
      image: overrides.image ?? '111111111111.dkr.ecr.eu-west-1.amazonaws.com/my-app-deployer',
      repository: Repository.codecommit('my-deploy-config'),
      // Get past the cross-account pull acknowledgement so the autoDeploy check itself is exercised.
      crossAccountEcrRepositoryPolicyConfigured: true,
      targets: [
        { stage: 'dev', env: { account: overrides.account ?? '111111111111', region: 'eu-west-1' }, autoDeploy: true },
        { stage: 'prod', env: { account: '111111111111', region: 'eu-west-1' }, manualApproval: true },
      ],
    });

  test('renders a second, push-triggered pipeline that deploys only the autoDeploy target', () => {
    const t = render(autoCfg());
    const pipelines = Object.values(t.findResources('AWS::CodePipeline::Pipeline')) as any[];
    expect(pipelines).toHaveLength(2);
    const auto = pipelines.find((p) => p !== mainPipeline(t));
    expect(auto).toBeDefined();
    expect((auto.Properties.Stages as any[]).map((s) => s.Name)).toEqual(['Source', 'Deploy-dev']);
    const autoActions = (auto.Properties.Stages as any[]).flatMap((s) => s.Actions);
    expect(autoActions.map((a: any) => a.Name)).not.toContain('Approve-prod');
    expect(autoActions.map((a: any) => a.Name)).not.toContain('Deploy-prod');
    // The config-repo checkout must not start this pipeline on commits (the main pipeline does that).
    expect(autoActions[0].Configuration.PollForSourceChanges).toBe(false);
    // Still one deploy project (plus Plan) and one created CodeCommit repository.
    t.resourceCountIs('AWS::CodeBuild::Project', 2);
    t.resourceCountIs('AWS::CodeCommit::Repository', 1);
    t.hasResourceProperties('AWS::Events::Rule', {
      EventPattern: {
        source: ['aws.ecr'],
        'detail-type': ['ECR Image Action'],
        detail: { 'action-type': ['PUSH'], result: ['SUCCESS'], 'repository-name': ['my-app-deployer'] },
      },
    });
  });

  // Runs buildspec entries the way CodeBuild does: each entry is its own script, shell variables carry
  // over to the next entry, a non-zero exit fails the build, and `exit 0` ends only that one entry.
  const runLikeCodeBuild = (entries: string[], cwd: string, env: Record<string, string>) => {
    let vars: Record<string, string> = { ...(process.env as Record<string, string>), ...env };
    const dump = path.join(cwd, 'env.dump');
    for (const entry of entries) {
      rmSync(dump, { force: true });
      const r = spawnSync('/bin/sh', ['-c', `set -a\n${entry}\nenv > "${dump}"`], { cwd, encoding: 'utf8', env: vars });
      if (r.status !== 0) return r.status;
      try {
        vars = Object.fromEntries(
          readFileSync(dump, 'utf8')
            .split('\n')
            .filter((line) => line.includes('='))
            .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
        );
      } catch {
        // The entry ended with `exit 0` before the dump: CodeBuild keeps going with the previous variables.
      }
    }
    return 0;
  };

  const fakeTools = (cwd: string, previousFingerprint: string) => {
    const bin = path.join(cwd, 'bin');
    mkdirSync(bin);
    const trace = '#!/bin/sh\nprintf "%s %s\\n" "$(basename "$0")" "$*" >> "$TRACE_FILE"\n';
    writeFileSync(
      path.join(bin, 'aws'),
      trace +
        'case "$*" in\n' +
        '  *get-pipeline-execution*) echo "$FAKE_TRIGGER" ;;\n' +
        `  *"ssm get-parameter"*) echo "${previousFingerprint}" ;;\n` +
        'esac\n',
    );
    for (const tool of ['npm', 'docker', 'node', 'curl', 'jq']) writeFileSync(path.join(bin, tool), trace);
    for (const tool of ['aws', 'npm', 'docker', 'node', 'curl', 'jq']) chmodSync(path.join(bin, tool), 0o755);
    return bin;
  };

  test("an autoDeploy pipeline's creation run really skips every later buildspec entry", () => {
    const t = render(autoCfg());
    const project = deployProject(t);
    const commands = JSON.parse(project.Properties.Source.BuildSpec).phases.build.commands as string[];
    expect(commands[0]).toContain('skipping the creation run');
    expect(commands.join('\n')).not.toMatch(/skipping[^\n]*\n?[^\n]*exit 0/);

    const cwd = mkdtempSync(path.join(tmpdir(), 'deployment-skip-creation-'));
    try {
      const bin = fakeTools(cwd, '');
      const traceFile = path.join(cwd, 'trace');
      const base = {
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        TRACE_FILE: traceFile,
        TARGET_STAGE: 'dev',
        AUTO_DEPLOY: '1',
        CODEBUILD_INITIATOR: 'codepipeline/auto-dev',
        PIPELINE_EXECUTION_ID: 'exec-1',
      };
      expect(runLikeCodeBuild(commands, cwd, { ...base, FAKE_TRIGGER: 'CreatePipeline' })).toBe(0);
      const skipped = readFileSync(traceFile, 'utf8');
      expect(skipped).toContain('get-pipeline-execution');
      expect(skipped).not.toMatch(/^(npm|docker) /m);
      expect(skipped).not.toContain('put-parameter');

      // Any other trigger (the ECR push) goes on to install and deploy.
      rmSync(traceFile);
      runLikeCodeBuild(commands, cwd, { ...base, FAKE_TRIGGER: 'CloudWatchEvent' });
      expect(readFileSync(traceFile, 'utf8')).toMatch(/^npm ci/m);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('an unchanged target really skips the image pull, deploy and state write', () => {
    const t = render(cfg());
    const project = deployProject(t);
    const commands = JSON.parse(project.Properties.Source.BuildSpec).phases.build.commands as string[];
    // Start at the state read: the fingerprint itself is covered by the executable fingerprint tests.
    const from = commands.findIndex((command) => command.includes('ssm get-parameter'));
    expect(from).toBeGreaterThan(-1);

    const fingerprint = 'a'.repeat(64);
    const cwd = mkdtempSync(path.join(tmpdir(), 'deployment-skip-unchanged-'));
    try {
      const bin = fakeTools(cwd, fingerprint);
      const traceFile = path.join(cwd, 'trace');
      const env = {
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        TRACE_FILE: traceFile,
        TARGET_STAGE: 'dev',
        TARGET_STATE_PARAMETER: '/cdk-cicd/test/dev',
        TARGET_FINGERPRINT: fingerprint,
      };
      expect(runLikeCodeBuild(commands.slice(from), cwd, env)).toBe(0);
      const trace = readFileSync(traceFile, 'utf8');
      expect(trace).toContain('ssm get-parameter');
      expect(trace).not.toMatch(/^(npm|docker) /m);
      expect(trace).not.toContain('put-parameter');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('no autoDeploy target renders no extra pipeline or rule', () => {
    const t = render(cfg());
    t.resourceCountIs('AWS::CodePipeline::Pipeline', 1);
    // The CodeCommit source has its own rule; there must be no ECR push rule.
    expect(
      Object.keys(t.findResources('AWS::Events::Rule', { Properties: { EventPattern: { source: ['aws.ecr'] } } })),
    ).toHaveLength(0);
  });

  test('an ECR repository in another account or Region is refused', () => {
    expect(() => render(autoCfg({ image: '222222222222.dkr.ecr.eu-west-1.amazonaws.com/x' }))).toThrow(
      /own concrete account and Region/,
    );
    expect(() => render(autoCfg({ image: '111111111111.dkr.ecr.us-east-1.amazonaws.com/x' }))).toThrow(
      /own concrete account and Region/,
    );
  });

  test('a non-ECR image is refused', () => {
    expect(() => render(autoCfg({ image: 'docker.io/library/app:1' }))).toThrow(/needs an ECR deployer image/);
  });
});

describe('Repo 2 Plan stage skips unchanged targets', () => {
  const threeTargets = (prodAlwaysApprove = false) =>
    defineDeployment({
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/my-app-deployer:1.2.3',
      repository: Repository.codecommit('my-deploy-config'),
      targets: [
        { stage: 'dev', env: { account: '111111111111', region: 'eu-west-1' } },
        { stage: 'int', env: { account: '111111111111', region: 'eu-west-1' }, manualApproval: true },
        {
          stage: 'prod',
          env: { account: '222222222222', region: 'eu-west-1' },
          manualApproval: true,
          ...(prodAlwaysApprove ? { alwaysApprove: true } : {}),
        },
      ],
    });
  const stages = (t: Template) => mainPipeline(t).Properties.Stages as any[];
  const actionEnvironment = (action: any) =>
    Object.fromEntries(
      JSON.parse(action.Configuration.EnvironmentVariables).map((entry: any) => [entry.name, entry.value]),
    );

  test('renders an unprivileged Plan build after Source that exports one variable per deployment stage', () => {
    const t = render(threeTargets());
    expect(stages(t).map((stage) => stage.Name)).toEqual(['Source', 'Plan', 'Deploy-1', 'Deploy-2', 'Deploy-3']);
    const plan = stages(t)[1].Actions[0];
    expect(plan.ActionTypeId.Provider).toBe('CodeBuild');
    expect(plan.Namespace).toBe('Plan');

    const project = planProject(t);
    expect(project.Properties.Environment.PrivilegedMode).toBe(false);
    const spec = JSON.parse(project.Properties.Source.BuildSpec);
    expect(spec.env['exported-variables']).toEqual(['CDK_CICD_RUN_1', 'CDK_CICD_RUN_2', 'CDK_CICD_RUN_3']);
    const commands = spec.phases.build.commands as string[];
    expect(commands.indexOf('npm ci')).toBeLessThan(
      commands.findIndex((command) => command.includes('cdk-cicd -- pipeline plan --out')),
    );
    expect(JSON.stringify(spec)).not.toContain("-e '");

    // Plan checks exactly the units the deploy actions record state for.
    const plans = JSON.parse(projectEnvironment(project).CDK_CICD_PLAN);
    expect(plans.map((entry: any) => [entry.variable, entry.stage])).toEqual([
      ['CDK_CICD_RUN_1', 'Deploy-1'],
      ['CDK_CICD_RUN_2', 'Deploy-2'],
      ['CDK_CICD_RUN_3', 'Deploy-3'],
    ]);
    const deployActions = stages(t)
      .flatMap((stage) => stage.Actions as any[])
      .filter((action) => action.Name.startsWith('Deploy-'));
    for (const action of deployActions) {
      const environment = actionEnvironment(action);
      const unit = plans.flatMap((entry: any) => entry.units).find((u: any) => u.target === environment.TARGET_STAGE);
      expect(unit.parameter).toBe(environment.TARGET_STATE_PARAMETER);
    }
    expect(projectEnvironment(project).EXPECTED_DEPLOYMENT_TOPOLOGY).toBe(
      projectEnvironment(deployProject(t)).EXPECTED_DEPLOYMENT_TOPOLOGY,
    );
  });

  test('every deployment stage, approval included, is entered only when Plan found a change', () => {
    const t = render(threeTargets());
    stages(t)
      .filter((stage) => stage.Name.startsWith('Deploy-'))
      .forEach((stage, index) => {
        expect(stage.BeforeEntry).toEqual({
          Conditions: [
            {
              Result: 'SKIP',
              Rules: [
                expect.objectContaining({
                  Name: `Changed-${stage.Name}`,
                  RuleTypeId: expect.objectContaining({ Category: 'Rule', Owner: 'AWS', Provider: 'VariableCheck' }),
                  Configuration: {
                    Variable: `#{Plan.CDK_CICD_RUN_${index + 1}}`,
                    Value: 'true',
                    Operator: 'EQ',
                  },
                }),
              ],
            },
          ],
        });
      });
    // The gated stage keeps its approval: a changed target still needs a human.
    expect(stages(t)[3].Actions.map((action: any) => action.Name)).toEqual(['Approve-int', 'Deploy-int']);
    expect(mainPipeline(t).Properties.PipelineType).toBe('V2');
  });

  test('alwaysApprove keeps a target gated on every run and changes the pipeline shape', () => {
    const always = render(threeTargets(true));
    const prod = stages(always).find((stage) => stage.Name === 'Deploy-3');
    expect(prod.BeforeEntry).toBeUndefined();
    expect(prod.Actions.map((action: any) => action.Name)).toEqual(['Approve-prod', 'Deploy-prod']);
    expect(stages(always).find((stage) => stage.Name === 'Deploy-2').BeforeEntry).toBeDefined();

    const topology = (t: Template) => projectEnvironment(deployProject(t)).EXPECTED_DEPLOYMENT_TOPOLOGY;
    expect(topology(always)).not.toBe(topology(render(threeTargets())));
  });

  test('both builds carry the shape hash and environments the CLI recomputes at run time', () => {
    const config = threeTargets();
    const t = render(config);
    for (const project of [deployProject(t), planProject(t)]) {
      const environment = projectEnvironment(project);
      const targetEnvironments = JSON.parse(environment.CDK_CICD_TARGET_ENVIRONMENTS);
      expect(targetEnvironments).toEqual({
        dev: { account: '111111111111', regions: ['eu-west-1'] },
        int: { account: '111111111111', regions: ['eu-west-1'] },
        prod: { account: '222222222222', regions: ['eu-west-1'] },
      });
      expect(environment.CDK_CICD_QUALIFIER).toBe('hnb659fds');
      expect(environment.CDK_CICD_PARTITION).toBe('aws');
      // `cdk-cicd pipeline` calls this same exported function on the checked-out deploy.config.
      expect(environment.EXPECTED_DEPLOYMENT_TOPOLOGY).toBe(
        deploymentPipelineShapeFingerprint(config, targetEnvironments, 'aws', 'hnb659fds'),
      );
    }
  });

  test('Plan reads deployment state but can neither write it nor assume deployment roles', () => {
    const t = render(threeTargets());
    const roleId = planProject(t).Properties.ServiceRole['Fn::GetAtt'][0];
    const planStatements = (Object.values(t.findResources('AWS::IAM::Policy')) as any[])
      .filter((policy) => JSON.stringify(policy.Properties.Roles) === JSON.stringify([{ Ref: roleId }]))
      .flatMap((policy) => policy.Properties.PolicyDocument.Statement as any[]);
    const actionsOf = (statement: any): string[] => [statement.Action].flat();
    const allActions = planStatements.flatMap(actionsOf);
    expect(allActions).toContain('ssm:GetParameter');
    expect(allActions).toContain('ecr:DescribeImages');
    expect(allActions).not.toContain('ssm:PutParameter');
    expect(allActions).not.toContain('sts:AssumeRole');
    expect(allActions).not.toContain('ecr:BatchGetImage');
    const ssm = planStatements.find((statement) => actionsOf(statement).includes('ssm:GetParameter'));
    expect(JSON.stringify(ssm.Resource)).toContain('parameter/cdk-cicd/deployment-state/CdStack/');
  });

  test('the Plan buildspec exports only well-formed stage decisions', () => {
    const commands = JSON.parse(planProject(render(threeTargets())).Properties.Source.BuildSpec).phases.build
      .commands as string[];
    const validate = commands.find((command) => command.includes('malformed plan output'))!;
    const load = commands.find((command) => command.startsWith('set -a;'))!;
    const cwd = mkdtempSync(path.join(tmpdir(), 'deployment-plan-output-'));
    try {
      const output = path.join(cwd, 'plan.env');
      const run = (contents: string) => {
        writeFileSync(output, contents);
        const script = [validate, load, 'printf "%s,%s" "$CDK_CICD_RUN_1" "$CDK_CICD_RUN_2"']
          .join('\n')
          .split('/tmp/cdk-cicd-plan.env')
          .join(output);
        return spawnSync('/bin/sh', ['-c', script], { encoding: 'utf8' });
      };
      const good = run('CDK_CICD_RUN_1=true\nCDK_CICD_RUN_2=false\n');
      expect(good.status).toBe(0);
      expect(good.stdout).toBe('true,false');

      for (const bad of ['CDK_CICD_RUN_1=yes\n', 'PATH=/tmp\n', 'CDK_CICD_RUN_1=true; touch x\n']) {
        const rejected = run(bad);
        expect(rejected.status).toBe(1);
        expect(rejected.stderr).toContain('malformed plan output');
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
