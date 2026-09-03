// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The CD (deploy-side) CodePipeline of the container two-repo split (m6-container, Repo 2). Where the CI
// pipeline (CodePipelineEngine + `deployerImage`) builds & pushes config-agnostic image(s), THIS pipeline
// consumes them: a config-only source repo (the `deploy.config.ts`, no CDK code) triggers a CodePipeline.
// Sequential targets use one Deploy action; parallel multi-region targets use one action per region. Each
// target deploys from ITS OWN image version -- the tag/digest lives on the target in deploy.config and is
// read at RUN time -- so bumping one stage's image and committing deploys only that stage. Contiguous
// non-gated targets deploy in parallel; a gated target waits on one manual approval before its deployment
// action(s) and gates every target declared after it.
//
// Source -> Deploy (per-target privileged CodeBuild actions). Each action runs `cdk-cicd deploy --from-image
// --target <stage>`, which pulls that target's image and synth-and-deploys the stage offline in-container.

import { createHash } from 'crypto';
import { Annotations, RemovalPolicy, Stack, Token } from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import { RegionInfo } from 'aws-cdk-lib/region-info';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { buildSourceAction } from './source';
import {
  resolveDefaultSynthesizerQualifier,
  specializeDefaultSynthesizerRoleArn,
} from '../../config/default-synthesizer-role-arn';
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
/** Kept outside CODEBUILD_SRC_DIR so registry credentials cannot enter or modify the config checkout. */
const PRIVATE_NPM_CONFIG_PATH = '/tmp/cdk-cicd-npmrc';
/** The CDK bootstrap roles `cdk deploy` assumes (same set the CI engine grants). */
const BOOTSTRAP_ROLE_KINDS = ['deploy', 'file-publishing', 'image-publishing', 'lookup'];
/** Fixed CodePipeline service quotas that cannot be raised. */
const MAX_ACTIONS_PER_STAGE = 100;
const MAX_ACTIONS_PER_PIPELINE = 1_000;
const MAX_STAGES_PER_PIPELINE = 50;
const CODEPIPELINE_IDENTIFIER = /^[A-Za-z0-9.@_-]{1,100}$/;

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
 * Renders the CD CodePipeline into `scope` (a Stack): Source (the config repo) followed by ordered
 * deployment stages. Each contiguous run of ungated targets shares one stage and can deploy in parallel.
 * Each gated target has its own stage, with its approval at run order 1 and only that target's deploy
 * action(s) at run order 2, so the gate blocks every later target without reordering the declaration.
 * A sequential target uses one action for all regions; a parallel multi-region target fans out one action
 * per region. Each action runs `cdk-cicd deploy --from-image --target <stage>` -- pulling that target's own
 * image version, read from deploy.config at run time. The CLI is installed from the source repo's
 * `package.json` (`npm ci`), so the config repo carries no CDK code.
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
    const qualifier = resolveDefaultSynthesizerQualifier(this, config.qualifier);

    // Duplicate target stages would collide on action names and state parameters -- reject them early.
    const names = config.targets.map((t) => t.stage);
    const dup = names.find((s, i) => names.indexOf(s) !== i);
    if (dup !== undefined) {
      throw new Error(`cdk-cicd: duplicate deploy.config target stage '${dup}' -- each target needs a unique stage`);
    }
    const effectiveTargets = config.targets.map((target) => resolveDeploymentTargetEnvironment(stack, target));
    const synthesizer = deploymentSynthesizer(config);
    if (synthesizer.type === SynthesizerType.APP_STAGING) {
      throw new Error(
        'cdk-cicd: APP_STAGING cannot be deployed by the Repo 2 CodePipeline. The pinned alpha emits ' +
          'DefaultStagingStack with BootstraplessSynthesizer, so that support stack is deployed with the ' +
          "CodeBuild project's base credentials instead of the configured deployment role. Use " +
          'SynthesizerType.DEFAULT for Repo 2, or run `cdk-cicd deploy --from-image` directly with ' +
          'appropriately privileged credentials.',
      );
    }
    const deploymentUnits = effectiveTargets.flatMap((target) => deploymentUnitsForTarget(stack, this, target));
    const deploymentStages = deploymentStagePlans(config.targets);
    validateDeploymentTopology(deploymentStages, deploymentUnits);
    validateDeploymentPartitions(stack, effectiveTargets);
    const pipelinePartition = RegionInfo.get(stack.region).partition;
    if (pipelinePartition === undefined) {
      throw new Error(
        `cdk-cicd: Repo 2 pipeline region '${stack.region}' has no known AWS partition in this aws-cdk-lib version.`,
      );
    }
    const expectedDeploymentTopology = deploymentPipelineShapeFingerprint(
      config,
      effectiveTargets,
      pipelinePartition,
      qualifier,
    );
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
        validateEcrRepositoryAccount(
          this,
          stack,
          repository,
          image,
          config.crossAccountEcrRepositoryPolicyConfigured ?? false,
        );
        ecrRepositories.set(`${repository.account}:${repository.region}:${repository.repositoryName}`, repository);
        ecrHosts.set(repository.registryHost, repository.region);
      }
    }
    const buildImage = deploymentBuildImage(
      this,
      stack,
      props.buildImage,
      config.crossAccountEcrRepositoryPolicyConfigured ?? false,
    );
    const ecrLoginCommands = [...ecrHosts].map(
      ([host, region]) =>
        `aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${host}`,
    );

    const sourceOutput = new codepipeline.Artifact();
    const support = new SupportResources(this, 'Support', { removalPolicy });
    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', { artifactBucket: support.artifactBucket });

    pipeline.addStage({ stageName: 'Source', actions: [buildSourceAction(this, config.repository, sourceOutput)] });

    // Optional CodeArtifact login so `npm ci` can install a pre-release wrapper CLI.
    const ca = config.codeArtifact;
    const privateNpm = ca !== undefined || config.npmRegistry !== undefined;
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
      `node -r ts-node/register/transpile-only -e ${shellQuote(
        deploymentFingerprintScript(effectiveTargets, pipelinePartition, qualifier),
      )})`;
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
      ...(privateNpm ? npmConfigSetupCommands() : []),
      ...codeArtifactLogin,
      ...npmRegistryLogin,
      'npm ci',
      ...(privateNpm ? ['rm -f "$NPM_CONFIG_USERCONFIG"', 'unset NPM_AUTH_TOKEN'] : []),
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
        buildImage,
        privileged: true,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          ...(props.buildImage === undefined
            ? { install: { 'runtime-versions': { nodejs: NODE_RUNTIME_VERSION } } }
            : {}),
          build: {
            commands,
            ...(privateNpm ? { finally: ['rm -f "$NPM_CONFIG_USERCONFIG"'] } : {}),
          },
        },
        // The bearer token `npmRegistryLoginCommands` writes into the temporary npm config; resolved
        // by CodeBuild at container start, not read via a shell `aws secretsmanager` call.
        ...(npmRegistry ? { env: { 'secrets-manager': { NPM_AUTH_TOKEN: npmRegistry.basicAuthSecretArn } } } : {}),
      }),
    });

    // The deploy build runs `cdk deploy` per target, which does everything through the CDK bootstrap
    // roles -- so the project's role needs permission to assume them in EACH target's account/region (plus
    // any forced deployer role). This mirrors the CI engine's grantDeployPermissions. Repo 2 repeats
    // the image's qualifier/synthesizer identity so this pipeline can name the same bootstrap and
    // bootstrap roles without inspecting the image at synth time.
    const roleArns = new Set<string>();
    const versionParams = new Set<string>();
    for (const effectiveTarget of effectiveTargets) {
      const { target, account, regions } = effectiveTarget;
      for (const region of regions) {
        for (const kind of BOOTSTRAP_ROLE_KINDS) {
          roleArns.add(
            `arn:${stack.partition}:iam::${account}:role/cdk-${qualifier}-${kind}-role-${account}-${region}`,
          );
        }
        versionParams.add(
          `arn:${stack.partition}:ssm:${region}:${account}:parameter/cdk-bootstrap/${qualifier}/version`,
        );
        // CDK specializes configured role placeholders independently for every target stack.
        const forced = target.deployment?.deployRole?.trim();
        if (forced !== undefined && forced.length > 0) {
          const targetPartition = RegionInfo.get(region).partition;
          if (targetPartition === undefined) {
            throw new Error(
              `cdk-cicd: deployment target '${target.stage}' uses region '${region}', whose AWS ` +
                'partition is not known to this aws-cdk-lib version.',
            );
          }
          roleArns.add(
            specializeDefaultSynthesizerRoleArn(forced, {
              qualifier,
              account,
              region,
              partition: targetPartition,
            }),
          );
        }
      }
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
          actions: [
            'ecr:BatchCheckLayerAvailability',
            'ecr:BatchGetImage',
            'ecr:DescribeImages',
            'ecr:GetDownloadUrlForLayer',
          ],
          resources: [...ecrRepositories.values()].map(
            (repository) =>
              `arn:${repository.partition}:ecr:${repository.region}:${repository.account}:repository/${repository.repositoryName}`,
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
      const encryptionKeyArn = npmRegistry.encryptionKeyArn;
      if (encryptionKeyArn !== undefined && encryptionKeyArn.length > 0) {
        project.addToRolePolicy(
          new iam.PolicyStatement({
            actions: ['kms:Decrypt'],
            resources: [encryptionKeyArn],
          }),
        );
      }
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

    // Render the exact plan used by quota validation. A gate always precedes every later target, while only
    // adjacent ungated targets are grouped into the same parallel CodePipeline stage.
    for (const deploymentStage of deploymentStages) {
      const approvalTarget = deploymentStage.approvalTarget;
      pipeline.addStage({
        stageName: deploymentStage.name,
        actions:
          approvalTarget === undefined
            ? deploymentStage.targets.flatMap((target) => actionsForTarget(target))
            : [
                new actions.ManualApprovalAction({
                  actionName: `Approve-${approvalTarget.stage}`,
                  runOrder: 1,
                }),
                ...actionsForTarget(approvalTarget, 2),
              ],
      });
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
 * Writes generic-registry credentials to the temporary npm config.
 */
function npmRegistryLoginCommands(npm: NpmRegistryConfig): string[] {
  const host = npm.url.replace(/^https?:\/\//, '');
  const scope = npm.scope !== undefined && npm.scope.length > 0 ? npm.scope : undefined;
  const scopePrefix = scope !== undefined ? `${scope.startsWith('@') ? scope : `@${scope}`}:` : '';
  return [
    `echo "${scopePrefix}registry=${npm.url}" > "$NPM_CONFIG_USERCONFIG"`,
    `echo "//${host}:_authToken=$NPM_AUTH_TOKEN" >> "$NPM_CONFIG_USERCONFIG"`,
  ];
}

/** Create the credential file outside the source checkout with owner-only permissions. */
function npmConfigSetupCommands(): string[] {
  return [
    `export NPM_CONFIG_USERCONFIG="${PRIVATE_NPM_CONFIG_PATH}"`,
    'rm -f "$NPM_CONFIG_USERCONFIG"',
    'umask 077 && touch "$NPM_CONFIG_USERCONFIG"',
  ];
}

interface EcrRepository {
  readonly registryHost: string;
  readonly account: string;
  readonly partition: string;
  readonly region: string;
  readonly repositoryName: string;
  readonly tagOrDigest?: string;
}

interface EffectiveDeploymentTarget {
  readonly target: ResolvedDeploymentTarget;
  readonly account: string;
  readonly regions: string[];
  readonly regionOrder: RegionOrder;
}

interface DeploymentUnit {
  readonly target: ResolvedDeploymentTarget;
  /** Present only when a PARALLEL multi-region target is narrowed to one region. */
  readonly region?: string;
  readonly actionName: string;
  readonly stateParameterName: string;
}

interface DeploymentStagePlan {
  readonly name: string;
  readonly targets: readonly ResolvedDeploymentTarget[];
  /** Present only for a one-target stage that requires approval before its deployment action(s). */
  readonly approvalTarget?: ResolvedDeploymentTarget;
}

/** Resolve an omitted target account/region against the pipeline stack before creating topology or IAM. */
function resolveDeploymentTargetEnvironment(stack: Stack, target: ResolvedDeploymentTarget): EffectiveDeploymentTarget {
  const account =
    target.env.account === undefined
      ? concretePipelineEnvironmentValue(stack.account, 'account', `deployment target '${target.stage}'`)
      : concreteTargetEnvironmentValue(target.env.account, 'account', target.stage);
  const regions =
    target.env.regions.length === 0
      ? [concretePipelineEnvironmentValue(stack.region, 'region', `deployment target '${target.stage}'`)]
      : target.env.regions.map((region) => concreteTargetEnvironmentValue(region, 'region', target.stage));
  return {
    target,
    account,
    regions,
    regionOrder: target.env.regionOrder,
  };
}

function concretePipelineEnvironmentValue(value: string, field: 'account' | 'region', purpose: string): string {
  if (value.length === 0 || Token.isUnresolved(value)) {
    throw new Error(
      `cdk-cicd: ${purpose} needs a concrete ${field}, but the deployment pipeline stack's ${field} ` +
        `is unresolved. Set the pipeline stack env or provide target.env.${field}.`,
    );
  }
  return value;
}

function concreteTargetEnvironmentValue(value: string, field: 'account' | 'region', stage: string): string {
  if (value.length === 0 || Token.isUnresolved(value)) {
    throw new Error(
      `cdk-cicd: deployment target '${stage}' has an unresolved env.${field}; Repo 2 must know concrete ` +
        `${field} values when it builds deployment actions and bootstrap IAM.`,
    );
  }
  return value;
}

function validateDeploymentPartitions(stack: Stack, targets: readonly EffectiveDeploymentTarget[]): void {
  const pipelineRegion = concretePipelineEnvironmentValue(
    stack.region,
    'region',
    'the Repo 2 deployment pipeline partition validation',
  );
  const pipelinePartition = RegionInfo.get(pipelineRegion).partition;
  if (pipelinePartition === undefined) {
    throw new Error(
      `cdk-cicd: Repo 2 pipeline region '${pipelineRegion}' has no known AWS partition in this ` +
        'aws-cdk-lib version. Upgrade the wrapper/CDK before rendering the pipeline.',
    );
  }

  for (const target of targets) {
    for (const region of target.regions) {
      const targetPartition = RegionInfo.get(region).partition;
      if (targetPartition === undefined) {
        throw new Error(
          `cdk-cicd: deployment target '${target.target.stage}' uses region '${region}', whose AWS ` +
            'partition is not known to this aws-cdk-lib version. Upgrade the wrapper/CDK before using it.',
        );
      }
      if (targetPartition !== pipelinePartition) {
        throw new Error(
          `cdk-cicd: deployment target '${target.target.stage}' is in partition '${targetPartition}' ` +
            `(${region}), but the Repo 2 pipeline is in '${pipelinePartition}' (${pipelineRegion}). IAM ` +
            'role assumption and ECR authentication cannot cross AWS partitions; use a pipeline in the ' +
            'target partition.',
        );
      }
    }
  }
}

/** Expand only PARALLEL multi-region targets; every other target remains one sequential CLI invocation. */
function deploymentUnitsForTarget(
  stack: Stack,
  scope: Construct,
  effectiveTarget: EffectiveDeploymentTarget,
): DeploymentUnit[] {
  const { target, regions, regionOrder } = effectiveTarget;
  if (regionOrder === RegionOrder.PARALLEL && regions.length > 1) {
    return regions.map((region) => ({
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

/** Preserve target declaration order while grouping only adjacent ungated targets into parallel waves. */
function deploymentStagePlans(targets: readonly ResolvedDeploymentTarget[]): DeploymentStagePlan[] {
  const stages: DeploymentStagePlan[] = [];
  let ungatedTargets: ResolvedDeploymentTarget[] = [];
  const appendStage = (
    stageTargets: readonly ResolvedDeploymentTarget[],
    approvalTarget?: ResolvedDeploymentTarget,
  ): void => {
    stages.push({
      name: `Deploy-${stages.length + 1}`,
      targets: [...stageTargets],
      approvalTarget,
    });
  };
  const flushUngatedTargets = (): void => {
    if (ungatedTargets.length === 0) return;
    appendStage(ungatedTargets);
    ungatedTargets = [];
  };

  for (const target of targets) {
    if (target.manualApproval) {
      flushUngatedTargets();
      appendStage([target], target);
    } else {
      ungatedTargets.push(target);
    }
  }
  flushUngatedTargets();
  return stages;
}

/** Reject CodePipeline shapes that exceed fixed service quotas before any actions are rendered. */
function validateDeploymentTopology(
  deploymentStages: readonly DeploymentStagePlan[],
  deploymentUnits: readonly DeploymentUnit[],
): void {
  const unitsForTarget = (target: ResolvedDeploymentTarget) => deploymentUnits.filter((unit) => unit.target === target);
  const stages = [
    { name: 'Source', actionNames: ['Source'] },
    ...deploymentStages.map((stage) => ({
      name: stage.name,
      actionNames: [
        ...(stage.approvalTarget === undefined ? [] : [`Approve-${stage.approvalTarget.stage}`]),
        ...stage.targets.flatMap((target) => unitsForTarget(target).map((unit) => unit.actionName)),
      ],
    })),
  ];

  const duplicateStage = stages.find(
    (stage, index) => stages.findIndex((candidate) => candidate.name === stage.name) !== index,
  );
  if (duplicateStage !== undefined) {
    throw new Error(`cdk-cicd: generated duplicate CodePipeline stage name '${duplicateStage.name}'`);
  }
  for (const stage of stages) {
    validateCodePipelineIdentifier('stage', stage.name);
    for (const actionName of stage.actionNames) {
      validateCodePipelineIdentifier('action', actionName);
    }
    const duplicateAction = stage.actionNames.find(
      (actionName, index) => stage.actionNames.indexOf(actionName) !== index,
    );
    if (duplicateAction !== undefined) {
      throw new Error(
        `cdk-cicd: CodePipeline stage '${stage.name}' would contain duplicate action name ` +
          `'${duplicateAction}'. Rename the target stage or remove duplicate parallel regions.`,
      );
    }
  }

  const oversizedStage = stages.find((stage) => stage.actionNames.length > MAX_ACTIONS_PER_STAGE);
  if (oversizedStage !== undefined) {
    throw new Error(
      `cdk-cicd: CodePipeline stage '${oversizedStage.name}' would contain ${oversizedStage.actionNames.length} ` +
        `actions, exceeding the fixed ${MAX_ACTIONS_PER_STAGE}-action service quota. Reduce parallel regions ` +
        'or targets in that contiguous ungated wave, or split the deployment across pipelines.',
    );
  }
  if (stages.length > MAX_STAGES_PER_PIPELINE) {
    throw new Error(
      `cdk-cicd: the deployment pipeline would contain ${stages.length} stages, exceeding the fixed ` +
        `${MAX_STAGES_PER_PIPELINE}-stage service quota. Reduce approval barriers/ungated waves or split the ` +
        'deployment across pipelines.',
    );
  }
  const totalActions = stages.reduce((count, stage) => count + stage.actionNames.length, 0);
  if (totalActions > MAX_ACTIONS_PER_PIPELINE) {
    throw new Error(
      `cdk-cicd: the deployment pipeline would contain ${totalActions} actions, exceeding the fixed ` +
        `${MAX_ACTIONS_PER_PIPELINE}-action service quota. Reduce targets/regions or split the deployment ` +
        'across pipelines.',
    );
  }
}

function validateCodePipelineIdentifier(kind: 'stage' | 'action', name: string): void {
  if (!CODEPIPELINE_IDENTIFIER.test(name)) {
    throw new Error(
      `cdk-cicd: generated CodePipeline ${kind} name '${name}' must match ` +
        `${CODEPIPELINE_IDENTIFIER} (1-100 characters). Rename the deployment target stage.`,
    );
  }
}

function deploymentSynthesizer(config: ResolvedDeploymentConfig): NonNullable<ResolvedDeploymentConfig['synthesizer']> {
  return config.synthesizer ?? { type: SynthesizerType.DEFAULT };
}

function deploymentRepositoryIdentity(repository: ResolvedDeploymentConfig['repository']): unknown {
  if (repository === undefined) return null;
  const base = {
    type: repository.repositoryType,
    name: repository.name,
  };
  switch (repository.repositoryType) {
    case 'codecommit':
      return {
        ...base,
        branch: repository.branch ?? 'main',
        existing: repository.existing ?? false,
      };
    case 'github':
    case 'codestar_connection':
      return {
        ...base,
        branch: repository.branch ?? 'main',
        connectionArn: repository.connectionArn ?? null,
      };
    case 's3':
      return base;
    default:
      return {
        ...base,
        branch: repository.branch ?? null,
        connectionArn: repository.connectionArn ?? null,
        existing: repository.existing ?? null,
      };
  }
}

/**
 * Hash every deploy.config field that changes the synthesized CD pipeline: action topology, IAM,
 * registry login, and the deployer image's bootstrap/app-staging identity. Image tags/digests and
 * application config versions remain runtime inputs and are handled by the per-target fingerprint.
 */
function deploymentPipelineShapeFingerprint(
  config: ResolvedDeploymentConfig,
  effectiveTargets: readonly EffectiveDeploymentTarget[],
  partition: string,
  qualifier: string,
): string {
  const synthesizer = deploymentSynthesizer(config);
  const ecrRepositoryIdentity = (image: string | undefined) => {
    const repository = image === undefined ? undefined : parseEcrRepository(image);
    return repository === undefined
      ? null
      : {
          registryHost: repository.registryHost,
          account: repository.account,
          region: repository.region,
          repositoryName: repository.repositoryName,
        };
  };
  const roleIdentity = (roleArn: string | undefined, target: EffectiveDeploymentTarget): string | string[] | null => {
    const normalizedRoleArn = roleArn?.trim();
    if (normalizedRoleArn === undefined || normalizedRoleArn.length === 0) return normalizedRoleArn ?? null;
    return target.regions.map((region) =>
      specializeDefaultSynthesizerRoleArn(normalizedRoleArn, {
        qualifier,
        account: target.account,
        region,
        partition,
      }),
    );
  };
  const shape = {
    application: config.application ?? null,
    qualifier,
    repository: deploymentRepositoryIdentity(config.repository),
    synthesizer: {
      type: synthesizer.type,
      appId: synthesizer.appId ?? null,
    },
    crossAccountEcrRepositoryPolicyConfigured: config.crossAccountEcrRepositoryPolicyConfigured ?? false,
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
            encryptionKeyArn: config.npmRegistry.encryptionKeyArn ?? null,
            scope: config.npmRegistry.scope ?? null,
          },
    targets: effectiveTargets.map((effectiveTarget) => {
      const target = effectiveTarget.target;
      return {
        stage: target.stage,
        manualApproval: target.manualApproval,
        account: target.env.account ?? null,
        regions: target.env.regions,
        regionOrder: target.env.regionOrder,
        deployRole: roleIdentity(target.deployment?.deployRole, effectiveTarget),
        cfnExecutionRole: roleIdentity(target.deployment?.cfnExecutionRole, effectiveTarget),
        externalId: target.deployment?.externalId ?? null,
        ecrRepository: ecrRepositoryIdentity(target.image ?? config.image),
      };
    }),
  };
  return createHash('sha256')
    .update(JSON.stringify({ schema: 'container-deployment-pipeline-shape-v3', ...shape }))
    .digest('hex');
}

/**
 * Parse a private ECR image reference into the fields needed by `docker login`, repository-scoped IAM,
 * and CodeBuild custom-image binding. Nested repository paths and an optional tag/digest are preserved.
 */
function parseEcrRepository(image: string): EcrRepository | undefined {
  const firstSlash = image.indexOf('/');
  if (firstSlash < 1) return undefined;

  const registryHost = image.slice(0, firstSlash);
  const registry = /^([0-9]{12})\.dkr\.ecr(?:-fips)?\.([a-z0-9-]+)\.(.+)$/.exec(registryHost);
  if (registry === null) return undefined;
  const regionInfo = RegionInfo.get(registry[2]);
  const expectedSuffix = regionInfo.domainSuffix;
  const partition = regionInfo.partition;
  if (expectedSuffix === undefined || partition === undefined) {
    throw new Error(
      `cdk-cicd: ECR image '${image}' uses region '${registry[2]}', whose partition/domain suffix is ` +
        'not known to this aws-cdk-lib version. Upgrade the wrapper/CDK before using this image.',
    );
  }
  if (registry[3] !== expectedSuffix) {
    throw new Error(
      `cdk-cicd: ECR image '${image}' has registry suffix '${registry[3]}', but region '${registry[2]}' ` +
        `belongs to partition '${partition}' and requires '${expectedSuffix}'.`,
    );
  }

  const imagePath = image.slice(firstSlash + 1);
  const digestSeparator = imagePath.indexOf('@');
  const lastSlash = imagePath.lastIndexOf('/');
  const tagSeparator = imagePath.lastIndexOf(':');
  const repositoryName =
    digestSeparator >= 0
      ? imagePath.slice(0, digestSeparator)
      : tagSeparator > lastSlash
        ? imagePath.slice(0, tagSeparator)
        : imagePath;
  if (repositoryName.length === 0) return undefined;
  const tagOrDigest =
    digestSeparator >= 0
      ? imagePath.slice(digestSeparator + 1)
      : tagSeparator > lastSlash
        ? imagePath.slice(tagSeparator + 1)
        : undefined;

  return {
    registryHost,
    account: registry[1],
    partition,
    region: registry[2],
    repositoryName,
    tagOrDigest,
  };
}

function validateEcrRepositoryAccount(
  scope: Construct,
  stack: Stack,
  repository: EcrRepository,
  image: string,
  ownerPolicyAcknowledged: boolean,
): void {
  const pipelineAccount = concretePipelineEnvironmentValue(stack.account, 'account', `ECR image '${image}'`);
  const pipelineRegion = concretePipelineEnvironmentValue(stack.region, 'region', `ECR image '${image}'`);
  const pipelinePartition = RegionInfo.get(pipelineRegion).partition;
  if (pipelinePartition === undefined) {
    throw new Error(
      `cdk-cicd: Repo 2 pipeline region '${pipelineRegion}' has no known AWS partition in this ` +
        'aws-cdk-lib version. Upgrade the wrapper/CDK before using private ECR images.',
    );
  }
  if (repository.partition !== pipelinePartition) {
    throw new Error(
      `cdk-cicd: ECR image '${image}' is in partition '${repository.partition}', but the Repo 2 ` +
        `pipeline is in '${pipelinePartition}'. ECR authentication and IAM cannot cross AWS partitions; ` +
        'mirror the image into the pipeline partition.',
    );
  }
  if (repository.account === pipelineAccount) return;

  if (!ownerPolicyAcknowledged) {
    throw new Error(
      `cdk-cicd: ECR image '${image}' belongs to account '${repository.account}', while the Repo 2 ` +
        `pipeline runs in '${pipelineAccount}'. Cross-account pulls require an owner-side ECR repository ` +
        'policy that this construct cannot create or verify from an image URI. Configure that policy, then ' +
        'set crossAccountEcrRepositoryPolicyConfigured: true, or mirror the image into the pipeline account.',
    );
  }

  const repositoryArn =
    `arn:${repository.partition}:ecr:${repository.region}:${repository.account}:` +
    `repository/${repository.repositoryName}`;
  Annotations.of(scope).addWarningV2(
    `cdk-cicd:cross-account-ecr-${createHash('sha256').update(repositoryArn).digest('hex').slice(0, 12)}`,
    `cdk-cicd: cross-account ECR access acknowledged for ${repositoryArn}. This stack grants the Repo 2 ` +
      'CodeBuild role identity-side pull permissions only; keep the owner-account repository policy ' +
      'granting that generated role/account ecr:BatchCheckLayerAvailability, ecr:BatchGetImage, ' +
      'ecr:DescribeImages, and ecr:GetDownloadUrlForLayer.',
  );
}

function deploymentBuildImage(
  scope: Construct,
  stack: Stack,
  image: string | undefined,
  ownerPolicyAcknowledged: boolean,
): codebuild.IBuildImage | undefined {
  if (image === undefined) return undefined;
  if (image.startsWith('aws/codebuild/')) {
    return codebuild.LinuxBuildImage.fromCodeBuildImageId(image);
  }

  const repository = parseEcrRepository(image);
  if (repository === undefined) {
    return codebuild.LinuxBuildImage.fromDockerRegistry(image);
  }
  const pipelineRegion = concretePipelineEnvironmentValue(stack.region, 'region', `ECR build image '${image}'`);
  if (repository.region !== pipelineRegion) {
    throw new Error(
      `cdk-cicd: ECR build image '${image}' is in '${repository.region}', but the Repo 2 CodeBuild ` +
        `project is in '${pipelineRegion}'. CodeBuild custom ECR images must be in the same region; ` +
        'replicate or mirror the build image into the pipeline region.',
    );
  }
  validateEcrRepositoryAccount(scope, stack, repository, image, ownerPolicyAcknowledged);
  const importedRepository = ecr.Repository.fromRepositoryAttributes(scope, 'DeployBuildImageRepository', {
    repositoryName: repository.repositoryName,
    repositoryArn:
      `arn:${repository.partition}:ecr:${repository.region}:${repository.account}:` +
      `repository/${repository.repositoryName}`,
  });
  return codebuild.LinuxBuildImage.fromEcrRepository(importedRepository, repository.tagOrDigest);
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
 * deploy executor: a missing file means "use the configured image reference as-is", while malformed
 * JSON and invalid version values fail before the unchanged-target shortcut can hide them.
 */
function deploymentFingerprintScript(
  effectiveTargets: readonly EffectiveDeploymentTarget[],
  partition: string,
  qualifier: string,
): string {
  const targetEnvironments = Object.fromEntries(
    effectiveTargets.map((target) => [
      target.target.stage,
      {
        account: target.account,
        regions: target.regions,
      },
    ]),
  );
  return [
    'const { execFileSync } = require("child_process");',
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
    `const EFFECTIVE_QUALIFIER = ${JSON.stringify(qualifier)};`,
    `const PIPELINE_PARTITION = ${JSON.stringify(partition)};`,
    `const EXPECTED_TARGET_ENVIRONMENTS = ${JSON.stringify(targetEnvironments)};`,
    'const replaceAll = (value, search, replacement) => value.split(search).join(replacement);',
    'const specializeRoleArn = (roleArn, account, region) => {',
    '  let specialized = replaceAll(roleArn, "${Qualifier}", config.qualifier ?? EFFECTIVE_QUALIFIER);',
    '  specialized = replaceAll(specialized, "${AWS::AccountId}", account);',
    '  specialized = replaceAll(specialized, "${AWS::Region}", region);',
    '  return replaceAll(specialized, "${AWS::Partition}", PIPELINE_PARTITION);',
    '};',
    'const roleIdentity = (roleArn, target) => {',
    '  const normalizedRoleArn = roleArn?.trim();',
    '  if (normalizedRoleArn === undefined || normalizedRoleArn.length === 0) return normalizedRoleArn ?? null;',
    '  const expectedEnvironment = EXPECTED_TARGET_ENVIRONMENTS[target.stage];',
    '  const account = target.env.account ?? expectedEnvironment?.account;',
    '  const regions = target.env.regions.length > 0 ? target.env.regions : expectedEnvironment?.regions;',
    '  if (account === undefined || regions === undefined) return [];',
    '  return regions.map((region) => specializeRoleArn(normalizedRoleArn, account, region));',
    '};',
    'const parseEcrImage = (image) => {',
    '  if (typeof image !== "string") return null;',
    '  const firstSlash = image.indexOf("/");',
    '  if (firstSlash < 1) return null;',
    '  const registryHost = image.slice(0, firstSlash);',
    '  const registry = /^([0-9]{12})\\.dkr\\.ecr(?:-fips)?\\.([a-z0-9-]+)\\..+$/.exec(registryHost);',
    '  if (registry === null) return null;',
    '  const imagePath = image.slice(firstSlash + 1);',
    '  const digestSeparator = imagePath.indexOf("@");',
    '  const lastSlash = imagePath.lastIndexOf("/");',
    '  const tagSeparator = imagePath.lastIndexOf(":");',
    '  const repositoryName =',
    '    digestSeparator >= 0',
    '      ? imagePath.slice(0, digestSeparator)',
    '      : tagSeparator > lastSlash',
    '        ? imagePath.slice(0, tagSeparator)',
    '        : imagePath;',
    '  if (repositoryName.length === 0) return null;',
    '  return {',
    '    registryHost,',
    '    account: registry[1],',
    '    region: registry[2],',
    '    repositoryName,',
    '    imageDigest: digestSeparator >= 0 ? imagePath.slice(digestSeparator + 1) : null,',
    '    imageTag:',
    '      digestSeparator < 0 && tagSeparator > lastSlash ? imagePath.slice(tagSeparator + 1) : null,',
    '  };',
    '};',
    'const ecrRepositoryIdentity = (image) => {',
    '  const parsed = parseEcrImage(image);',
    '  return parsed === null',
    '    ? null',
    '    : {',
    '        registryHost: parsed.registryHost,',
    '        account: parsed.account,',
    '        region: parsed.region,',
    '        repositoryName: parsed.repositoryName,',
    '      };',
    '};',
    'const resolveEffectiveImage = (target, version) => {',
    '  if (target.image?.includes("@")) return target.image;',
    '  const base = target.image ?? config.image;',
    '  if (base === undefined || version === null) return base;',
    '  if (base.includes("@")) {',
    '    throw new Error(',
    '      "cdk-cicd deploy --from-image: image " + base + " is pinned by digest and cannot be combined " +',
    '        "with config/" + target.stage + ".json version " + version +',
    '        "; remove the separate version or use a tag-based image",',
    '    );',
    '  }',
    '  const lastSlash = base.lastIndexOf("/");',
    '  const lastColon = base.lastIndexOf(":");',
    '  const repository = lastColon > lastSlash ? base.slice(0, lastColon) : base;',
    '  return repository + ":" + version;',
    '};',
    'const immutableEcrImageIdentity = (image) => {',
    '  const parsed = parseEcrImage(image);',
    '  if (parsed === null) return null;',
    '  let imageDigest = parsed.imageDigest;',
    '  if (imageDigest === null) {',
    '    const imageTag = parsed.imageTag ?? "latest";',
    '    try {',
    '      imageDigest = execFileSync(',
    '        "aws",',
    '        [',
    '          "ecr",',
    '          "describe-images",',
    '          "--registry-id",',
    '          parsed.account,',
    '          "--repository-name",',
    '          parsed.repositoryName,',
    '          "--image-ids",',
    '          "imageTag=" + imageTag,',
    '          "--query",',
    '          "imageDetails[0].imageDigest",',
    '          "--output",',
    '          "text",',
    '          "--region",',
    '          parsed.region,',
    '          "--no-cli-pager",',
    '        ],',
    '        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },',
    '      ).trim();',
    '    } catch (error) {',
    '      const detail = error.stderr?.toString().trim() || error.message;',
    '      throw new Error(',
    '        "cdk-cicd: could not resolve immutable ECR digest for " + image + ": " + detail,',
    '      );',
    '    }',
    '  }',
    '  if (!/^sha256:[0-9a-f]{64}$/.test(imageDigest)) {',
    '    throw new Error("cdk-cicd: ECR returned an invalid image digest for " + image + ": " + imageDigest);',
    '  }',
    '  return {',
    '    registryHost: parsed.registryHost,',
    '    account: parsed.account,',
    '    region: parsed.region,',
    '    repositoryName: parsed.repositoryName,',
    '    imageDigest,',
    '  };',
    '};',
    'const repositoryIdentity = (repository) => {',
    '  if (repository === undefined) return null;',
    '  const base = { type: repository.repositoryType, name: repository.name };',
    '  switch (repository.repositoryType) {',
    '    case "codecommit":',
    '      return { ...base, branch: repository.branch ?? "main", existing: repository.existing ?? false };',
    '    case "github":',
    '    case "codestar_connection":',
    '      return {',
    '        ...base,',
    '        branch: repository.branch ?? "main",',
    '        connectionArn: repository.connectionArn ?? null,',
    '      };',
    '    case "s3":',
    '      return base;',
    '    default:',
    '      return {',
    '        ...base,',
    '        branch: repository.branch ?? null,',
    '        connectionArn: repository.connectionArn ?? null,',
    '        existing: repository.existing ?? null,',
    '      };',
    '  }',
    '};',
    'const synthesizer = config.synthesizer ?? { type: "default" };',
    'const pipelineShape = {',
    '  application: config.application ?? null,',
    '  qualifier: config.qualifier ?? EFFECTIVE_QUALIFIER,',
    '  repository: repositoryIdentity(config.repository),',
    '  synthesizer: { type: synthesizer.type, appId: synthesizer.appId ?? null },',
    '  crossAccountEcrRepositoryPolicyConfigured:',
    '    config.crossAccountEcrRepositoryPolicyConfigured ?? false,',
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
    '          encryptionKeyArn: config.npmRegistry.encryptionKeyArn ?? null,',
    '          scope: config.npmRegistry.scope ?? null,',
    '        },',
    '  targets: config.targets.map((candidate) => ({',
    '    stage: candidate.stage,',
    '    manualApproval: candidate.manualApproval,',
    '    account: candidate.env.account ?? null,',
    '    regions: candidate.env.regions,',
    '    regionOrder: candidate.env.regionOrder,',
    '    deployRole: roleIdentity(candidate.deployment?.deployRole, candidate),',
    '    cfnExecutionRole: roleIdentity(candidate.deployment?.cfnExecutionRole, candidate),',
    '    externalId: candidate.deployment?.externalId ?? null,',
    '    ecrRepository: ecrRepositoryIdentity(candidate.image ?? config.image),',
    '  })),',
    '};',
    'const currentTopology = crypto',
    '  .createHash("sha256")',
    '  .update(JSON.stringify({ schema: "container-deployment-pipeline-shape-v3", ...pipelineShape }))',
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
    '  let document;',
    '  try {',
    '    document = JSON.parse(fs.readFileSync(versionFile, "utf8"));',
    '  } catch (error) {',
    '    throw new Error(',
    '      "cdk-cicd deploy --from-image: " + versionFile + " exists but could not be read as JSON (" +',
    '        error.message + ")",',
    '    );',
    '  }',
    '  const candidate =',
    '    document !== null && typeof document === "object" && !Array.isArray(document)',
    '      ? document.version',
    '      : undefined;',
    '  if (typeof candidate !== "string" || candidate.length === 0 || candidate.trim() !== candidate) {',
    '    throw new Error(',
    '      "cdk-cicd deploy --from-image: " + versionFile +',
    '        " must contain a non-empty string version field with no surrounding whitespace",',
    '    );',
    '  }',
    '  version = candidate;',
    '}',
    'const effectiveImage = resolveEffectiveImage(target, version);',
    'const immutableEcrImage = immutableEcrImageIdentity(effectiveImage);',
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
    '  ...(immutableEcrImage === null ? {} : { immutableEcrImage }),',
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
