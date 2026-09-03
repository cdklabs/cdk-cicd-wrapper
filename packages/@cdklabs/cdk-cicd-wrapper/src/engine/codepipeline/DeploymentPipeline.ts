// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The CD (deploy-side) CodePipeline of the container two-repo split (m6-container, Repo 2). Where the CI
// pipeline (CodePipelineEngine + `deployerImage`) builds & pushes config-agnostic image(s), THIS pipeline
// consumes them: a config-only source repo (the `deploy.config.ts`, no CDK code) triggers a CodePipeline.
// Sequential targets use one Deploy action; parallel multi-region targets use one action per region. Each
// target deploys from ITS OWN image version -- the tag/digest lives on the target in deploy.config and is
// read at RUN time -- so bumping one stage's image and committing deploys only that stage. Non-gated targets
// deploy in parallel; a gated target waits on one manual approval before its deployment action(s).
//
// Source -> Deploy (per-target privileged CodeBuild actions). Each action runs `cdk-cicd deploy --from-image
// --target <stage>`, which pulls that target's image and synth-and-deploys the stage offline in-container.

import { createHash } from 'crypto';
import { DefaultStackSynthesizer, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { buildSourceAction } from './source';
import {
  NpmRegistryConfig,
  RegionOrder,
  ResolvedDeploymentConfig,
  ResolvedDeploymentTarget,
  SynthesizerType,
} from '../../config/types';
import { SupportResources } from '../../support/SupportResources';
import { deployRoleExternalIdSecretArnsForStages } from '../external-id-secrets';

/** Node runtime for the CD build image's install phase (kept in step with the CI engine). */
const NODE_RUNTIME_VERSION = 22;
/** The CDK bootstrap roles `cdk deploy` assumes (same set the CI engine grants). */
const BOOTSTRAP_ROLE_KINDS = ['deploy', 'file-publishing', 'image-publishing', 'lookup'];

/** Options for the CD deployment pipeline. */
export interface DeploymentPipelineProps {
  /** The resolved deployment configuration (`defineDeployment`); its `repository` is the pipeline source. */
  readonly config: ResolvedDeploymentConfig;
  /** Removal policy for the pipeline's own support resources. `DESTROY` for a disposable pipeline. */
  readonly removalPolicy?: RemovalPolicy;
  /** Optional custom CodeBuild image for the deploy project (must have docker + the AWS CLI). */
  readonly buildImage?: string;
}

/**
 * Renders the CD CodePipeline into `scope` (a Stack): Source (the config repo) -> a "Deploy" stage with
 * privileged-CodeBuild actions for ungated targets, then a "DeployGated" stage with the gated targets,
 * each behind its own manual approval. A sequential target uses one action for all regions; a parallel
 * multi-region target fans out one action per region. Each action runs `cdk-cicd deploy --from-image
 * --target <stage>` -- pulling that target's own image version, read from deploy.config at run time. The
 * CLI is installed from the source repo's `package.json` (`npm ci`), so the config repo carries no CDK code.
 */
export class DeploymentPipeline extends Construct {
  public readonly pipeline: codepipeline.Pipeline;

  constructor(scope: Construct, id: string, props: DeploymentPipelineProps) {
    super(scope, id);
    const config = props.config;
    if (config.repository === undefined) {
      throw new Error(
        'cdk-cicd: defineDeployment needs a `repository` to provision a CD pipeline -- set it, or use the ' +
          'local `cdk-cicd deploy --from-image` executor instead.',
      );
    }
    const removalPolicy = props.removalPolicy;
    const stack = Stack.of(this);

    const sourceOutput = new codepipeline.Artifact();
    const support = new SupportResources(this, 'Support', { removalPolicy });
    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', { artifactBucket: support.artifactBucket });

    pipeline.addStage({ stageName: 'Source', actions: [buildSourceAction(this, config.repository, sourceOutput)] });

    // Duplicate target stages would collide on action names and state parameters -- reject them early.
    const names = config.targets.map((t) => t.stage);
    const dup = names.find((s, i) => names.indexOf(s) !== i);
    if (dup !== undefined) {
      throw new Error(`cdk-cicd: duplicate deploy.config target stage '${dup}' -- each target needs a unique stage`);
    }
    const deploymentUnits = config.targets.flatMap((target) => deploymentUnitsForTarget(stack, this, target));
    const expectedDeploymentTopology = deploymentPipelineShapeFingerprint(config);
    const externalIdSecretArns = deployRoleExternalIdSecretArnsForStages(
      config.targets.map((target) => ({
        name: target.stage,
        env: target.env,
        manualApproval: target.manualApproval,
        deployment: target.deployment,
      })),
    );

    // Log in to every distinct ECR registry across the targets' effective images and grant pull access to
    // every distinct repository. The build verifies the synth-time pipeline shape before deploying, so
    // registry/repository, role, account/region, synthesizer, or action-topology changes fail with an
    // instruction to re-run `deploy-ci`; ordinary tag/version changes remain runtime deployments.
    const images = config.targets.map((t) => t.image ?? config.image).filter((i): i is string => i !== undefined);
    const ecrRepositories = new Map<string, EcrRepository>();
    const ecrHosts = new Map<string, string>();
    for (const image of images) {
      const repository = parseEcrRepository(image);
      if (repository !== undefined) {
        ecrRepositories.set(`${repository.account}:${repository.region}:${repository.repositoryName}`, repository);
        ecrHosts.set(repository.registryHost, repository.region);
      }
    }
    const ecrLoginCommands = [...ecrHosts].map(
      ([host, region]) =>
        `aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${host}`,
    );

    // Optional CodeArtifact login so `npm ci` can install a pre-release wrapper CLI.
    const ca = config.codeArtifact;
    const codeArtifactLogin = ca
      ? [
          `aws codeartifact login --tool npm --domain ${ca.domain} --domain-owner ${ca.account ?? stack.account} ` +
            `--repository ${ca.repository} --region ${ca.region ?? stack.region}` +
            (ca.npmScope ? ` --namespace ${ca.npmScope}` : ''),
        ]
      : [];

    // Optional generic private-registry login, same shape and provenance as the CI engine's.
    const npmRegistry = config.npmRegistry;
    const npmRegistryLogin = npmRegistry ? npmRegistryLoginCommands(npmRegistry) : [];

    // ONE deploy build, run once per target as a separate pipeline action that sets TARGET_STAGE. It
    // deploys just that target from ITS OWN image version (read from deploy.config at run time), so bumping
    // a stage's image tag and committing deploys only that stage. Privileged for docker; creds materialized
    // to static env vars (CodeBuild serves them via the container-credentials endpoint) so
    // `deploy --from-image` can forward them into the deployer container by name.
    const fingerprintCommand =
      `TARGET_FINGERPRINT=$(TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' ` +
      `node -r ts-node/register/transpile-only -e ${shellQuote(deploymentFingerprintScript())})`;
    const prepareParallelTarget =
      `TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' ` +
      `node -r ts-node/register/transpile-only -e ${shellQuote(parallelTargetConfigScript())}`;
    const readPreviousFingerprint = [
      'if PREVIOUS_TARGET_FINGERPRINT=$(aws ssm get-parameter --name "$TARGET_STATE_PARAMETER" ' +
        '--query "Parameter.Value" --output text 2>/tmp/cdk-cicd-target-state-error); then',
      '  :',
      'elif grep -q "ParameterNotFound" /tmp/cdk-cicd-target-state-error; then',
      '  PREVIOUS_TARGET_FINGERPRINT=""',
      'else',
      '  cat /tmp/cdk-cicd-target-state-error >&2',
      '  exit 1',
      'fi',
    ].join('\n');
    const deployAndRecord = [
      '{',
      '  if [ -n "${TARGET_REGION:-}" ]; then',
      `    ${prepareParallelTarget} &&`,
      '      (cd .cdk-cicd-target && ../node_modules/.bin/cdk-cicd deploy --from-image ' +
        '--target "$TARGET_STAGE" --yes)',
      '  else',
      '    npx cdk-cicd deploy --from-image --target "$TARGET_STAGE" --yes',
      '  fi',
      '} && aws ssm put-parameter --name "$TARGET_STATE_PARAMETER" --type String ' +
        '--value "$TARGET_FINGERPRINT" --overwrite >/dev/null',
    ].join('\n');
    const commands = [
      ...codeArtifactLogin,
      ...npmRegistryLogin,
      'npm ci',
      fingerprintCommand,
      'if [ "${#TARGET_FINGERPRINT}" -ne 64 ] || printf "%s" "$TARGET_FINGERPRINT" | grep -q "[^0-9a-f]"; then ' +
        'echo "cdk-cicd: could not compute a valid target fingerprint" >&2; exit 1; fi',
      readPreviousFingerprint,
      'if [ "$PREVIOUS_TARGET_FINGERPRINT" = "$TARGET_FINGERPRINT" ]; then ' +
        'echo "cdk-cicd: target $TARGET_STAGE is unchanged; skipping deployment"; exit 0; fi',
      ...ecrLoginCommands,
      'eval "$(aws configure export-credentials --format env 2>/dev/null)" || { ' +
        'CREDS=$(curl -s "http://169.254.170.2${AWS_CONTAINER_CREDENTIALS_RELATIVE_URI}"); ' +
        'export AWS_ACCESS_KEY_ID=$(echo "$CREDS" | jq -r .AccessKeyId); ' +
        'export AWS_SECRET_ACCESS_KEY=$(echo "$CREDS" | jq -r .SecretAccessKey); ' +
        'export AWS_SESSION_TOKEN=$(echo "$CREDS" | jq -r .Token); }',
      deployAndRecord,
    ];
    const project = new codebuild.PipelineProject(this, 'Deploy', {
      environment: {
        buildImage:
          props.buildImage !== undefined ? codebuild.LinuxBuildImage.fromDockerRegistry(props.buildImage) : undefined,
        privileged: true,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          ...(props.buildImage === undefined
            ? { install: { 'runtime-versions': { nodejs: NODE_RUNTIME_VERSION } } }
            : {}),
          build: { commands },
        },
        // The bearer token `npmRegistryLoginCommands` writes into .npmrc; resolved by CodeBuild at
        // container start, not read via a shell `aws secretsmanager` call.
        ...(npmRegistry ? { env: { 'secrets-manager': { NPM_AUTH_TOKEN: npmRegistry.basicAuthSecretArn } } } : {}),
      }),
    });

    // The deploy build runs `cdk deploy` per target, which does everything through the CDK bootstrap
    // roles -- so the project's role needs permission to assume them in EACH target's account/region (plus
    // any forced deployer role). This mirrors the CI engine's grantDeployPermissions. Repo 2 repeats
    // the image's qualifier/synthesizer identity so this pipeline can name the same bootstrap and
    // APP_STAGING publishing roles without inspecting the image at synth time.
    const qualifier = config.qualifier ?? DefaultStackSynthesizer.DEFAULT_QUALIFIER;
    const stagingAppId = deploymentAppStagingId(config);
    const roleArns = new Set<string>();
    const versionParams = new Set<string>();
    for (const target of config.targets) {
      const account = target.env.account;
      // A target with no explicit account deploys under the pipeline's ambient account; we cannot name its
      // bootstrap roles at synth time, so the project's own identity (or a forced role) must cover it.
      if (account !== undefined) {
        for (const region of target.env.regions) {
          for (const kind of BOOTSTRAP_ROLE_KINDS) {
            roleArns.add(
              `arn:${stack.partition}:iam::${account}:role/cdk-${qualifier}-${kind}-role-${account}-${region}`,
            );
          }
          if (stagingAppId !== undefined) {
            roleArns.add(`arn:${stack.partition}:iam::${account}:role/cdk-${stagingAppId}-file-role-${region}`);
            roleArns.add(`arn:${stack.partition}:iam::${account}:role/cdk-${stagingAppId}-image-role-${region}`);
          }
          versionParams.add(
            `arn:${stack.partition}:ssm:${region}:${account}:parameter/cdk-bootstrap/${qualifier}/version`,
          );
        }
      }
      // A stage's `deployRole` is a CloudFormation SERVICE role (passed as --role-arn); granting the
      // project sts:AssumeRole on it mirrors the CI engine and covers the case where the CLI assumes it.
      const forced = target.deployment?.deployRole;
      if (forced !== undefined && forced.length > 0) roleArns.add(forced);
    }
    if (roleArns.size > 0) {
      project.addToRolePolicy(new iam.PolicyStatement({ actions: ['sts:AssumeRole'], resources: [...roleArns] }));
    }
    if (versionParams.size > 0) {
      project.addToRolePolicy(
        new iam.PolicyStatement({ actions: ['ssm:GetParameter'], resources: [...versionParams] }),
      );
    }
    if (ecrRepositories.size > 0) {
      project.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['ecr:GetAuthorizationToken'],
          // ECR does not support resource-level permissions for authorization tokens.
          resources: ['*'],
        }),
      );
      project.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['ecr:BatchCheckLayerAvailability', 'ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer'],
          resources: [...ecrRepositories.values()].map(
            (repository) =>
              `arn:${stack.partition}:ecr:${repository.region}:${repository.account}:repository/${repository.repositoryName}`,
          ),
        }),
      );
    }
    // CodeArtifact read for the build's `npm ci` (pre-release CLI install).
    if (ca) {
      const caAccount = ca.account ?? stack.account;
      const caRegion = ca.region ?? stack.region;
      project.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['codeartifact:GetAuthorizationToken'],
          resources: [`arn:${stack.partition}:codeartifact:${caRegion}:${caAccount}:domain/${ca.domain}`],
        }),
      );
      project.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['codeartifact:GetRepositoryEndpoint', 'codeartifact:ReadFromRepository'],
          resources: [
            `arn:${stack.partition}:codeartifact:${caRegion}:${caAccount}:repository/${ca.domain}/${ca.repository}`,
          ],
        }),
      );
      project.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['sts:GetServiceBearerToken'],
          resources: ['*'],
          conditions: { StringEquals: { 'sts:AWSServiceName': 'codeartifact.amazonaws.com' } },
        }),
      );
    }
    // The private-registry bearer token `npmRegistryLoginCommands` resolves via Secrets Manager.
    if (npmRegistry) {
      project.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'],
          resources: [npmRegistry.basicAuthSecretArn],
        }),
      );
    }
    // `deploy --from-image` resolves target ExternalIds before launching Docker. Only targets with a
    // forced deploy role contribute a secret ARN, matching the CLI's effective-role contract.
    if (externalIdSecretArns.length > 0) {
      project.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'],
          resources: externalIdSecretArns,
        }),
      );
    }

    // Sequential targets get one state parameter for the whole rollout; parallel targets get one per
    // region. A successful region can therefore never mask another region's failed/missing deployment.
    const stateParameterNames = new Set(deploymentUnits.map((unit) => unit.stateParameterName));
    if (stateParameterNames.size > 0) {
      project.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['ssm:GetParameter', 'ssm:PutParameter'],
          resources: [...stateParameterNames.values()].map(
            (parameterName) => `arn:${stack.partition}:ssm:${stack.region}:${stack.account}:parameter${parameterName}`,
          ),
        }),
      );
    }

    // Each deployment unit reads its target's OWN image version at run time. TARGET_REGION is present only
    // for a RegionOrder.PARALLEL fan-out action; the build then narrows an ephemeral deploy.config to that
    // region before invoking the existing CLI, whose from-image executor remains the source of truth for
    // image resolution, account/role environment, and the inner `deploy --region` command.
    const deployAction = (unit: DeploymentUnit, runOrder?: number) =>
      new actions.CodeBuildAction({
        actionName: unit.actionName,
        project,
        input: sourceOutput,
        runOrder,
        environmentVariables: {
          TARGET_STAGE: { value: unit.target.stage },
          TARGET_STATE_PARAMETER: { value: unit.stateParameterName },
          EXPECTED_DEPLOYMENT_TOPOLOGY: { value: expectedDeploymentTopology },
          ...(unit.region !== undefined ? { TARGET_REGION: { value: unit.region } } : {}),
        },
      });
    const actionsForTarget = (target: ResolvedDeploymentTarget, runOrder?: number) =>
      deploymentUnits.filter((unit) => unit.target === target).map((unit) => deployAction(unit, runOrder));

    // Two stages, so a pending gated approval never blocks the ungated targets:
    //  - "Deploy": every ungated target, with PARALLEL targets fanned out into same-run-order region actions.
    //  - "DeployGated": every gated logical target gets one approval, then all of that target's deployment
    //    units run at order 2. Native approvals necessarily queue before CodeBuild can evaluate fingerprints,
    //    so an unchanged gated target still needs approval; its build action(s) then exit successfully.
    const ungated = config.targets.filter((t) => !t.manualApproval);
    const gated = config.targets.filter((t) => t.manualApproval);
    if (ungated.length > 0) {
      pipeline.addStage({ stageName: 'Deploy', actions: ungated.flatMap((target) => actionsForTarget(target)) });
    }
    if (gated.length > 0) {
      const gatedActions: codepipeline.IAction[] = [];
      for (const target of gated) {
        gatedActions.push(new actions.ManualApprovalAction({ actionName: `Approve-${target.stage}`, runOrder: 1 }));
        gatedActions.push(...actionsForTarget(target, 2));
      }
      pipeline.addStage({ stageName: 'DeployGated', actions: gatedActions });
    }

    // cdk-nag suppressions, mirroring the CI engine so a real `deploy-ci` synth (which runs
    // AwsSolutionsChecks via DeploymentPipelineApp) does not abort on expected pipeline findings.
    NagSuppressions.addResourceSuppressions(
      project,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'CodeBuild default log/report/artifact wildcards, ECR authorization tokens, plus scoped ' +
            'sts:AssumeRole on the CDK bootstrap roles.',
        },
        {
          id: 'AwsSolutions-CB3',
          reason: 'Privileged mode is required to run the deployer image (docker) inside CodeBuild.',
        },
      ],
      true,
    );
    NagSuppressions.addResourceSuppressions(support.artifactBucket, [
      { id: 'AwsSolutions-S1', reason: 'Pipeline artifact bucket; server access logging is not required for it.' },
    ]);
    NagSuppressions.addResourceSuppressions(
      pipeline,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'CodePipeline and its source/action roles use CDK-generated wildcard permissions.',
        },
      ],
      true,
    );

    this.pipeline = pipeline;
  }
}

