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
import * as events from 'aws-cdk-lib/aws-events';
import * as eventTargets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { RegionInfo } from 'aws-cdk-lib/region-info';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { deploymentPipelineShapeFingerprint, EcrRepositoryReference, parseEcrRepository } from './deployment-shape';
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
import { NODE_RUNTIME_VERSION } from '../ci-commands';
import { deployRoleExternalIdSecretArnsForStages } from '../external-id-secrets';

/** Kept outside CODEBUILD_SRC_DIR so registry credentials cannot enter or modify the config checkout. */
const PRIVATE_NPM_CONFIG_PATH = '/tmp/cdk-cicd-npmrc';
/** The CDK bootstrap roles `cdk deploy` assumes (same set the CI engine grants). */
const BOOTSTRAP_ROLE_KINDS = ['deploy', 'file-publishing', 'image-publishing', 'lookup'];
/** Fixed CodePipeline service quotas that cannot be raised. */
const MAX_ACTIONS_PER_STAGE = 100;
const MAX_ACTIONS_PER_PIPELINE = 1_000;
const MAX_STAGES_PER_PIPELINE = 50;
const CODEPIPELINE_IDENTIFIER = /^[A-Za-z0-9.@_-]{1,100}$/;
/** Variable namespace of the Plan action; deployment stages' entry conditions read from it. */
const PLAN_NAMESPACE = 'Plan';
/** Plan exports `<prefix><n>` = `true` | `false` for deployment stage `Deploy-<n>`. */
const PLAN_VARIABLE_PREFIX = 'CDK_CICD_RUN_';
/** Where `cdk-cicd pipeline plan` writes its `NAME=true|false` lines inside the Plan build. */
const PLAN_OUTPUT_PATH = '/tmp/cdk-cicd-plan.env';

/** The Plan variable that decides whether the deployment stage at `index` runs. */
function planVariableName(index: number): string {
  return `${PLAN_VARIABLE_PREFIX}${index + 1}`;
}

/**
 * An entry condition that enters the stage only when Plan exported `true` for it. CodePipeline skips
 * the stage when the rule fails -- a Skip result supports only VariableCheck and LambdaInvoke rules.
 */
