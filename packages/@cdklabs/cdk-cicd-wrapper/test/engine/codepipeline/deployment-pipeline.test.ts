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

function extractEmbeddedNodeScript(command: string): string {
  const start = command.indexOf("-e '");
  if (start < 0) throw new Error(`missing embedded Node script in command: ${command}`);
  const scriptStart = start + 4;
  const end = command.indexOf("'", scriptStart);
  if (end <= scriptStart) throw new Error(`unterminated embedded Node script in command: ${command}`);
  return command.slice(scriptStart, end).replace(/'"'"'/g, "'");
}

describe('m6-container: CD DeploymentPipeline (Repo 2)', () => {
  test('renders Source followed by ordered deployment waves', () => {
    const t = render(cfg()); // cfg: dev (ungated) + prod (gated)
    const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    expect((pipeline.Properties.Stages as any[]).map((s) => s.Name)).toEqual(['Source', 'Deploy-1', 'Deploy-2']);
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

  test('resolves mutable ECR tags before the skip comparison with repository-scoped IAM', () => {
    const t = render(cfg());
    const project = Object.values(t.findResources('AWS::CodeBuild::Project'))[0] as any;
    const commands = JSON.parse(project.Properties.Source.BuildSpec).phases.build.commands as string[];
    const fingerprintIndex = commands.findIndex((command) => command.startsWith('TARGET_FINGERPRINT='));
    const stateReadIndex = commands.findIndex((command) => command.includes('ssm get-parameter'));

    expect(fingerprintIndex).toBeGreaterThan(-1);
    expect(commands[fingerprintIndex]).toContain('describe-images');
    expect(commands[fingerprintIndex]).toContain('imageDetails[0].imageDigest');
    expect(commands[fingerprintIndex]).toContain('--registry-id');
    expect(commands[fingerprintIndex]).toContain('registryHost');
    expect(fingerprintIndex).toBeLessThan(stateReadIndex);

    const policies = Object.values(t.findResources('AWS::IAM::Policy')) as any[];
    const statements = policies.flatMap((policy) => policy.Properties.PolicyDocument.Statement as any[]);
    const statementActions = (statement: any): string[] =>
      Array.isArray(statement.Action) ? statement.Action : [statement.Action];
    const describeStatement = statements.find((statement) =>
      statementActions(statement).includes('ecr:DescribeImages'),
    );
    const describeResources = Array.isArray(describeStatement.Resource)
      ? describeStatement.Resource
      : [describeStatement.Resource];

    expect(statementActions(describeStatement)).toEqual(
      expect.arrayContaining([
        'ecr:BatchCheckLayerAvailability',
        'ecr:BatchGetImage',
        'ecr:DescribeImages',
        'ecr:GetDownloadUrlForLayer',
      ]),
    );
    expect(describeResources).toHaveLength(1);
    expect(JSON.stringify(describeResources)).toContain(':ecr:eu-west-1:111111111111:repository/my-app-deployer');
    expect(describeResources).not.toContain('*');
    const authorizationStatement = statements.find((statement) =>
      statementActions(statement).includes('ecr:GetAuthorizationToken'),
    );
    expect(authorizationStatement.Resource).toBe('*');
    expect(statementActions(authorizationStatement)).not.toContain('ecr:DescribeImages');
  });

  test('preserves non-ECR fingerprinting without invoking AWS or adding ECR permissions', () => {
    const nonEcr = defineDeployment({
      image: 'registry.example.com/team/app:base',
      repository: Repository.codecommit('cfg'),
      targets: [
        {
          stage: 'dev',
          env: { account: '111111111111', region: 'eu-west-1' },
          manualApproval: false,
        },
      ],
    });
    const t = render(nonEcr);
    const project = Object.values(t.findResources('AWS::CodeBuild::Project'))[0] as any;
    const commands = JSON.parse(project.Properties.Source.BuildSpec).phases.build.commands as string[];
    const fingerprintScript = extractEmbeddedNodeScript(
      commands.find((command) => command.startsWith('TARGET_FINGERPRINT='))!,
    );
    const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    const action = pipeline.Properties.Stages[1].Actions[0];
    const actionEnvironment = Object.fromEntries(
      JSON.parse(action.Configuration.EnvironmentVariables).map((entry: any) => [entry.name, entry.value]),
    );
    expect(JSON.stringify(t.findResources('AWS::IAM::Policy'))).not.toContain('ecr:DescribeImages');

    const cwd = mkdtempSync(path.join(tmpdir(), 'deployment-non-ecr-'));
    try {
      writeFileSync(
        path.join(cwd, 'deploy.config.js'),
        'module.exports = ' +
          JSON.stringify({
            application: nonEcr.application,
            qualifier: nonEcr.qualifier,
            synthesizer: nonEcr.synthesizer,
            image: nonEcr.image,
            repository: nonEcr.repository,
            targets: nonEcr.targets,
          }),
      );
      mkdirSync(path.join(cwd, 'config'));
      writeFileSync(path.join(cwd, 'config', 'dev.json'), JSON.stringify({ version: '1.0.0' }));
      writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { cli: '1.0.0' } }));
      const bin = path.join(cwd, 'bin');
      mkdirSync(bin);
      writeFileSync(path.join(bin, 'aws'), '#!/bin/sh\nexit 87\n');
      chmodSync(path.join(bin, 'aws'), 0o755);
      const runFingerprint = () =>
        spawnSync(process.execPath, ['-e', fingerprintScript], {
          cwd,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH ?? ''}`,
            TARGET_STAGE: 'dev',
            EXPECTED_DEPLOYMENT_TOPOLOGY: actionEnvironment.EXPECTED_DEPLOYMENT_TOPOLOGY,
          },
        });

      const first = runFingerprint();
      expect(first.status).toBe(0);
      expect(first.stdout).toMatch(/^[0-9a-f]{64}$/);
      writeFileSync(path.join(cwd, 'config', 'dev.json'), JSON.stringify({ version: '2.0.0' }));
      const second = runFingerprint();
      expect(second.status).toBe(0);
      expect(second.stdout).not.toBe(first.stdout);

      writeFileSync(path.join(cwd, 'config', 'dev.json'), '{');
      const malformed = runFingerprint();
      expect(malformed.status).not.toBe(0);
      expect(malformed.stderr).toContain('exists but could not be read as JSON');

      writeFileSync(path.join(cwd, 'config', 'dev.json'), JSON.stringify({ version: ' 2.0.0 ' }));
      const invalid = runFingerprint();
      expect(invalid.status).not.toBe(0);
      expect(invalid.stderr).toContain('must contain a non-empty string version field with no surrounding whitespace');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
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
    const parallel = {
      ...defineDeployment({
        application: 'shop',
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
      }),
      // A custom standard-bootstrap qualifier is part of the pipeline-shape fingerprint.
      qualifier: 'shopqual',
    };
    const t = render(parallel);
    const project = Object.values(t.findResources('AWS::CodeBuild::Project'))[0] as any;
    const commands = JSON.parse(project.Properties.Source.BuildSpec).phases.build.commands as string[];
    const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    const deploy = (pipeline.Properties.Stages as any[]).find((stage) => stage.Name === 'Deploy-1');
    const actionEnvironment = Object.fromEntries(
      JSON.parse(deploy.Actions[0].Configuration.EnvironmentVariables).map((entry: any) => [entry.name, entry.value]),
    );
    const fingerprintScript = extractEmbeddedNodeScript(
      commands.find((command) => command.startsWith('TARGET_FINGERPRINT='))!,
    );
    const parallelConfigScript = extractEmbeddedNodeScript(
      commands.find((command) => command.includes('.cdk-cicd-target'))!,
    );

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
              repository: parallel.repository,
              crossAccountEcrRepositoryPolicyConfigured: parallel.crossAccountEcrRepositoryPolicyConfigured,
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

      const bin = path.join(cwd, 'bin');
      const aws = path.join(bin, 'aws');
      const ecrTrace = path.join(cwd, 'ecr.trace');
      const firstDigest = `sha256:${'a'.repeat(64)}`;
      const secondDigest = `sha256:${'b'.repeat(64)}`;
      mkdirSync(bin);
      writeFileSync(
        aws,
        '#!/bin/sh\n' +
          'if [ "${ECR_FAIL_IF_CALLED:-}" = "1" ]; then exit 91; fi\n' +
          'printf "%s\\n" "$*" >> "$ECR_TRACE_FILE"\n' +
          'printf "%s\\n" "$ECR_DIGEST"\n',
      );
      chmodSync(aws, 0o755);
      const env = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        ECR_DIGEST: firstDigest,
        ECR_TRACE_FILE: ecrTrace,
        TARGET_STAGE: 'dev',
        TARGET_REGION: 'eu-west-1',
        EXPECTED_DEPLOYMENT_TOPOLOGY: actionEnvironment.EXPECTED_DEPLOYMENT_TOPOLOGY,
      };
      const runFingerprint = (overrides: NodeJS.ProcessEnv = {}) =>
        spawnSync(process.execPath, ['-e', fingerprintScript], {
          cwd,
          env: { ...env, ...overrides },
          encoding: 'utf8',
        });
      const fingerprint = runFingerprint();
      expect(fingerprint.status).toBe(0);
      expect(fingerprint.stdout).toMatch(/^[0-9a-f]{64}$/);
      expect(readFileSync(ecrTrace, 'utf8')).toContain(
        'ecr describe-images --registry-id 111111111111 --repository-name app ' +
          '--image-ids imageTag=1.2.3 --query imageDetails[0].imageDigest --output text ' +
          '--region eu-west-1 --no-cli-pager',
      );

      const retagged = runFingerprint({ ECR_DIGEST: secondDigest });
      expect(retagged.status).toBe(0);
      expect(retagged.stdout).not.toBe(fingerprint.stdout);

      writeFileSync(ecrTrace, '');
      writeDeploymentConfig([
        {
          ...parallel.targets[0],
          image: `111111111111.dkr.ecr.eu-west-1.amazonaws.com/app@${firstDigest}`,
        },
      ]);
      const digestPinned = runFingerprint({ ECR_FAIL_IF_CALLED: '1' });
      expect(digestPinned.status).toBe(0);
      expect(readFileSync(ecrTrace, 'utf8')).toBe('');
      writeDeploymentConfig(parallel.targets);

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

      writeDeploymentConfig(parallel.targets, {
        repository: { ...parallel.repository, branch: 'release' },
      });
      const repositoryChanged = runFingerprint();
      expect(repositoryChanged.status).not.toBe(0);
      expect(repositoryChanged.stderr).toContain('re-run cdk-cicd deploy-ci to update its actions and permissions');
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
      expect(generated.synthesizer).toEqual({ type: SynthesizerType.DEFAULT });
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
    const project = Object.values(t.findResources('AWS::CodeBuild::Project'))[0] as any;
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
    expect(policies.split(devRepository)).toHaveLength(2);
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
    const privateProject = Object.values(privateTemplate.findResources('AWS::CodeBuild::Project'))[0] as any;
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
    const project = Object.values(template.findResources('AWS::CodeBuild::Project'))[0] as any;
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
    const project = Object.values(template.findResources('AWS::CodeBuild::Project'))[0] as any;

    expect(policies).toContain('role/cdk-hnb659fds-deploy-role-111111111111-eu-west-1');
    expect(policies).not.toContain('-file-role-eu-west-1');
    expect(project.Properties.Source.BuildSpec).toContain('const synthesizer = config.synthesizer ??');
    expect(project.Properties.Source.BuildSpec).toContain('default');
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
    const expectedTopology = (template: Template): string => {
      const pipeline = Object.values(template.findResources('AWS::CodePipeline::Pipeline'))[0] as any;
      const deployAction = (pipeline.Properties.Stages as any[])
        .flatMap((stage) => stage.Actions as any[])
        .find((action) => action.Name === 'Deploy-prod');
      const environment = JSON.parse(deployAction.Configuration.EnvironmentVariables) as Array<{
        name: string;
        value: string;
      }>;
      return environment.find((entry) => entry.name === 'EXPECTED_DEPLOYMENT_TOPOLOGY')!.value;
    };

    const placeholderTemplate = render(placeholderConfig);
    const expected = expectedTopology(placeholderTemplate);
    expect(expected).toBe(expectedTopology(render(concreteConfig)));

    const project = Object.values(placeholderTemplate.findResources('AWS::CodeBuild::Project'))[0] as any;
    const commands = JSON.parse(project.Properties.Source.BuildSpec).phases.build.commands as string[];
    const fingerprintScript = extractEmbeddedNodeScript(
      commands.find((command) => command.startsWith('TARGET_FINGERPRINT='))!,
    );
    const cwd = mkdtempSync(path.join(tmpdir(), 'deployment-role-specialization-'));
    try {
      writeFileSync(path.join(cwd, 'deploy.config.js'), `module.exports = ${JSON.stringify(concreteConfig)};\n`);
      const result = spawnSync(process.execPath, ['-e', fingerprintScript], {
        cwd,
        env: {
          ...process.env,
          TARGET_STAGE: 'prod',
          EXPECTED_DEPLOYMENT_TOPOLOGY: expected,
        },
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
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

    expect(stages.map((stage) => stage.Name)).toEqual(['Source', 'Deploy-1', 'Deploy-2']);
    expect(stages[1].Actions.map((action: any) => [action.Name, action.RunOrder])).toEqual([
      ['Approve-prod', 1],
      ['Deploy-prod', 2],
    ]);
    expect(stages[2].Actions.map((action: any) => action.Name)).toEqual(['Deploy-smoke', 'Deploy-verify']);
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
      'Deploy-1',
      'Deploy-2',
      'Deploy-3',
      'Deploy-4',
      'Deploy-5',
    ]);
    expect(stages.slice(1).map((stage) => stage.Actions.map((action: any) => action.Name))).toEqual([
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
    expect(names).toEqual(['Source', 'Deploy-1', 'Deploy-2']);

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
    const project = Object.values(render(perTarget).findResources('AWS::CodeBuild::Project'))[0] as any;
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
    const project = Object.values(t.findResources('AWS::CodeBuild::Project'))[0] as any;
    const buildSpec = JSON.parse(project.Properties.Source.BuildSpec);
    const spec = JSON.stringify(buildSpec);
    expect(spec).toContain('/tmp/cdk-cicd-npmrc');
    expect(spec).toContain('@cdklabs:registry=https://npm.example.com/');
    expect(spec).toContain('//npm.example.com/:_authToken=$NPM_AUTH_TOKEN');
    expect(buildSpec.phases.build.commands).toContain('rm -f "$NPM_CONFIG_USERCONFIG"');
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
    expect(() => render(tooManyActions)).toThrow(/would contain 1021 actions.*1000-action/);

    const tooManyStages = defineDeployment({
      image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/app:1',
      repository: Repository.codecommit('cfg'),
      targets: Array.from({ length: 50 }, (_, index) => ({
        stage: `stage-${index}`,
        env: { account: '111111111111', region: 'eu-west-1' },
        manualApproval: true,
      })),
    });
    expect(() => render(tooManyStages)).toThrow(/would contain 51 stages.*50-stage/);
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
