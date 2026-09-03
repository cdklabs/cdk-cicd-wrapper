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
import { Match, Template } from 'aws-cdk-lib/assertions';
import { defineDeployment } from '../../../src/config/define';
import { Repository } from '../../../src/config/repository';
import { RegionOrder, SynthesizerType } from '../../../src/config/types';
import { DeploymentPipeline } from '../../../src/engine/codepipeline/DeploymentPipeline';

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
      {
        stage: 'prod',
        env: { account: '222222222222', region: 'eu-west-1' },
        deployment: { deployRole: 'arn:aws:iam::222222222222:role/deployer' },
      },
    ],
  });

describe('m6-container: CD DeploymentPipeline (Repo 2)', () => {
  test('renders Source -> Deploy (ungated) -> DeployGated (gated) with a privileged CodeBuild project', () => {
    const t = render(cfg()); // cfg: dev (ungated) + prod (gated)
    const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    expect((pipeline.Properties.Stages as any[]).map((s) => s.Name)).toEqual(['Source', 'Deploy', 'DeployGated']);
    t.hasResourceProperties(
      'AWS::CodeBuild::Project',
      Match.objectLike({ Environment: Match.objectLike({ PrivilegedMode: true }) }),
    );
  });

  test('the deploy buildspec logs in to ECR, materializes creds, and runs cdk-cicd deploy --from-image', () => {
    const t = render(cfg());
    const project = Object.values(t.findResources('AWS::CodeBuild::Project'))[0] as any;
    const spec = JSON.stringify(project.Properties.Source.BuildSpec);
    expect(spec).toContain('docker login');
    expect(spec).toContain('get-login-password');
    // Each action deploys ONE target (its own image version), selected by the TARGET_STAGE env var.
    expect(spec).toContain('cdk-cicd deploy --from-image --target');
    expect(spec).toContain('TARGET_STAGE');
    expect(spec).toContain('npm ci');
    // CodeBuild serves creds via the container-credentials endpoint; they must be materialized to static
    // AWS_* env vars so `deploy --from-image` (which forwards by name) reaches the inner container.
    expect(spec).toContain('export-credentials');
    expect(project.Properties.Environment.PrivilegedMode).toBe(true);
  });

  test('skips an unchanged target and records its fingerprint only after a successful deployment', () => {
    const t = render(cfg());
    const project = Object.values(t.findResources('AWS::CodeBuild::Project'))[0] as any;
    const spec = JSON.stringify(project.Properties.Source.BuildSpec);

    // The fingerprint is target-specific: it loads the selected normalized target, its effective image,
    // and the version field whose stage-local file controls promotion.
    expect(spec).toContain('container-deployment-target-v3');
    expect(spec).toContain('TARGET_STAGE');
    expect(spec).toContain('target.image ?? config.image');
    expect(spec).toContain('.json');
    expect(spec).toContain('version');
    expect(spec).toContain('package.json');
    expect(spec).toContain('package-lock.json');

    // A missing state value means first deployment. Other SSM failures remain fatal rather than silently
    // skipping or redeploying, and an exact match exits before the image is pulled/run.
    expect(spec).toContain('ssm get-parameter');
    expect(spec).toContain('ParameterNotFound');
    expect(spec).toContain('target $TARGET_STAGE is unchanged; skipping deployment');
    expect(spec).toContain('exit 1');

    const deploy = spec.indexOf('cdk-cicd deploy --from-image');
    const record = spec.indexOf('ssm put-parameter');
    expect(deploy).toBeGreaterThan(-1);
    expect(record).toBeGreaterThan(deploy);
    expect(spec).toContain('} && aws ssm put-parameter');

    const policies = JSON.stringify(t.findResources('AWS::IAM::Policy'));
    expect(policies).toContain('ssm:GetParameter');
    expect(policies).toContain('ssm:PutParameter');
    expect(policies).toContain('parameter/cdk-cicd/deployment-state/CdStack/');
  });

  test('the executable deploy-and-record command writes state only after a successful deploy', () => {
    const t = render(cfg());
    const project = Object.values(t.findResources('AWS::CodeBuild::Project'))[0] as any;
    const commands = JSON.parse(project.Properties.Source.BuildSpec).phases.build.commands as string[];
    const deployAndRecord = commands.find((command) => command.includes('} && aws ssm put-parameter'))!;
    expect(deployAndRecord).toBeDefined();

    const cwd = mkdtempSync(path.join(tmpdir(), 'deployment-state-write-'));
    try {
      const bin = path.join(cwd, 'bin');
      mkdirSync(bin);
      const npx = path.join(bin, 'npx');
      const aws = path.join(bin, 'aws');
      writeFileSync(npx, '#!/bin/sh\nprintf "deploy\\n" >> "$TRACE_FILE"\nexit "${DEPLOY_EXIT:-0}"\n');
      writeFileSync(aws, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$TRACE_FILE"\n');
      chmodSync(npx, 0o755);
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
    const deploy = (pipeline.Properties.Stages as any[]).find((stage) => stage.Name === 'Deploy');
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
    const deploy = (pipeline.Properties.Stages as any[]).find((stage) => stage.Name === 'Deploy');
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
    expect(first.EXPECTED_DEPLOYMENT_TOPOLOGY).toMatch(/^[0-9a-f]{64}$/);
    expect(first.EXPECTED_DEPLOYMENT_TOPOLOGY).toBe(second.EXPECTED_DEPLOYMENT_TOPOLOGY);

    const project = Object.values(t.findResources('AWS::CodeBuild::Project'))[0] as any;
    const spec = JSON.stringify(project.Properties.Source.BuildSpec);
    // The current from-image CLI does not consume its outer --region option. Each action instead writes a
    // temporary one-region config and then uses the normal CLI path, which emits the inner --region command.
    expect(spec).toContain('.cdk-cicd-target');
    expect(spec).toContain('regions: [region]');
    expect(spec).toContain('(cd .cdk-cicd-target && ../node_modules/.bin/cdk-cicd deploy --from-image');
    expect(spec).toContain('re-run cdk-cicd deploy-ci to update the pipeline topology');
    expect(spec).not.toContain('--yes --region "$TARGET_REGION"');
  });

  test('embedded fingerprint and parallel-config scripts execute against the current CLI config shape', () => {
    const parallel = defineDeployment({
      application: 'shop',
      qualifier: 'shopqual',
      synthesizer: { type: SynthesizerType.APP_STAGING, appId: 'shop-assets' },
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app',
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
    const project = Object.values(t.findResources('AWS::CodeBuild::Project'))[0] as any;
    const commands = JSON.parse(project.Properties.Source.BuildSpec).phases.build.commands as string[];
    const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    const deploy = (pipeline.Properties.Stages as any[]).find((stage) => stage.Name === 'Deploy');
    const actionEnvironment = Object.fromEntries(
      JSON.parse(deploy.Actions[0].Configuration.EnvironmentVariables).map((entry: any) => [entry.name, entry.value]),
    );
    const extractScript = (command: string): string => {
      const start = command.indexOf("-e '");
      expect(start).toBeGreaterThan(-1);
      const scriptStart = start + 4;
      const end = command.indexOf("'", scriptStart);
      expect(end).toBeGreaterThan(scriptStart);
      return command.slice(scriptStart, end).replace(/'"'"'/g, "'");
    };
    const fingerprintScript = extractScript(commands.find((command) => command.startsWith('TARGET_FINGERPRINT='))!);
    const parallelConfigScript = extractScript(commands.find((command) => command.includes('.cdk-cicd-target'))!);

    const cwd = mkdtempSync(path.join(tmpdir(), 'deployment-pipeline-'));
    try {
      const writeDeploymentConfig = (targets: unknown[], overrides: Record<string, unknown> = {}) =>
        writeFileSync(
          path.join(cwd, 'deploy.config.js'),
          'module.exports = ' +
            JSON.stringify({
              application: parallel.application,
              qualifier: parallel.qualifier,
              synthesizer: parallel.synthesizer,
              image: parallel.image,
              targets,
              ...overrides,
            }),
        );
      writeDeploymentConfig(parallel.targets);
      mkdirSync(path.join(cwd, 'config'));
      writeFileSync(path.join(cwd, 'config', 'dev.json'), JSON.stringify({ version: '1.2.3' }));
      const packageJson = path.join(cwd, 'package.json');
      const packageLock = path.join(cwd, 'package-lock.json');
      writeFileSync(packageJson, JSON.stringify({ dependencies: { '@cdklabs/cdk-cicd-wrapper-cli': '1.0.0' } }));
      writeFileSync(packageLock, JSON.stringify({ lockfileVersion: 3, packages: { '': { version: '1.0.0' } } }));

      const env = {
        ...process.env,
        TARGET_STAGE: 'dev',
        TARGET_REGION: 'eu-west-1',
        EXPECTED_DEPLOYMENT_TOPOLOGY: actionEnvironment.EXPECTED_DEPLOYMENT_TOPOLOGY,
      };
      const runFingerprint = () =>
        spawnSync(process.execPath, ['-e', fingerprintScript], {
          cwd,
          env,
          encoding: 'utf8',
        });
      const fingerprint = runFingerprint();
      expect(fingerprint.status).toBe(0);
      expect(fingerprint.stdout).toMatch(/^[0-9a-f]{64}$/);

      writeFileSync(packageJson, JSON.stringify({ dependencies: { '@cdklabs/cdk-cicd-wrapper-cli': '1.0.1' } }));
      const manifestChanged = runFingerprint();
      expect(manifestChanged.status).toBe(0);
      expect(manifestChanged.stdout).not.toBe(fingerprint.stdout);

      writeFileSync(packageJson, JSON.stringify({ dependencies: { '@cdklabs/cdk-cicd-wrapper-cli': '1.0.0' } }));
      writeFileSync(packageLock, JSON.stringify({ lockfileVersion: 3, packages: { '': { version: '1.0.1' } } }));
      const lockChanged = runFingerprint();
      expect(lockChanged.status).toBe(0);
      expect(lockChanged.stdout).not.toBe(fingerprint.stdout);

      writeDeploymentConfig(parallel.targets, { qualifier: 'changedq' });
      const identityChanged = runFingerprint();
      expect(identityChanged.status).not.toBe(0);
      expect(identityChanged.stderr).toContain('re-run cdk-cicd deploy-ci to update its actions and permissions');
      writeDeploymentConfig(parallel.targets);

      const narrow = spawnSync(process.execPath, ['-e', parallelConfigScript], {
        cwd,
        env,
        encoding: 'utf8',
      });
      expect(narrow.status).toBe(0);
      const generatedSource = readFileSync(path.join(cwd, '.cdk-cicd-target', 'deploy.config.js'), 'utf8');
      const generated = JSON.parse(generatedSource.match(/^module\.exports = (.*);\n$/s)![1]);
      expect(generated.application).toBe('shop');
      expect(generated.qualifier).toBe('shopqual');
      expect(generated.synthesizer).toEqual({
        type: SynthesizerType.APP_STAGING,
        appId: 'shop-assets',
      });
      expect(generated.targets[0].env.regions).toEqual(['eu-west-1']);
      expect(readFileSync(path.join(cwd, '.cdk-cicd-target', 'config', 'dev.json'), 'utf8')).toContain('1.2.3');

      const staleRegion = spawnSync(process.execPath, ['-e', parallelConfigScript], {
        cwd,
        env: { ...env, TARGET_REGION: 'ap-southeast-2' },
        encoding: 'utf8',
      });
      expect(staleRegion.status).not.toBe(0);
      expect(staleRegion.stderr).toContain('no longer defines parallel region ap-southeast-2');

      const staleSequentialActionEnv: NodeJS.ProcessEnv = { ...env };
      delete staleSequentialActionEnv.TARGET_REGION;
      const staleSequentialAction = spawnSync(process.execPath, ['-e', fingerprintScript], {
        cwd,
        env: staleSequentialActionEnv,
        encoding: 'utf8',
      });
      expect(staleSequentialAction.status).not.toBe(0);
      expect(staleSequentialAction.stderr).toContain('now needs parallel region actions');

      writeDeploymentConfig([
        {
          ...parallel.targets[0],
          env: { ...parallel.targets[0].env, regions: [...parallel.targets[0].env.regions, 'ap-southeast-2'] },
        },
      ]);
      const addedParallelRegion = spawnSync(process.execPath, ['-e', fingerprintScript], {
        cwd,
        env,
        encoding: 'utf8',
      });
      expect(addedParallelRegion.status).not.toBe(0);
      expect(addedParallelRegion.stderr).toContain('re-run cdk-cicd deploy-ci');

      writeDeploymentConfig([
        ...parallel.targets,
        {
          stage: 'prod',
          env: { regions: ['eu-west-1'], regionOrder: RegionOrder.SEQUENTIAL },
          manualApproval: true,
        },
      ]);
      const addedTarget = spawnSync(process.execPath, ['-e', fingerprintScript], {
        cwd,
        env,
        encoding: 'utf8',
      });
      expect(addedTarget.status).not.toBe(0);
      expect(addedTarget.stderr).toContain('re-run cdk-cicd deploy-ci');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
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
    const gated = (pipeline.Properties.Stages as any[]).find((stage) => stage.Name === 'DeployGated');
    const actions = gated.Actions as any[];

    expect(actions.map((action) => action.Name)).toEqual([
      'Approve-prod',
      'Deploy-prod-eu-west-1',
      'Deploy-prod-us-east-1',
    ]);
    expect(actions[0].RunOrder).toBe(1);
    expect(actions.slice(1).map((action) => action.RunOrder)).toEqual([2, 2]);
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
          image: '222222222222.dkr.ecr.us-east-2.amazonaws.com/platform/prod/deployer@sha256:abcdef',
        },
      ],
    });
    const policies = JSON.stringify(render(perRepository).findResources('AWS::IAM::Policy'));
    const devRepository = ':ecr:eu-west-1:111111111111:repository/team/apps/deployer';
    const prodRepository = ':ecr:us-east-2:222222222222:repository/platform/prod/deployer';

    expect(policies).toContain('ecr:GetAuthorizationToken');
    expect(policies).toContain('ecr:BatchCheckLayerAvailability');
    expect(policies).toContain('ecr:BatchGetImage');
    expect(policies).toContain('ecr:GetDownloadUrlForLayer');
    expect(policies).toContain(devRepository);
    expect(policies).toContain(prodRepository);
    expect(policies.split(devRepository)).toHaveLength(2);
    expect(policies).not.toContain('repository/team/apps/deployer:dev-42');
    expect(policies).not.toContain('repository/platform/prod/deployer@sha256');
  });

  test('grants sts:AssumeRole on the CDK bootstrap roles for each target account/region', () => {
    const policies = JSON.stringify(render(cfg()).findResources('AWS::IAM::Policy'));
    // bootstrap deploy + publishing roles for the dev target (111111111111 / eu-west-1)
    expect(policies).toContain('role/cdk-hnb659fds-deploy-role-111111111111-eu-west-1');
    expect(policies).toContain('role/cdk-hnb659fds-file-publishing-role-111111111111-eu-west-1');
  });

  test('uses the deployer qualifier and app-staging identity for target asset-role grants', () => {
    const appStaging = defineDeployment({
      application: 'Payments-Service',
      qualifier: 'payqual',
      synthesizer: { type: SynthesizerType.APP_STAGING, appId: 'Payments Assets' },
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: [{ stage: 'dev', env: { account: '111111111111', region: 'eu-west-1' } }],
    });
    const policies = JSON.stringify(render(appStaging).findResources('AWS::IAM::Policy'));

    expect(policies).toContain('role/cdk-payqual-deploy-role-111111111111-eu-west-1');
    expect(policies).toContain('role/cdk-payments-assets-file-role-eu-west-1');
    expect(policies).toContain('role/cdk-payments-assets-image-role-eu-west-1');
  });

  test('grants sts:AssumeRole for any forced target deploy roles', () => {
    const t = render(cfg());
    // the prod target's deployRole must be assumable by the deploy project role. CDK renders a single
    // Resource as a string (not a 1-element array), so assert on the serialized policies robustly.
    const policies = JSON.stringify(t.findResources('AWS::IAM::Policy'));
    expect(policies).toContain('sts:AssumeRole');
    expect(policies).toContain('arn:aws:iam::222222222222:role/deployer');
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

  test('ungated targets deploy in the parallel Deploy stage; gated ones in DeployGated behind an approval', () => {
    const t = render(cfg()); // dev (ungated), prod (gated)
    const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    const stage = (n: string) => (pipeline.Properties.Stages as any[]).find((s) => s.Name === n);
    // dev (ungated) is in Deploy, NOT blocked by prod's approval.
    expect((stage('Deploy').Actions as any[]).map((a) => a.Name)).toEqual(['Deploy-dev']);
    // prod (gated) is in DeployGated: approve (runOrder 1) then deploy (runOrder 2).
    const gated = stage('DeployGated');
    const byName = (n: string) => (gated.Actions as any[]).find((a) => a.Name === n);
    // The native approval necessarily queues before CodeBuild can perform its fingerprint check. An
    // unchanged gated target therefore still needs approval, after which Deploy-prod exits as a no-op.
    expect(byName('Approve-prod').RunOrder).toBe(1);
    expect(byName('Deploy-prod').RunOrder).toBe(2);
    // each deploy action selects its target via TARGET_STAGE
    expect(JSON.stringify(byName('Deploy-prod').Configuration.EnvironmentVariables)).toContain('prod');
  });

  test('two gated targets deploy in parallel in DeployGated (int + prod, each approved)', () => {
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
    expect(names).toEqual(['Source', 'DeployGated']); // no ungated -> no Deploy stage
    const gated = (pipeline.Properties.Stages as any[]).find((s) => s.Name === 'DeployGated');
    const deploys = (gated.Actions as any[]).filter((a) => a.Name.startsWith('Deploy-'));
    // both gated deploys share runOrder 2 -> they run in parallel after their approvals
    expect(deploys.map((a) => a.RunOrder)).toEqual([2, 2]);
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
          image: '222222222222.dkr.ecr.us-east-2.amazonaws.com/app:prod-7',
        },
      ],
    });
    const project = Object.values(render(perTarget).findResources('AWS::CodeBuild::Project'))[0] as any;
    const spec = JSON.stringify(project.Properties.Source.BuildSpec);
    // both distinct registries get a docker login, each in its own region
    expect(spec).toContain('111111111111.dkr.ecr.eu-west-1.amazonaws.com');
    expect(spec).toContain('222222222222.dkr.ecr.us-east-2.amazonaws.com');
    expect(spec).toContain('--region eu-west-1');
    expect(spec).toContain('--region us-east-2');
  });

  test('a npmRegistry config writes a scoped .npmrc before npm ci and grants secret read', () => {
    const withRegistry = defineDeployment({
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/my-app-deployer:1.2.3',
      repository: Repository.codecommit('my-deploy-config'),
      npmRegistry: { url: 'https://npm.example.com/', basicAuthSecretArn: 'arn:npm-secret', scope: 'cdklabs' },
      targets: [{ stage: 'dev', env: { account: '111111111111', region: 'eu-west-1' } }],
    });
    const t = render(withRegistry);
    const project = Object.values(t.findResources('AWS::CodeBuild::Project'))[0] as any;
    const spec = JSON.stringify(project.Properties.Source.BuildSpec);
    expect(spec).toContain('@cdklabs:registry=https://npm.example.com/');
    expect(spec).toContain('//npm.example.com/:_authToken=$NPM_AUTH_TOKEN');
    const policies = JSON.stringify(t.findResources('AWS::IAM::Policy'));
    expect(policies).toContain('secretsmanager:GetSecretValue');
    expect(policies).toContain('arn:npm-secret');
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