function skipUnlessChanged(stageName: string, variable: string): codepipeline.Conditions {
  return {
    conditions: [
      {
        result: codepipeline.Result.SKIP,
        rules: [
          new codepipeline.Rule({
            name: `Changed-${stageName}`,
            provider: 'VariableCheck',
            version: '1',
            configuration: {
              Variable: `#{${PLAN_NAMESPACE}.${variable}}`,
              Value: 'true',
              Operator: 'EQ',
            },
          }),
        ],
      },
    ],
  };
}

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
  /** One pipeline per `autoDeploy` target, started by pushes to that target's ECR repository. */
  public readonly autoDeployPipelines: codepipeline.Pipeline[];

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
    const targetEnvironments = Object.fromEntries(
      effectiveTargets.map(({ target, account, regions }) => [target.stage, { account, regions }]),
    );
    const expectedDeploymentTopology = deploymentPipelineShapeFingerprint(
      config,
      targetEnvironments,
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
    const ecrRepositories = new Map<string, EcrRepositoryReference>();
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
    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      artifactBucket: support.artifactBucket,
      // Stage entry conditions, which skip unchanged targets, exist only on V2 pipelines.
      pipelineType: codepipeline.PipelineType.V2,
    });

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

    // Install steps shared by the Plan and Deploy builds: private-registry login, then `npm ci` installs
    // the wrapper CLI pinned by the deploy repository's lockfile. The fingerprint logic lives in that
    // CLI (`cdk-cicd pipeline plan|fingerprint`), so the builds log one short command, not its code.
    const installCommands = [
      ...(privateNpm ? npmConfigSetupCommands() : []),
      ...codeArtifactLogin,
      ...npmRegistryLogin,
      'npm ci',
      ...(privateNpm ? ['rm -f "$NPM_CONFIG_USERCONFIG"', 'unset NPM_AUTH_TOKEN'] : []),
    ];
    // What the CLI needs to check the checked-out deploy.config against this pipeline's shape. Constant
    // per pipeline, so it is set on the projects instead of appearing in any logged command.
    const fingerprintEnvironment: { [name: string]: codebuild.BuildEnvironmentVariable } = {
      EXPECTED_DEPLOYMENT_TOPOLOGY: { value: expectedDeploymentTopology },
      CDK_CICD_TARGET_ENVIRONMENTS: { value: JSON.stringify(targetEnvironments) },
      CDK_CICD_QUALIFIER: { value: qualifier },
      CDK_CICD_PARTITION: { value: pipelinePartition },
    };
    const regionFlag = '${TARGET_REGION:+--region "$TARGET_REGION"}';
    const deployTarget = `npm run cdk-cicd -- deploy --from-image --target "$TARGET_STAGE" ${regionFlag} --yes`;
    const fingerprintCommand =
      `npm run --silent cdk-cicd -- pipeline fingerprint --target "$TARGET_STAGE" ${regionFlag} ` +
      '--out /tmp/cdk-cicd-target-fingerprint && TARGET_FINGERPRINT=$(cat /tmp/cdk-cicd-target-fingerprint)';
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
    // A target can be deployed by two pipelines (the main one and its autoDeploy pipeline). When both
    // reach CloudFormation at once, one fails because the other's update is in progress; that run waits
    // and retries, re-resolving its image, instead of leaving the target on a stale version. Any other
    // failure exits immediately. One buildspec element, because CodeBuild parses each separately.
    const deployAndRecord = [
      'attempt=1',
      'while :; do',
      '  {',
      `    ${deployTarget}`,
      '    echo $? > /tmp/cdk-cicd-deploy-rc',
      '  } 2>&1 | tee /tmp/cdk-cicd-deploy.log',
      '  rc=$(cat /tmp/cdk-cicd-deploy-rc)',
      '  [ "$rc" -eq 0 ] && break',
      // CloudFormation reports the collision either as a stack `*_IN_PROGRESS` status or, when the
      // other deploy replaced CDK's shared `cdk-deploy-change-set`, as that change set not existing.
      '  if [ "$attempt" -lt 3 ] && grep -qE "_IN_PROGRESS|ChangeSet .*does not exist" /tmp/cdk-cicd-deploy.log; then',
      '    echo "cdk-cicd: another deployment of $TARGET_STAGE is in progress; retrying in 60s (attempt $attempt)"',
      '    attempt=$((attempt + 1))',
      '    sleep 60',
      '    continue',
      '  fi',
      '  exit "$rc"',
      'done',
      'aws ssm put-parameter --name "$TARGET_STATE_PARAMETER" --type String ' +
        '--value "$TARGET_FINGERPRINT" --overwrite >/dev/null',
    ].join('\n');
    // CodeBuild runs each buildspec command as its own script: `exit 0` ends only that entry and the
    // phase carries on with the next one, so a skip can never be an exit. A skip sets CDK_CICD_SKIP
    // instead (shell variables persist between entries, like TARGET_FINGERPRINT), and every later entry
    // runs only while it is unset.
    const unlessSkipped = (command: string) => `if [ -z "\${CDK_CICD_SKIP:-}" ]; then\n${command}\nfi`;
    // An autoDeploy pipeline's creation run (CodePipeline starts every new pipeline once) would race the
    // main pipeline's first deployment of the same target, so it is skipped. The starting pipeline is
    // in CODEBUILD_INITIATOR (`codepipeline/<name>`); only autoDeploy actions set AUTO_DEPLOY.
    const skipCreationRun = [
      'if [ "${AUTO_DEPLOY:-}" = "1" ]; then',
      '  TRIGGER=$(aws codepipeline get-pipeline-execution --pipeline-name "${CODEBUILD_INITIATOR#codepipeline/}" ' +
        '--pipeline-execution-id "$PIPELINE_EXECUTION_ID" --query "pipelineExecution.trigger.triggerType" --output text)',
      '  if [ "$TRIGGER" = "CreatePipeline" ]; then',
      '    echo "cdk-cicd: skipping the creation run of the autoDeploy pipeline for $TARGET_STAGE"',
      '    CDK_CICD_SKIP=1',
      '  fi',
      'fi',
    ].join('\n');
    // The Plan stage already skips an unchanged target's whole stage. This re-check, right before the
    // deploy, covers what happened since Plan ran: the autoDeploy pipeline, or another execution, may
    // have deployed the same inputs while an approval was pending.
    const skipUnchanged =
      'if [ "$PREVIOUS_TARGET_FINGERPRINT" = "$TARGET_FINGERPRINT" ]; then ' +
      'echo "cdk-cicd: target $TARGET_STAGE is unchanged; skipping deployment"; CDK_CICD_SKIP=1; fi';
    const hasAutoDeploy = config.targets.some((target) => target.autoDeploy === true);
    // The deployer container gets the CodeBuild role's credentials through the container-credentials
    // endpoint (`deploy --from-image` forwards AWS_CONTAINER_CREDENTIALS_RELATIVE_URI by name), so no
    // access key is ever materialized into this build's shell environment.
    const commands = [
      ...(hasAutoDeploy ? [skipCreationRun] : []),
      ...[
        ...installCommands,
        fingerprintCommand,
        'if [ "${#TARGET_FINGERPRINT}" -ne 64 ] || printf "%s" "$TARGET_FINGERPRINT" | grep -q "[^0-9a-f]"; then ' +
          'echo "cdk-cicd: could not compute a valid target fingerprint" >&2; exit 1; fi',
        readPreviousFingerprint,
        skipUnchanged,
        ...ecrLoginCommands,
        deployAndRecord,
      ].map(unlessSkipped),
    ];
    // The bearer token `npmRegistryLoginCommands` writes into the temporary npm config; resolved by
    // CodeBuild at container start, not read via a shell `aws secretsmanager` call.
    const npmTokenEnv = npmRegistry ? { 'secrets-manager': { NPM_AUTH_TOKEN: npmRegistry.basicAuthSecretArn } } : {};
    const installPhase =
      props.buildImage === undefined ? { install: { 'runtime-versions': { nodejs: NODE_RUNTIME_VERSION } } } : {};
    const project = new codebuild.PipelineProject(this, 'Deploy', {
      environment: {
        buildImage,
        privileged: true,
        environmentVariables: fingerprintEnvironment,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          ...installPhase,
          build: {
            commands,
            ...(privateNpm ? { finally: ['rm -f "$NPM_CONFIG_USERCONFIG"'] } : {}),
          },
        },
        ...(npmRegistry ? { env: npmTokenEnv } : {}),
      }),
    });

    // The Plan build fingerprints every target once, right after Source, and exports one variable per
    // deployment stage: `true` when any of the stage's deployment units changed. Each stage's entry
    // condition skips the stage -- its approval included -- when its variable is not `true`. Plan
    // marks a unit it cannot fingerprint as changed, so the stage runs and its deploy action reports
    // the real error; only a pipeline-shape mismatch fails Plan itself.
    const stagePlans = deploymentStages.map((deploymentStage, index) => ({
      variable: planVariableName(index),
      stage: deploymentStage.name,
      units: deploymentStage.targets.flatMap((target) =>
        deploymentUnits
          .filter((unit) => unit.target === target)
          .map((unit) => ({
            target: unit.target.stage,
            ...(unit.region !== undefined ? { region: unit.region } : {}),
            parameter: unit.stateParameterName,
          })),
      ),
    }));
    const planProject = new codebuild.PipelineProject(this, 'Plan', {
      environment: {
        buildImage,
        environmentVariables: {
          ...fingerprintEnvironment,
          CDK_CICD_PLAN: { value: JSON.stringify(stagePlans) },
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          ...installPhase,
          build: {
            commands: [
              ...installCommands,
              `npm run --silent cdk-cicd -- pipeline plan --out ${PLAN_OUTPUT_PATH}`,
              `if grep -qvE "^${PLAN_VARIABLE_PREFIX}[0-9]+=(true|false)$" ${PLAN_OUTPUT_PATH}; then ` +
                'echo "cdk-cicd: malformed plan output" >&2; exit 1; fi',
              `set -a; . ${PLAN_OUTPUT_PATH}; set +a`,
            ],
            ...(privateNpm ? { finally: ['rm -f "$NPM_CONFIG_USERCONFIG"'] } : {}),
          },
        },
        env: {
          ...npmTokenEnv,
          'exported-variables': stagePlans.map((stagePlan) => stagePlan.variable),
        },
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
      // Plan only resolves tags and the newest autoDeploy image to digests; it never pulls.
      planProject.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['ecr:DescribeImages'],
          resources: [...ecrRepositories.values()].map(
            (repository) =>
              `arn:${repository.partition}:ecr:${repository.region}:${repository.account}:repository/${repository.repositoryName}`,
          ),
        }),
      );
    }
    // Both builds run `npm ci`, so both need the registry read and token permissions.
    const addInstallPolicy = (statement: iam.PolicyStatement) => {
      project.addToRolePolicy(statement);
      planProject.addToRolePolicy(statement);
    };
    // CodeArtifact read for the build's `npm ci` (pre-release CLI install).
    if (ca) {
      const caAccount = ca.account ?? stack.account;
      const caRegion = ca.region ?? stack.region;
      addInstallPolicy(
        new iam.PolicyStatement({
          actions: ['codeartifact:GetAuthorizationToken'],
          resources: [`arn:${stack.partition}:codeartifact:${caRegion}:${caAccount}:domain/${ca.domain}`],
        }),
      );
      addInstallPolicy(
        new iam.PolicyStatement({
          actions: ['codeartifact:GetRepositoryEndpoint', 'codeartifact:ReadFromRepository'],
          resources: [
            `arn:${stack.partition}:codeartifact:${caRegion}:${caAccount}:repository/${ca.domain}/${ca.repository}`,
          ],
        }),
      );
      addInstallPolicy(
        new iam.PolicyStatement({
          actions: ['sts:GetServiceBearerToken'],
          resources: ['*'],
          conditions: { StringEquals: { 'sts:AWSServiceName': 'codeartifact.amazonaws.com' } },
        }),
      );
    }
    // The private-registry bearer token `npmRegistryLoginCommands` resolves via Secrets Manager.
    if (npmRegistry) {
      addInstallPolicy(
        new iam.PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'],
          resources: [npmRegistry.basicAuthSecretArn],
        }),
      );
      const encryptionKeyArn = npmRegistry.encryptionKeyArn;
      if (encryptionKeyArn !== undefined && encryptionKeyArn.length > 0) {
        addInstallPolicy(
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
      const stateParameterArns = [...stateParameterNames.values()].map(
        (parameterName) => `arn:${stack.partition}:ssm:${stack.region}:${stack.account}:parameter${parameterName}`,
      );
      project.addToRolePolicy(
        new iam.PolicyStatement({ actions: ['ssm:GetParameter', 'ssm:PutParameter'], resources: stateParameterArns }),
      );
      // Plan reads what each unit last deployed; only a successful deploy action writes it.
      planProject.addToRolePolicy(
        new iam.PolicyStatement({ actions: ['ssm:GetParameter'], resources: stateParameterArns }),
      );
    }

    // Each deployment unit reads its target's OWN image version at run time. TARGET_REGION is present only
    // for a RegionOrder.PARALLEL fan-out action; `deploy --from-image --region` then deploys just that
    // region, through the same image resolution and docker contract as a sequential target.
    const deployAction = (
      unit: DeploymentUnit,
      runOrder?: number,
      input: codepipeline.Artifact = sourceOutput,
      autoDeploy = false,
    ) =>
      new actions.CodeBuildAction({
        actionName: unit.actionName,
        project,
        input,
        runOrder,
        environmentVariables: {
          TARGET_STAGE: { value: unit.target.stage },
          TARGET_STATE_PARAMETER: { value: unit.stateParameterName },
          ...(unit.region !== undefined ? { TARGET_REGION: { value: unit.region } } : {}),
          ...(autoDeploy
            ? {
                AUTO_DEPLOY: { value: '1' },
                PIPELINE_EXECUTION_ID: { value: '#{codepipeline.PipelineExecutionId}' },
              }
            : {}),
        },
      });
    const actionsForTarget = (target: ResolvedDeploymentTarget, runOrder?: number) =>
      deploymentUnits.filter((unit) => unit.target === target).map((unit) => deployAction(unit, runOrder));

    // Render the exact plan used by quota validation. A gate always precedes every later target, while only
    // adjacent ungated targets are grouped into the same parallel CodePipeline stage. Every deployment
    // stage is entered only when Plan found a change in it; otherwise CodePipeline marks it Skipped and
    // runs none of its actions, so nobody is asked to approve a no-op. `alwaysApprove` keeps the gate.
    pipeline.addStage({
      stageName: 'Plan',
      actions: [
        new actions.CodeBuildAction({
          actionName: 'Plan',
          project: planProject,
          input: sourceOutput,
          variablesNamespace: PLAN_NAMESPACE,
        }),
      ],
    });
    deploymentStages.forEach((deploymentStage, index) => {
      const approvalTarget = deploymentStage.approvalTarget;
      pipeline.addStage({
        stageName: deploymentStage.name,
        ...(approvalTarget?.alwaysApprove === true
          ? {}
          : { beforeEntry: skipUnlessChanged(deploymentStage.name, planVariableName(index)) }),
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
    });

    // autoDeploy targets: one small pipeline per target (config-repo checkout without a commit trigger,
    // then that target's deploy actions), started by an EventBridge rule on every successful push to the
    // target's ECR repository. A separate pipeline -- not a trigger on the main one -- so an image push
    // never parks the main pipeline at its later targets' approval gates. Both pipelines share the
    // deploy project and the target's state parameter, and both resolve the newest image, so whichever
    // runs, an unchanged image + configuration is skipped and a Git-triggered run cannot roll back.
    const autoDeployPipelines: codepipeline.Pipeline[] = [];
    for (const effectiveTarget of effectiveTargets.filter(({ target }) => target.autoDeploy === true)) {
      const target = effectiveTarget.target;
      const image = target.image ?? config.image;
      const repository = image === undefined ? undefined : parseEcrRepository(image);
      if (repository === undefined) {
        throw new Error(`cdk-cicd: autoDeploy target '${target.stage}' needs an ECR deployer image`);
      }
      if (
        Token.isUnresolved(stack.account) ||
        Token.isUnresolved(stack.region) ||
        repository.account !== stack.account ||
        repository.region !== stack.region
      ) {
        throw new Error(
          `cdk-cicd: autoDeploy target '${target.stage}' needs its ECR repository in the CD pipeline's own ` +
            'concrete account and Region: ECR push events are only delivered to the local EventBridge bus.',
        );
      }
      const autoScope = new Construct(this, `AutoDeploy-${target.stage}`);
      const autoSource = new codepipeline.Artifact();
      // A deterministic name, so the deploy project can be granted read access to this pipeline's
      // executions without a CloudFormation dependency cycle (pipeline -> project -> policy -> pipeline).
      const autoPipelineName = autoDeployPipelineName(stack.stackName, target.stage);
      project.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['codepipeline:GetPipelineExecution'],
          resources: [`arn:${stack.partition}:codepipeline:${stack.region}:${stack.account}:${autoPipelineName}`],
        }),
      );
      const autoPipeline = new codepipeline.Pipeline(autoScope, 'Pipeline', {
        pipelineName: autoPipelineName,
        artifactBucket: support.artifactBucket,
        pipelineType: codepipeline.PipelineType.V2,
        // A newer push supersedes an in-flight run: only the newest image matters for this target.
        executionMode: codepipeline.ExecutionMode.SUPERSEDED,
      });
      autoPipeline.addStage({
        stageName: 'Source',
        actions: [buildSourceAction(autoScope, config.repository, autoSource, { triggerOnChange: false })],
      });
      autoPipeline.addStage({
        stageName: `Deploy-${target.stage}`,
        actions: deploymentUnits
          .filter((unit) => unit.target === target)
          .map((unit) => deployAction(unit, undefined, autoSource, true)),
      });
      new events.Rule(autoScope, 'OnImagePush', {
        description: `Deploy ${target.stage} when a new image is pushed to ${repository.repositoryName}`,
        eventPattern: {
          source: ['aws.ecr'],
          detailType: ['ECR Image Action'],
          detail: {
            'action-type': ['PUSH'],
            result: ['SUCCESS'],
            'repository-name': [repository.repositoryName],
          },
        },
        targets: [new eventTargets.CodePipeline(autoPipeline)],
      });
      NagSuppressions.addResourceSuppressions(
        autoPipeline,
        [{ id: 'AwsSolutions-IAM5', reason: 'CodePipeline and its source/action roles use CDK-generated wildcards.' }],
        true,
      );
      autoDeployPipelines.push(autoPipeline);
    }
    this.autoDeployPipelines = autoDeployPipelines;

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
    NagSuppressions.addResourceSuppressions(
      planProject,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'CodeBuild default log/report/artifact wildcards and registry bearer tokens.',
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
 * The autoDeploy pipeline's name: `<stack>-auto-<stage>`, restricted to CodePipeline's name alphabet
 * and 100 characters. A name that would be truncated keeps a hash suffix so it stays unique.
 */
export function autoDeployPipelineName(stackName: string, stage: string): string {
  const full = `${stackName}-auto-${stage}`.replace(/[^A-Za-z0-9.@\-_]/g, '-');
  if (full.length <= 100) return full;
  const hash = createHash('sha256').update(full).digest('hex').slice(0, 8);
  return `${full.slice(0, 91)}-${hash}`;
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
    { name: PLAN_NAMESPACE, actionNames: ['Plan'] },
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

function validateEcrRepositoryAccount(
  scope: Construct,
  stack: Stack,
  repository: EcrRepositoryReference,
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