/**
 * Writes a `.npmrc` authenticating npm against a generic private registry (mirrors the CI engine's
 * `npmRegistryLogin`; see there for the v2 `npm-login.sh` provenance).
 */
function npmRegistryLoginCommands(npm: NpmRegistryConfig): string[] {
  const host = npm.url.replace(/^https?:\/\//, '');
  const scope = npm.scope !== undefined && npm.scope.length > 0 ? npm.scope : undefined;
  const scopePrefix = scope !== undefined ? `${scope.startsWith('@') ? scope : `@${scope}`}:` : '';
  return [
    `echo "${scopePrefix}registry=${npm.url}" > ./.npmrc`,
    `echo "//${host}:_authToken=$NPM_AUTH_TOKEN" >> ./.npmrc`,
  ];
}

interface EcrRepository {
  readonly registryHost: string;
  readonly account: string;
  readonly region: string;
  readonly repositoryName: string;
}

interface DeploymentUnit {
  readonly target: ResolvedDeploymentTarget;
  /** Present only when a PARALLEL multi-region target is narrowed to one region. */
  readonly region?: string;
  readonly actionName: string;
  readonly stateParameterName: string;
}

/** Expand only PARALLEL multi-region targets; every other target remains one sequential CLI invocation. */
function deploymentUnitsForTarget(stack: Stack, scope: Construct, target: ResolvedDeploymentTarget): DeploymentUnit[] {
  if (target.env.regionOrder === RegionOrder.PARALLEL && target.env.regions.length > 1) {
    return target.env.regions.map((region) => ({
      target,
      region,
      actionName: `Deploy-${target.stage}-${region}`,
      stateParameterName: deploymentStateParameterName(stack, scope, target.stage, region),
    }));
  }
  return [
    {
      target,
      actionName: `Deploy-${target.stage}`,
      stateParameterName: deploymentStateParameterName(stack, scope, target.stage),
    },
  ];
}

/**
 * Hash every deploy.config field that changes the synthesized CD pipeline: action topology, IAM,
 * registry login, and the deployer image's bootstrap/app-staging identity. Image tags/digests and
 * application config versions remain runtime inputs and are handled by the per-target fingerprint.
 */
function deploymentPipelineShapeFingerprint(config: ResolvedDeploymentConfig): string {
  const ecrRepositoryIdentity = (image: string | undefined) => {
    const repository = image === undefined ? undefined : parseEcrRepository(image);
    return repository === undefined
      ? null
      : {
          account: repository.account,
          region: repository.region,
          repositoryName: repository.repositoryName,
        };
  };
  const shape = {
    application: config.application ?? null,
    qualifier: config.qualifier ?? null,
    synthesizer: {
      type: config.synthesizer.type,
      appId: config.synthesizer.appId ?? null,
    },
    codeArtifact:
      config.codeArtifact === undefined
        ? null
        : {
            domain: config.codeArtifact.domain,
            repository: config.codeArtifact.repository,
            account: config.codeArtifact.account ?? null,
            region: config.codeArtifact.region ?? null,
            npmScope: config.codeArtifact.npmScope ?? null,
          },
    npmRegistry:
      config.npmRegistry === undefined
        ? null
        : {
            url: config.npmRegistry.url,
            basicAuthSecretArn: config.npmRegistry.basicAuthSecretArn,
            scope: config.npmRegistry.scope ?? null,
          },
    targets: config.targets.map((target) => ({
      stage: target.stage,
      manualApproval: target.manualApproval,
      account: target.env.account ?? null,
      regions: target.env.regions,
      regionOrder: target.env.regionOrder,
      deployRole: target.deployment?.deployRole ?? null,
      externalId: target.deployment?.externalId ?? null,
      ecrRepository: ecrRepositoryIdentity(target.image ?? config.image),
    })),
  };
  return createHash('sha256')
    .update(JSON.stringify({ schema: 'container-deployment-pipeline-shape-v2', ...shape }))
    .digest('hex');
}

/**
 * Parse a private ECR image reference into the fields needed by `docker login` and repository-scoped
 * IAM. Tags/digests are deliberately discarded; nested repository paths are preserved.
 */
function parseEcrRepository(image: string): EcrRepository | undefined {
  const firstSlash = image.indexOf('/');
  if (firstSlash < 1) return undefined;

  const registryHost = image.slice(0, firstSlash);
  const registry = /^([0-9]{12})\.dkr\.ecr(?:-fips)?\.([a-z0-9-]+)\..+$/.exec(registryHost);
  if (registry === null) return undefined;

  const imagePath = image.slice(firstSlash + 1);
  const repositoryName = imagePath.split('@', 1)[0].replace(/:[^/]+$/, '');
  if (repositoryName.length === 0) return undefined;

  return {
    registryHost,
    account: registry[1],
    region: registry[2],
    repositoryName,
  };
}

/** The normalized id the deployer image's AppStagingSynthesizer uses in asset-role names. */
function deploymentAppStagingId(config: ResolvedDeploymentConfig): string | undefined {
  if (config.synthesizer.type !== SynthesizerType.APP_STAGING) return undefined;
  const raw = config.synthesizer.appId ?? config.application;
  if (raw === undefined || raw.trim().length === 0) {
    throw new Error(
      'cdk-cicd: APP_STAGING deployer images require `application` or `synthesizer.appId` in ' +
        'deploy.config so Repo 2 can assume their app-scoped asset roles.',
    );
  }
  const normalized = raw
    .toLocaleLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .slice(0, 20);
  if (normalized.length === 0) {
    throw new Error(
      `cdk-cicd: APP_STAGING app id '${raw}' contains no letters, numbers, or dashes after normalization.`,
    );
  }
  return normalized;
}

/** A stable, pipeline-local SSM parameter for one sequential target or one parallel target-region. */
function deploymentStateParameterName(stack: Stack, scope: Construct, stage: string, region?: string): string {
  const stateKey = region === undefined ? stage : `${stage}\0${region}`;
  const stageHash = createHash('sha256').update(stateKey).digest('hex').slice(0, 20);
  return `/cdk-cicd/deployment-state/${stack.stackName}/${scope.node.addr}/${stageHash}`;
}

/**
 * JavaScript executed after `npm ci` to fingerprint only the selected target's effective deployment
 * inputs plus the config repo's package manifest/lock identity. `defineDeployment` normalizes target
 * property order, so JSON serialization is deterministic. The version parser intentionally mirrors the
 * deploy executor: missing, malformed, non-string, or empty versions all mean "use the configured image
 * reference as-is".
 */
function deploymentFingerprintScript(): string {
  return [
    'const crypto = require("crypto");',
    'const fs = require("fs");',
    'const path = require("path");',
    'const writeFingerprint = process.stdout.write.bind(process.stdout);',
    'process.stdout.write = process.stderr.write.bind(process.stderr);',
    'const file = ["deploy.config.ts", "deploy.config.js"]',
    '  .map((name) => path.resolve(name))',
    '  .find((candidate) => fs.existsSync(candidate));',
    'if (file === undefined) throw new Error("cdk-cicd: no deploy.config.ts or deploy.config.js found");',
    'const loaded = require(file);',
    'const config = loaded.default ?? loaded;',
    'const ecrRepositoryIdentity = (image) => {',
    '  if (typeof image !== "string") return null;',
    '  const firstSlash = image.indexOf("/");',
    '  if (firstSlash < 1) return null;',
    '  const registryHost = image.slice(0, firstSlash);',
    '  const registry = /^([0-9]{12})\\.dkr\\.ecr(?:-fips)?\\.([a-z0-9-]+)\\..+$/.exec(registryHost);',
    '  if (registry === null) return null;',
    '  const repositoryName = image.slice(firstSlash + 1).split("@", 1)[0].replace(/:[^/]+$/, "");',
    '  return repositoryName.length === 0',
    '    ? null',
    '    : { account: registry[1], region: registry[2], repositoryName };',
    '};',
    'const synthesizer = config.synthesizer ?? { type: "default" };',
    'const pipelineShape = {',
    '  application: config.application ?? null,',
    '  qualifier: config.qualifier ?? null,',
    '  synthesizer: { type: synthesizer.type, appId: synthesizer.appId ?? null },',
    '  codeArtifact:',
    '    config.codeArtifact === undefined',
    '      ? null',
    '      : {',
    '          domain: config.codeArtifact.domain,',
    '          repository: config.codeArtifact.repository,',
    '          account: config.codeArtifact.account ?? null,',
    '          region: config.codeArtifact.region ?? null,',
    '          npmScope: config.codeArtifact.npmScope ?? null,',
    '        },',
    '  npmRegistry:',
    '    config.npmRegistry === undefined',
    '      ? null',
    '      : {',
    '          url: config.npmRegistry.url,',
    '          basicAuthSecretArn: config.npmRegistry.basicAuthSecretArn,',
    '          scope: config.npmRegistry.scope ?? null,',
    '        },',
    '  targets: config.targets.map((candidate) => ({',
    '    stage: candidate.stage,',
    '    manualApproval: candidate.manualApproval,',
    '    account: candidate.env.account ?? null,',
    '    regions: candidate.env.regions,',
    '    regionOrder: candidate.env.regionOrder,',
    '    deployRole: candidate.deployment?.deployRole ?? null,',
    '    externalId: candidate.deployment?.externalId ?? null,',
    '    ecrRepository: ecrRepositoryIdentity(candidate.image ?? config.image),',
    '  })),',
    '};',
    'const currentTopology = crypto',
    '  .createHash("sha256")',
    '  .update(JSON.stringify({ schema: "container-deployment-pipeline-shape-v2", ...pipelineShape }))',
    '  .digest("hex");',
    'if (currentTopology !== process.env.EXPECTED_DEPLOYMENT_TOPOLOGY) {',
    '  throw new Error(',
    '    "cdk-cicd: deploy.config changed fields that shape the CD pipeline; " +',
    '      "re-run cdk-cicd deploy-ci to update its actions and permissions",',
    '  );',
    '}',
    'const stage = process.env.TARGET_STAGE;',
    'const target = config.targets.find((candidate) => candidate.stage === stage);',
    'if (target === undefined) throw new Error("cdk-cicd: no deployment target named " + stage);',
    'if (',
    '  process.env.TARGET_REGION === undefined &&',
    '  target.env.regionOrder === "parallel" &&',
    '  target.env.regions.length > 1',
    ') {',
    '  throw new Error(',
    '    "cdk-cicd: target " + stage + " now needs parallel region actions; " +',
    '      "re-run cdk-cicd deploy-ci to update the pipeline topology",',
    '  );',
    '}',
    'const versionFile = path.resolve("config", stage + ".json");',
    'let version = null;',
    'if (fs.existsSync(versionFile)) {',
    '  try {',
    '    const candidate = JSON.parse(fs.readFileSync(versionFile, "utf8")).version;',
    '    if (typeof candidate === "string" && candidate.length > 0) version = candidate;',
    '  } catch {}',
    '}',
    'const toolingFiles = [',
    '  "package.json",',
    '  "package-lock.json",',
    '  "npm-shrinkwrap.json",',
    '  "yarn.lock",',
    '  "pnpm-lock.yaml",',
    '];',
    'const tooling = Object.fromEntries(',
    '  toolingFiles',
    '    .filter((name) => fs.existsSync(path.resolve(name)))',
    '    .map((name) => [',
    '      name,',
    '      crypto.createHash("sha256").update(fs.readFileSync(path.resolve(name))).digest("hex"),',
    '    ]),',
    ');',
    'const fingerprintInput = {',
    '  schema: "container-deployment-target-v3",',
    '  target,',
    '  image: target.image ?? config.image ?? null,',
    '  version,',
    '  region: process.env.TARGET_REGION ?? null,',
    '  tooling,',
    '};',
    'writeFingerprint(',
    '  crypto.createHash("sha256").update(JSON.stringify(fingerprintInput)).digest("hex"),',
    ');',
  ].join('\n');
}

/**
 * Build a temporary one-target, one-region config for a PARALLEL action. The existing from-image CLI
 * then performs image/version resolution and emits the same docker/inner-deploy contract as sequential
 * mode; no ignored top-level `--region` flag or duplicate docker implementation is introduced here.
 */
function parallelTargetConfigScript(): string {
  return [
    'const fs = require("fs");',
    'const path = require("path");',
    'const file = ["deploy.config.ts", "deploy.config.js"]',
    '  .map((name) => path.resolve(name))',
    '  .find((candidate) => fs.existsSync(candidate));',
    'if (file === undefined) throw new Error("cdk-cicd: no deploy.config.ts or deploy.config.js found");',
    'const loaded = require(file);',
    'const config = loaded.default ?? loaded;',
    'const stage = process.env.TARGET_STAGE;',
    'const region = process.env.TARGET_REGION;',
    'if (region === undefined || region.length === 0) throw new Error("cdk-cicd: TARGET_REGION is empty");',
    'const target = config.targets.find((candidate) => candidate.stage === stage);',
    'if (target === undefined) throw new Error("cdk-cicd: no deployment target named " + stage);',
    'if (target.env.regionOrder !== "parallel" || !target.env.regions.includes(region)) {',
    '  throw new Error(',
    '    "cdk-cicd: target " + stage + " no longer defines parallel region " + region +',
    '      "; re-run cdk-cicd deploy-ci to update the pipeline topology",',
    '  );',
    '}',
    'const output = path.resolve(".cdk-cicd-target");',
    'fs.mkdirSync(output, { recursive: true });',
    'const narrowed = {',
    '  application: config.application,',
    '  qualifier: config.qualifier,',
    '  synthesizer: config.synthesizer,',
    '  image: config.image,',
    '  targets: [{ ...target, env: { ...target.env, regions: [region] } }],',
    '};',
    'fs.writeFileSync(',
    '  path.join(output, "deploy.config.js"),',
    '  "module.exports = " + JSON.stringify(narrowed) + ";\\n",',
    ');',
    'const versionFile = path.resolve("config", stage + ".json");',
    'if (fs.existsSync(versionFile)) {',
    '  const outputConfig = path.join(output, "config");',
    '  fs.mkdirSync(outputConfig, { recursive: true });',
    '  fs.copyFileSync(versionFile, path.join(outputConfig, stage + ".json"));',
    '}',
  ].join('\n');
}

/** Quote a value as one POSIX-shell argument. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
