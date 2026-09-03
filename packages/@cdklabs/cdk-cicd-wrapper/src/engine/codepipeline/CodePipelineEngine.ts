// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The CodePipeline engine. It builds a raw aws-codepipeline Pipeline (NOT CDK Pipelines) that is a
// thin orchestrator: source -> one CI/build project -> ONE CodeBuild deploy action per stage that
// runs `cdk-cicd deploy --stage <name>`. The deploy action reuses the M3 CLI, which synths per
// region at deploy time and handles multi-region itself -- so a stage with N regions is still one
// action, and there are no per-asset publishing projects. This flat footprint is the whole point:
// it replaces v2's per-asset/per-stage CDK Pipelines project sprawl.

import * as path from 'path';
import {
  AspectPriority,
  Aspects,
  Duration,
  RemovalPolicy,
  Stack,
  Token,
  aws_lambda as lambda,
  aws_codebuild as codebuild,
  aws_codepipeline as codepipeline,
  aws_codepipeline_actions as actions,
  aws_ecr as ecr,
  aws_iam as iam,
  aws_kms as kms,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib';
import { RegionInfo } from 'aws-cdk-lib/region-info';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { buildSourceAction } from './source';
import {
  assertValidCiImageReference,
  BuildImage,
  BuildImageKind,
  ciImageRegistryHost,
  ImageTagStrategy,
  isPrivateEcrRegistryHost,
  isPublicEcrRegistryHost,
} from '../../config/build-image';
import {
  resolveDefaultSynthesizerQualifier,
  specializeDefaultSynthesizerRoleArn,
} from '../../config/default-synthesizer-role-arn';
import { RepositorySourceType } from '../../config/repository';
import {
  CodeArtifactConfig,
  CodeBuildImageCredentials,
  CodePipelineRoleNames,
  DeployModel,
  NpmRegistryConfig,
  ProxyConfig,
  RegionOrder,
  ResolvedCicdConfig,
  SynthesizerType,
} from '../../config/types';
import {
  COMPLIANCE_LOG_BUCKET_ACCOUNT_FLAG,
  COMPLIANCE_LOG_BUCKET_NAME_FLAG,
  COMPLIANCE_LOG_BUCKET_REGION_FLAG,
} from '../../runtime/inject';
import { AccessLogsForBucketAspect } from '../../support/AccessLogsForBucketAspect';
import { SupportResources } from '../../support/SupportResources';
import { VpcNetworking } from '../../support/Vpc';
import { ssmWarmingCommands, ssmWarmingReadStatements } from '../cdkpipelines/CdkPipelinesEngine';
import { defaultCiCommands } from '../ci-commands';
import { deployRoleExternalIdSecretArnsForStages } from '../external-id-secrets';
// Reuse the SSM account-warming helpers the CdkPipelines engine exports (same wiring GitHubActionsEngine
// does) rather than redefining the scan/grant here -- one source of truth for both the shell and the IAM.
import { EngineRenderProps, IEngine } from '../types';

/**
 * The CDK bootstrap roles `cdk deploy` assumes: the deploy role drives CloudFormation, the two
 * publishing roles push assets, and the lookup role serves context queries during synth.
 */
const BOOTSTRAP_ROLE_KINDS = ['deploy', 'file-publishing', 'image-publishing', 'lookup'];

/**
 * Node runtime for every build project. Pinned rather than left to the image default because
 * `aws-cdk-lib` requires Node >= 20 and the standard CodeBuild image still defaults to Node 18.
 */
const NODE_RUNTIME_VERSION = 22;

/** Kept outside CODEBUILD_SRC_DIR so npm credentials can never enter a promoted source artifact. */
const PRIVATE_NPM_CONFIG_PATH = '/tmp/cdk-cicd-npmrc';
/** Fixed CodePipeline service quotas. */
const MAX_ACTIONS_PER_STAGE = 100;
const MAX_ACTIONS_PER_PIPELINE = 1_000;
const MAX_STAGES_PER_PIPELINE = 50;
const CODEPIPELINE_IDENTIFIER = /^[A-Za-z0-9.@_-]{1,100}$/;
const FLAT_ENGINE_STAGE_NAMES = ['Source', 'Build', 'UpdatePipeline'] as const;

interface ComplianceLoggingEnvironment {
  readonly bucketName: string;
  readonly account: string;
  readonly region: string;
}

/**
 * The newest Node runtime the CONSUMER's `aws-cdk-lib` knows about, for the deploy-driver Lambda.
 *
 * Deliberately derived rather than pinned. cdk-nag's `AwsSolutions-L1` computes "latest" from
 * `Runtime.ALL` of whatever aws-cdk-lib is resolved, and the wrapper's peer range is `^2.195.0`, so a
 * user gets whatever is current. Any hardcoded version therefore becomes a synth ERROR -- which blocks
 * `deploy-ci` entirely -- the moment AWS adds a newer runtime. Measured, not theorised: pinning
 * `NODEJS_22_X` passed against the repo's own 2.195.0 (whose newest is 22) and FAILED L1 in a real run
 * that resolved 2.266.0 (whose newest is 24). Reading the same list nag reads keeps the two in step by
 * construction. `Runtime.NODEJS_LATEST` is NOT a substitute -- it is a conservative alias (nodejs18.x in
 * 2.195.0) and fails L1 too. The handler is plain JS on the AWS SDK v3, so any modern Node suits it.
 */
function latestNodeRuntime(): lambda.Runtime {
  const major = (r: lambda.Runtime): number => parseInt(r.name.replace('nodejs', ''), 10);
  return lambda.Runtime.ALL.filter(
    (r) => r.family === lambda.RuntimeFamily.NODEJS && /^nodejs\d+\./.test(r.name),
  ).reduce((best, r) => (major(r) > major(best) ? r : best), lambda.Runtime.NODEJS_22_X);
}

/**
 * One destination bucket is provisioned with the pipeline stack. S3 server access logging cannot
 * cross accounts or Regions, so reject any application target that could not use that real bucket.
 */
function resolveComplianceLoggingEnvironment(
  stack: Stack,
  config: ResolvedCicdConfig,
): ComplianceLoggingEnvironment | undefined {
  const bucketName = config.complianceLogBucketName;
  if (bucketName === undefined) return undefined;

  if (Token.isUnresolved(stack.account) || Token.isUnresolved(stack.region)) {
    throw new Error(
      'cdk-cicd: compliance logging requires a concrete pipeline stack account and region so the ' +
        'S3 same-account/same-region requirement can be verified.',
    );
  }

  for (const stage of config.stages) {
    const account = stage.env.account ?? stack.account;
    const regions = stage.env.regions.length > 0 ? stage.env.regions : [stack.region];
    if (
      Token.isUnresolved(account) ||
      account !== stack.account ||
      regions.some((region) => Token.isUnresolved(region) || region !== stack.region)
    ) {
      throw new Error(
        `cdk-cicd: compliance logging cannot target stage '${stage.name}' from the pipeline bucket ` +
          `'${bucketName}' in ${stack.account}/${stack.region}. S3 server access-log source and ` +
          'destination buckets must be in the same account and region; configure only co-located ' +
          'stages or omit complianceLogBucketName.',
      );
    }
  }

  return { bucketName, account: stack.account, region: stack.region };
}

/** Validate the exact flat-pipeline topology before constructs emit opaque service-limit errors. */
function validateFlatPipelineTopology(config: ResolvedCicdConfig): void {
  const duplicateStage = config.stages.find(
    (stage, index) => config.stages.findIndex((candidate) => candidate.name === stage.name) !== index,
  );
  if (duplicateStage !== undefined) {
    throw new Error(`cdk-cicd: duplicate stage name '${duplicateStage.name}' is not allowed`);
  }

  const renderedStages: Array<{ readonly name: string; readonly actionNames: string[] }> = FLAT_ENGINE_STAGE_NAMES.map(
    (name) => ({ name, actionNames: [name] }),
  );
  for (const stage of config.stages) {
    validateCodePipelineIdentifier('stage', stage.name);
    if ((FLAT_ENGINE_STAGE_NAMES as readonly string[]).includes(stage.name)) {
      throw new Error(
        `cdk-cicd: stage name '${stage.name}' is reserved by the flat CodePipeline engine. ` +
          `Choose a name other than ${FLAT_ENGINE_STAGE_NAMES.join(', ')}.`,
      );
    }

    const regions = stage.env.regions;
    const suffixes =
      stage.env.regionOrder === RegionOrder.PARALLEL && regions.length > 1
        ? regions.map((region) => `-${region}`)
        : [''];
    const actionNames = [
      ...(stage.manualApproval ? [`Approve-${stage.name}`] : []),
      ...suffixes.map((suffix) => `Deploy-${stage.name}${suffix}`),
      ...(config.asyncDeploy ? suffixes.map((suffix) => `Await-${stage.name}${suffix}`) : []),
    ];
    for (const actionName of actionNames) {
      validateCodePipelineIdentifier('action', actionName);
    }
    const duplicateAction = actionNames.find((actionName, index) => actionNames.indexOf(actionName) !== index);
    if (duplicateAction !== undefined) {
      throw new Error(
        `cdk-cicd: stage '${stage.name}' would contain duplicate action name '${duplicateAction}'. ` +
          'Remove duplicate parallel regions.',
      );
    }
    if (actionNames.length > MAX_ACTIONS_PER_STAGE) {
      throw new Error(
        `cdk-cicd: stage '${stage.name}' would contain ${actionNames.length} actions, exceeding the ` +
          `fixed ${MAX_ACTIONS_PER_STAGE}-action CodePipeline quota. Reduce parallel regions or disable ` +
          'asyncDeploy.',
      );
    }
    renderedStages.push({ name: stage.name, actionNames });
  }

  if (renderedStages.length > MAX_STAGES_PER_PIPELINE) {
    throw new Error(
      `cdk-cicd: the flat pipeline would contain ${renderedStages.length} stages, exceeding the fixed ` +
        `${MAX_STAGES_PER_PIPELINE}-stage CodePipeline quota. Reduce deployment stages or split them ` +
        'across pipelines.',
    );
  }
  const actionCount = renderedStages.reduce((count, stage) => count + stage.actionNames.length, 0);
  if (actionCount > MAX_ACTIONS_PER_PIPELINE) {
    throw new Error(
      `cdk-cicd: the flat pipeline would contain ${actionCount} actions, exceeding the fixed ` +
        `${MAX_ACTIONS_PER_PIPELINE}-action CodePipeline quota. Reduce stages/parallel regions or split ` +
        'the deployment across pipelines.',
    );
  }
}

function validateCodePipelineIdentifier(kind: 'stage' | 'action', name: string): void {
  if (!CODEPIPELINE_IDENTIFIER.test(name)) {
    throw new Error(
      `cdk-cicd: generated CodePipeline ${kind} name '${name}' must match ` +
        `${CODEPIPELINE_IDENTIFIER} (1-100 characters). Rename the stage or region.`,
    );
  }
}

function validateFlatPipelinePartitions(stack: Stack, config: ResolvedCicdConfig): void {
  if (Token.isUnresolved(stack.region) || stack.region.length === 0) {
    throw new Error(
      'cdk-cicd: the flat deployment pipeline requires a concrete pipeline stack region so its AWS ' +
        'partition and target bootstrap-role ARNs can be validated.',
    );
  }
  const pipelinePartition = RegionInfo.get(stack.region).partition;
  if (pipelinePartition === undefined) {
    throw new Error(
      `cdk-cicd: pipeline region '${stack.region}' has no known AWS partition in this aws-cdk-lib ` +
        'version. Upgrade the wrapper/CDK before rendering the pipeline.',
    );
  }

  for (const stage of config.stages) {
    const regions = stage.env.regions.length > 0 ? stage.env.regions : [stack.region];
    for (const region of regions) {
      if (Token.isUnresolved(region) || region.length === 0) {
        throw new Error(
          `cdk-cicd: stage '${stage.name}' has an unresolved target region; the flat engine must know ` +
            'each target partition before it builds bootstrap-role ARNs.',
        );
      }
      const targetPartition = RegionInfo.get(region).partition;
      if (targetPartition === undefined) {
        throw new Error(
          `cdk-cicd: stage '${stage.name}' targets region '${region}', whose AWS partition is not known ` +
            'to this aws-cdk-lib version. Upgrade the wrapper/CDK before using that region.',
        );
      }
      if (targetPartition !== pipelinePartition) {
        throw new Error(
          `cdk-cicd: stage '${stage.name}' targets partition '${targetPartition}' (${region}), but the ` +
            `flat pipeline runs in '${pipelinePartition}' (${stack.region}). IAM role assumption and ` +
            'CodePipeline deployment cannot cross AWS partitions; use a pipeline in the target partition.',
        );
      }
    }
  }
}

/** Options for the CodePipeline engine. */
export interface CodePipelineEngineProps {
  /**
   * CodeBuild image for the CI Build project only. Overrides `config.ci.image`; defaults to the
   * standard Amazon Linux image.
   */
  readonly buildImage?: string;
  /**
   * Removal policy for the pipeline's own support resources (artifact bucket, encryption key).
   * `RETAIN` by default; a disposable pipeline sets `DESTROY` so a stack delete leaves nothing.
   */
  readonly removalPolicy?: RemovalPolicy;
}

/** Renders a resolved cicd config into an AWS CodePipeline. */
export class CodePipelineEngine implements IEngine {
  private readonly buildImage?: string;
  private readonly removalPolicy?: RemovalPolicy;

  public constructor(props: CodePipelineEngineProps = {}) {
    this.buildImage = props.buildImage;
    this.removalPolicy = props.removalPolicy;
  }

  public render(scope: Construct, props: EngineRenderProps): void {
    const config = props.config;
    const stack = Stack.of(scope);
    const ciBuildImage = this.buildImage ?? config.ci.image;
    if (config.deployerImage === undefined) {
      validateFlatPipelineTopology(config);
      validateFlatPipelinePartitions(stack, config);
    }
    const sourceOutput = new codepipeline.Artifact();
    const support = new SupportResources(scope, 'Support', {
      removalPolicy: this.removalPolicy,
      vpc: config.vpc,
      useProxy: config.proxy !== undefined,
      complianceLogBucketName: config.complianceLogBucketName,
      createComplianceLogBucket: config.createComplianceLogBucket,
    });
    const vpcNetworking = support.vpcNetworking;
    // v2 `ComplianceBucketProvider` provisioned this bucket eagerly whenever a name was configured
    // (default-on, not gated behind a separate opt-in); force the same here by reading the lazy
    // getter, so setting `complianceLogBucketName` alone is enough to get the bucket.
    const complianceLogBucket = config.complianceLogBucketName !== undefined ? support.complianceLogBucket : undefined;

    const pipeline = new codepipeline.Pipeline(scope, 'Pipeline', {
      pipelineName: props.pipelineName,
      restartExecutionOnUpdate: true,
      // Our own bucket rather than the one CodePipeline would generate, so the artifact store is
      // encrypted with the wrapper's key and follows the configured removal policy.
      artifactBucket: support.artifactBucket,
    });

    // Container mode (Repo 1): a SECONDARY pipeline that runs CI and then builds & pushes a deployer image
    // to ECR -- it deploys nothing (Repo 2 deploys from the image). Distinct enough from the deploy
    // pipeline to be its own render path rather than bolted onto the stage loop.
    if (config.deployerImage !== undefined && config.deployerImage.kind === BuildImageKind.DOCKER) {
      this.renderImageBuild(scope, pipeline, support, sourceOutput, config, config.deployerImage, vpcNetworking);
      return;
    }
    const complianceLogging = resolveComplianceLoggingEnvironment(stack, config);
    if (synthesizerType(config) === SynthesizerType.APP_STAGING) {
      throw new Error(
        'cdk-cicd: APP_STAGING cannot be deployed by the flat CodePipeline engine. The pinned alpha emits ' +
          'DefaultStagingStack with BootstraplessSynthesizer, so that support stack is deployed with the ' +
          "CodeBuild project's base credentials instead of the configured deployment role. Use " +
          'SynthesizerType.DEFAULT for pipeline deployment, or use container mode only to build the image ' +
          'and run its APP_STAGING deployment directly with appropriately privileged credentials.',
      );
    }

    // The pipeline stack contains ONLY the wrapper's own plumbing -- no user resources deploy here
    // (those land in the per-stage app stacks the deploy actions create). AwsSolutionsChecks is live
    // in a real single-copy install and flags the internal artifact bucket; suppress it here, with
    // evidence. The IAM5 wildcard grants are suppressed at the END of render(), once every role exists.
    // See findings `code-review-codepipeline-no-cdknag-suppressions` / task `m4-nag-compliance`.
    NagSuppressions.addResourceSuppressions(support.artifactBucket, [
      {
        id: 'AwsSolutions-S1',
        reason:
          "The pipeline's internal artifact store for transient build outputs, not a data bucket " +
          'serving external requests. Access logging would provision a second bucket to record the ' +
          "pipeline's own reads; the bucket is already KMS-encrypted, SSL-enforced and blocks public access.",
      },
    ]);

    pipeline.addStage({
      stageName: 'Source',
      actions: [buildSourceAction(scope, config.repository, sourceOutput)],
    });

    // ASSEMBLY_PROMOTION (the default): the Build phase's `cdk-cicd synth --all` output IS the deployed
    // artifact, so publish `cdk.out` and hand it to every deploy stage -- one synth per pipeline run.
    // DEPLOY_TIME_SYNTH: Build's synth is validation only, its output is discarded, and each stage
    // synthesizes its own assembly from the source. See `task.md` D-deploy.
    const promote = config.deployModel === DeployModel.ASSEMBLY_PROMOTION;
    // Stages whose assembly CI produces. Those stages deploy from it; any others synthesize at deploy
    // time. In promotion mode that is every stage; otherwise it is one stage by default.
    const synthed = ciSynthStages(config, promote);
    // Publish the assembly whenever CI produced one worth reusing -- so the single stage CI synthesizes
    // in deploy-time-synth mode is reused too, not synthesized a second time by its own deploy.
    const assembly = synthed.length > 0 ? new codepipeline.Artifact('Assembly') : undefined;

    const buildProject = this.project(scope, 'BuildProject', this.ciCommands(config, synthed, promote), {
      codeArtifact: config.codeArtifact,
      npmRegistry: config.npmRegistry,
      proxy: config.proxy,
      codeBuildEnvSettings: config.codeBuildEnvSettings,
      publishAssembly: assembly !== undefined,
      partialBuildSpec: config.ci.partialBuildSpec,
      vpcNetworking,
      buildImage: ciBuildImage,
      buildImageCredentials: config.ci.codeBuildImageCredentials,
      requiresDocker: true,
      complianceLogging,
    });
    this.grantLookupPermissions(
      buildProject,
      config.stages.map((stage) => ({
        account: stage.env.account ?? stack.account,
        regions: stage.env.regions.length > 0 ? stage.env.regions : [stack.region],
      })),
      config.qualifier,
    );
    this.grantExternalIdSecretRead(
      buildProject,
      config.stages.filter((stage) => synthed.includes(stage.name)),
      config.deployRoleExternalId,
    );
    // The synth build is where `ssmWarmingCommands` runs its `aws ssm get-parameters-by-path`, so its
    // role -- not the deploy roles -- needs the read grant. Same helper the CdkPipelines engine uses.
    if (config.warmAccountsFromSsm) {
      for (const statement of ssmWarmingReadStatements(Stack.of(scope), config.qualifier)) {
        buildProject.addToRolePolicy(statement);
      }
    }

    pipeline.addStage({
      stageName: 'Build',
      actions: [
        new actions.CodeBuildAction({
          actionName: 'Build',
          project: buildProject,
          input: sourceOutput,
          outputs: assembly !== undefined ? [assembly] : undefined,
        }),
      ],
    });

    // Self-update: before any application deploys, the pipeline re-synths its own definition from
    // `cicd.config.ts` and re-deploys itself. `restartExecutionOnUpdate` (set above) then restarts the
    // run under the new definition, so a change to the config -- a new stage, a changed gate -- takes
    // effect on the same push that introduced it, with no separate `deploy-ci` by hand. The target is
    // the pipeline's own account/region, so it needs the bootstrap roles there just like a deploy does.
    // The self-update must re-emit the SAME pipeline it is part of. A disposable pipeline that ran a
    // bare `deploy-ci` here would re-synth itself with the default RETAIN and quietly un-dispose its own
    // bucket and key on the first run -- so thread the flag through, keyed off the removal policy in hand.
    const deployCi =
      this.removalPolicy === RemovalPolicy.DESTROY ? 'npx cdk-cicd deploy-ci --disposable' : 'npx cdk-cicd deploy-ci';
    const selfUpdate = this.project(scope, 'UpdatePipeline', ['npm ci', deployCi], {
      codeArtifact: config.codeArtifact,
      npmRegistry: config.npmRegistry,
      proxy: config.proxy,
      codeBuildEnvSettings: config.codeBuildEnvSettings,
      vpcNetworking,
    });
    // The pipeline stack does not inherit the application's config.qualifier, but its App may select a
    // hub bootstrap qualifier through CDK context. Resolve that same context for self-update IAM.
    this.grantDeployPermissions(selfUpdate, stack.account, [stack.region]);
    pipeline.addStage({
      stageName: 'UpdatePipeline',
      actions: [new actions.CodeBuildAction({ actionName: 'SelfMutate', project: selfUpdate, input: sourceOutput })],
    });

    // Sequential stages keep one deploy action and let `cdk-cicd deploy` fan out across regions.
    // PARALLEL multi-region stages use one region-scoped project/action per region in the same
    // CodePipeline stage, all at the same run order.
    for (const stage of config.stages) {
      // `--from-assembly` makes the deploy use the promoted `cdk.out/<stage>/<region>` from its input
      // artifact instead of synthesizing. It refuses rather than falling back if the assembly is absent,
      // so broken artifact wiring fails loudly instead of silently costing a synth per stage. A stage CI
      // did NOT synth still synthesizes here -- that is the deploy-time-synth model for the stages it
      // still applies to.
      const reuse = synthed.includes(stage.name);
      const deployCmd = `npx cdk-cicd deploy --stage ${stage.name} --yes${reuse ? ' --from-assembly' : ''}`;
      // An empty region list means "wherever the pipeline itself runs" (an env-agnostic stage).
      const account = stage.env.account ?? stack.account;
      const regions = stage.env.regions.length > 0 ? stage.env.regions : [stack.region];

      // Cross-account async is not implemented: the driver Lambda runs in the pipeline's account and
      // executes change sets under its own identity, so it cannot reach a stage in another account.
      // Refuse it at render time -- otherwise the first Await invocation fails with an opaque AccessDenied
      // mid-deploy. (Same-account cross-region is fine; the Lambda is granted CFN in every stage region.)
      if (config.asyncDeploy && stage.env.account !== undefined && stage.env.account !== stack.account) {
        throw new Error(
          `cdk-cicd: asyncDeploy does not yet support a cross-account stage ('${stage.name}' targets a ` +
            'different account than the pipeline). Deploy that stage synchronously (omit asyncDeploy) until ' +
            'cross-account async lands.',
        );
      }

      const deployTargets: Array<{ readonly region?: string; readonly regions: string[] }> =
        stage.env.regionOrder === RegionOrder.PARALLEL && regions.length > 1
          ? regions.map((region) => ({ region, regions: [region] }))
          : [{ regions }];
      const deployActions: codepipeline.IAction[] = [];
      const awaitActions: codepipeline.IAction[] = [];

      for (const target of deployTargets) {
        const suffix = target.region !== undefined ? `-${target.region}` : '';
        const regionOption = target.region !== undefined ? ` --region ${target.region}` : '';
        // With asyncDeploy the build only PREPARES change sets and exits; a Lambda executes and awaits
        // them, so no build minutes are billed for the CloudFormation wait (D-deploy-wait). Parallel
        // regions need distinct parameters and drivers so their plans cannot overwrite one another.
        const planParam = config.asyncDeploy
          ? `/cdk-cicd/${props.pipelineName}/${stage.name}${target.region ? `/${target.region}` : ''}/deploy-plan`
          : undefined;
        const regionalDeployCmd = `${deployCmd}${regionOption}`;
        const stageCmd =
          planParam !== undefined
            ? `${regionalDeployCmd} --prepare-only --plan-parameter ${planParam}`
            : regionalDeployCmd;

        const project = this.project(scope, `Deploy-${stage.name}${suffix}`, ['npm ci', stageCmd], {
          codeArtifact: config.codeArtifact,
          npmRegistry: config.npmRegistry,
          proxy: config.proxy,
          codeBuildEnvSettings: config.codeBuildEnvSettings,
          vpcNetworking,
          requiresDocker: true,
          complianceLogging,
        });
        this.grantDeployPermissions(project, account, target.regions, config.qualifier, stage.deployment?.deployRole);
        if (!reuse) {
          this.grantExternalIdSecretRead(project, [stage], config.deployRoleExternalId);
        }
        if (planParam !== undefined) {
          project.addToRolePolicy(
            new iam.PolicyStatement({
              actions: ['ssm:PutParameter'],
              resources: [`arn:${stack.partition}:ssm:${stack.region}:${stack.account}:parameter${planParam}`],
            }),
          );
        }

        deployActions.push(
          new actions.CodeBuildAction({
            actionName: `Deploy-${stage.name}${suffix}`,
            project,
            // Per stage, not per pipeline: a reusing stage takes the Build output (cdk.out + the few
            // source files `npm ci` needs), while a stage that still synthesizes must take the RAW
            // SOURCE -- the assembly artifact deliberately omits bin/ and lib/, so synthesizing from it
            // would fail.
            input: reuse && assembly !== undefined ? assembly : sourceOutput,
            runOrder: stage.manualApproval ? 2 : 1,
          }),
        );

        if (planParam !== undefined) {
          const driver = this.deployDriver(scope, `${stage.name}${suffix}`, planParam, account, target.regions);
          awaitActions.push(
            new actions.LambdaInvokeAction({
              actionName: `Await-${stage.name}${suffix}`,
              lambda: driver,
              userParameters: { planParameterName: planParam },
              runOrder: stage.manualApproval ? 3 : 2,
            }),
          );
        }
      }

      // A gated stage puts its approval in the SAME pipeline stage as the deploy, ordered ahead of it,
      // rather than in a stage of its own: run order already sequences them, and one stage per
      // deployment stage keeps the pipeline's shape readable and matches the flat-footprint story.
      pipeline.addStage({
        stageName: stage.name,
        actions: [
          ...(stage.manualApproval
            ? [new actions.ManualApprovalAction({ actionName: `Approve-${stage.name}`, runOrder: 1 })]
            : []),
          ...deployActions,
          // Ordered strictly after the prepare steps: each reads its region-specific plan.
          ...awaitActions,
        ],
      });
    }

    // Suppress the IAM5 wildcards on the pipeline's own roles LAST, so applyToChildren snapshots every
    // role -- including the S3 source action's role, which CodePipeline creates during addStage() and
    // so does not exist until every stage above has been added.
    NagSuppressions.addResourceSuppressions(
      pipeline,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            "CDK-generated grants for the pipeline and its source action to read/write the pipeline's " +
            'own KMS-encrypted artifact bucket: object-level wildcards under that bucket ARN ' +
            '(s3:GetObject*/GetBucket*/List*/DeleteObject*/Abort*) and the key actions the encrypted ' +
            'store needs (kms:ReEncrypt*/GenerateDataKey*). Scoped to the artifact store the wrapper ' +
            'creates; they grant no access to user data. The S3 source object itself is granted by key, ' +
            'not by wildcard.',
        },
      ],
      true,
    );

    // Compliance/access-log bucket: attach the destination aspect when a name is configured (the
    // bucket itself is force-provisioned above via `support.complianceLogBucket`).
    // MUTATING priority so the L1 loggingConfiguration override lands before the readonly
    // AwsSolutionsChecks. The destination bucket alone carries the required S1 suppression because
    // S3 server access logs must not be delivered back into the same bucket.
    if (config.complianceLogBucketName !== undefined) {
      Aspects.of(scope).add(
        new AccessLogsForBucketAspect({
          complianceLogBucketName: config.complianceLogBucketName,
          complianceLogBucketAccount: stack.account,
          complianceLogBucketRegion: stack.region,
          complianceLogBucket,
        }),
        { priority: AspectPriority.MUTATING },
      );
    }

    // Force deterministic RoleNames on the flat engine's own roles (Blueprint parity), last, once every
    // role exists. The pipeline role is on the Pipeline construct; each CodeBuild project's role is named
    // `<buildRolePrefix>-<projectId>` from its construct id (Build / UpdatePipeline / Deploy-<stage>).
    if (config.codePipelineRoleNames !== undefined) {
      this.enforceRoleNames(scope, pipeline, config.codePipelineRoleNames);
    }
  }

  /**
   * Force `RoleName` on the flat engine's own roles (Blueprint `PipelineRoleNameEnforcementPlugin`
   * parity for the CODEPIPELINE engine). The pipeline role is the CodePipeline construct's own role;
   * the per-stage CodeBuild roles are named `<buildRolePrefix>-<projectId>`, where `projectId` is the
   * CodeBuild project's construct id lower-cased and stripped of the `Project` suffix (so `BuildProject`
   * -> `build`, `UpdatePipeline` -> `updatepipeline`, `Deploy-dev` -> `deploy-dev`). Any omitted field
   * keeps CDK's generated name.
   */
  private enforceRoleNames(scope: Construct, pipeline: codepipeline.Pipeline, names: CodePipelineRoleNames): void {
    if (names.pipeline !== undefined && names.pipeline.length > 0) {
      const pipelineRole = pipeline.role.node.defaultChild as iam.CfnRole | undefined;
      if (pipelineRole !== undefined) pipelineRole.roleName = names.pipeline;
    }

    const prefix = names.buildRolePrefix;
    if (prefix !== undefined && prefix.length > 0) {
      for (const project of Construct.isConstruct(scope) ? scope.node.findAll() : []) {
        if (!(project instanceof codebuild.PipelineProject)) continue;
        const cfnRole = project.role?.node.defaultChild as iam.CfnRole | undefined;
        if (cfnRole === undefined) continue;
        const suffix = project.node.id.replace(/Project$/, '').toLowerCase();
        cfnRole.roleName = `${prefix}-${suffix}`;
      }
    }
  }

  /**
   * Let the CI synth project perform context lookups in every target environment it resolves. The
   * synthesizer's lookup role is the least-privilege path for VPC, hosted-zone, AMI and other context
   * providers; the bootstrap version parameter is read by the CLI before it assumes that role.
   */
  private grantLookupPermissions(
    project: codebuild.PipelineProject,
    targets: ReadonlyArray<{ readonly account: string; readonly regions: readonly string[] }>,
    configuredQualifier?: string,
  ): void {
    const stack = Stack.of(project);
    const qualifier = resolveDefaultSynthesizerQualifier(project, configuredQualifier);
    const roleArns = new Set<string>();
    const versionParams = new Set<string>();

    for (const target of targets) {
      for (const region of target.regions) {
        roleArns.add(
          `arn:${stack.partition}:iam::${target.account}:role/cdk-${qualifier}-lookup-role-${target.account}-${region}`,
        );
        versionParams.add(
          `arn:${stack.partition}:ssm:${region}:${target.account}:parameter/cdk-bootstrap/${qualifier}/version`,
        );
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
  }

  /**
   * Grant the stage synth process access to secret-backed deploy-role ExternalIds. A stage override
   * wins over the pipeline fallback, matching the CLI, and an ExternalId is ignored unless a non-blank
   * deployRole is configured because there is then no role assumption to supply it to.
   */
  private grantExternalIdSecretRead(
    project: codebuild.PipelineProject,
    stages: ReadonlyArray<ResolvedCicdConfig['stages'][number]>,
    pipelineExternalId?: string,
  ): void {
    const secretArns = deployRoleExternalIdSecretArnsForStages(stages, pipelineExternalId);
    if (secretArns.length === 0) return;

    project.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: secretArns,
      }),
    );
  }

  /**
   * Let a `cdk deploy` project actually deploy into `account`/`regions` -- a stage's application
   * deploy, or the self-update stage deploying the pipeline into its own account. `cdk deploy` does
   * everything through the CDK bootstrap roles, so the project's own role needs permission to assume
   * them, plus any forced deployment role. A separate CloudFormation execution role is passed to the
   * service by the assumed deployment role; that role, not this project, must have iam:PassRole.
   *
   * The bootstrap version parameter is granted for the CLI's base-credentials path only; on the
   * normal path the CLI reads it under the *assumed* bootstrap role, not under this project's role.
   */
  private grantDeployPermissions(
    project: codebuild.PipelineProject,
    account: string,
    regions: string[],
    configuredQualifier?: string,
    forcedDeployRole?: string,
  ): void {
    const stack = Stack.of(project);
    const qualifier = resolveDefaultSynthesizerQualifier(project, configuredQualifier);
    const normalizedForcedDeployRole = forcedDeployRole?.trim();
    const roleArns = new Set<string>();

    for (const region of regions) {
      for (const kind of BOOTSTRAP_ROLE_KINDS) {
        roleArns.add(`arn:${stack.partition}:iam::${account}:role/cdk-${qualifier}-${kind}-role-${account}-${region}`);
      }

      // A blank configured deployment role means "no forced role", not an empty ARN. CDK specializes
      // these placeholders per target stack before writing the assembly, so the project's IAM grant
      // must name the same concrete role for every target Region.
      if (normalizedForcedDeployRole !== undefined && normalizedForcedDeployRole.length > 0) {
        const partition = RegionInfo.get(region).partition;
        if (partition === undefined) {
          throw new Error(
            `cdk-cicd: target region '${region}' has no known AWS partition in this aws-cdk-lib version.`,
          );
        }
        roleArns.add(
          specializeDefaultSynthesizerRoleArn(normalizedForcedDeployRole, {
            qualifier,
            account,
            region,
            partition,
          }),
        );
      }
    }
    project.addToRolePolicy(new iam.PolicyStatement({ actions: ['sts:AssumeRole'], resources: [...roleArns] }));
    project.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: regions.map(
          (region) => `arn:${stack.partition}:ssm:${region}:${account}:parameter/cdk-bootstrap/${qualifier}/version`,
        ),
      }),
    );
  }

  /**
   * Render the container-mode (Repo 1) pipeline: Source -> CI -> build & push a config-agnostic deployer
   * image to ECR. It deploys nothing; Repo 2 deploys from the image. The ECR repo is provisioned here
   * (named `<application>-deployer`) unless the config names an existing one, so the pipeline is
   * self-contained and its `--disposable` teardown takes the repo with it.
   */
  private renderImageBuild(
    scope: Construct,
    pipeline: codepipeline.Pipeline,
    support: SupportResources,
    sourceOutput: codepipeline.Artifact,
    config: ResolvedCicdConfig,
    build: BuildImage,
    vpcNetworking?: VpcNetworking,
  ): void {
    const stack = Stack.of(scope);
    const appName = config.application ?? 'cdk-cicd';
    const ciBuildImage = this.buildImage ?? config.ci.image;

    // Reference an existing repo by name, else provision one. Provisioned repos follow the pipeline's
    // removal policy (a disposable pipeline deletes its repo, and empties images so the delete succeeds).
    const repository =
      build.repositoryName !== undefined
        ? ecr.Repository.fromRepositoryName(scope, 'DeployerImage', build.repositoryName)
        : new ecr.Repository(scope, 'DeployerImage', {
            repositoryName: `${appName}-deployer`,
            removalPolicy: this.removalPolicy,
            emptyOnDelete: this.removalPolicy === RemovalPolicy.DESTROY,
            imageScanOnPush: true,
            imageTagMutability:
              build.tagStrategy === ImageTagStrategy.GIT_SHA ? ecr.TagMutability.IMMUTABLE : ecr.TagMutability.MUTABLE,
          });

    pipeline.addStage({ stageName: 'Source', actions: [buildSourceAction(scope, config.repository, sourceOutput)] });

    // GIT_SHA repositories are immutable. A retry reuses an already-published tag, while concurrent
    // builds tolerate the other build winning the immutable-tag race. Imported repositories are
    // verified at runtime because this stack cannot change their mutability setting.
    const immutableTag = build.tagStrategy === ImageTagStrategy.GIT_SHA;
    const tag = immutableTag ? '$IMAGE_TAG' : 'latest';
    const uri = `${stack.account}.dkr.ecr.${stack.region}.${stack.urlSuffix}/${repository.repositoryName}`;
    const privateNpm = config.npmRegistry !== undefined || config.codeArtifact !== undefined;
    const commands = [
      ...(privateNpm ? npmConfigSetupCommands() : []),
      ...(config.npmRegistry ? npmRegistryLoginCommands(config.npmRegistry) : []),
      ...(config.codeArtifact ? [codeArtifactLogin(stack, config.codeArtifact)] : []),
      ...defaultCiCommands(),
      ...(immutableTag
        ? [
            ...immutableImageTagCommands(config.repository.repositoryType),
            `test "$(aws ecr describe-repositories --region ${stack.region} --repository-names ${repository.repositoryName} --query 'repositories[0].imageTagMutability' --output text)" = "IMMUTABLE" || { echo "GIT_SHA requires an immutable ECR repository: ${repository.repositoryName}"; exit 1; }`,
          ]
        : []),
      // Log in to ECR, build the deployer image from the source, tag by immutable source revision, and
      // push. The image payload is the app + deps (per the Dockerfile), NOT cdk.out -- Repo 2 synths at
      // run time.
      `aws ecr get-login-password --region ${stack.region} | docker login --username AWS --password-stdin ${stack.account}.dkr.ecr.${stack.region}.${stack.urlSuffix}`,
      ...(immutableTag
        ? [
            `if aws ecr describe-images --region ${stack.region} --repository-name ${repository.repositoryName} --image-ids imageTag="$IMAGE_TAG" >/dev/null 2>&1; then echo "Immutable image ${uri}:$IMAGE_TAG already exists; reusing it"; else docker build -f ${build.dockerfile} -t ${uri}:$IMAGE_TAG . && (docker push ${uri}:$IMAGE_TAG || { aws ecr describe-images --region ${stack.region} --repository-name ${repository.repositoryName} --image-ids imageTag="$IMAGE_TAG" >/dev/null 2>&1 && echo "Immutable image ${uri}:$IMAGE_TAG was published concurrently; reusing it"; }); fi`,
          ]
        : [`docker build -f ${build.dockerfile} -t ${uri}:${tag} .`, `docker push ${uri}:${tag}`]),
    ];

    // The proxy's exports run first, in `install` -- ahead of the codeArtifact login and `npm ci`, same
    // ordering as `project()` (NO_PROXY is what lets the AWS-API-bound `codeartifact login` skip the
    // proxy while `npm ci` against public npm goes through it).
    const install = {
      ...(ciBuildImage === undefined && config.codeBuildEnvSettings?.buildImage === undefined
        ? { 'runtime-versions': { nodejs: NODE_RUNTIME_VERSION } }
        : {}),
      ...(config.proxy ? { commands: proxyInstallCommands(config.proxy) } : {}),
    };
    const buildSpecEnv = buildSpecEnvironment(stack, config.proxy, config.npmRegistry, config.codeArtifact);
    const environment = withPrivateNpmConfig(
      this.buildEnvironment(
        scope,
        'BuildImage',
        config.codeBuildEnvSettings,
        ciBuildImage,
        config.ci.codeBuildImageCredentials,
        true,
      ),
      privateNpm,
    );

    const project = new codebuild.PipelineProject(scope, 'BuildImage', {
      // Docker builds need a privileged environment; runtime pinned like the deploy projects.
      // `codeBuildEnvSettings` still contributes computeType/environmentVariables here -- only
      // `privileged` is forced (Docker requires it regardless of what the config says).
      environment: { ...environment, privileged: true },
      vpc: vpcNetworking?.vpc,
      securityGroups: vpcNetworking?.securityGroups,
      subnetSelection: vpcNetworking?.subnetSelection,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          ...(Object.keys(install).length > 0 ? { install } : {}),
          build: {
            commands,
            // CodeBuild runs a phase's `finally` commands even when an earlier command in that phase
            // fails. Credentials are created in this same phase, so failed login/CI/build commands
            // cannot strand the temporary npm config.
            ...(privateNpm ? { finally: npmConfigCleanupCommands() } : {}),
          },
        },
        ...(buildSpecEnv !== undefined ? { env: buildSpecEnv } : {}),
      }),
    });
    grantCodeBuildImageCredentialKeyDecrypt(project, config.ci.codeBuildImageCredentials);
    repository.grantPullPush(project);
    if (immutableTag) repository.grantRead(project);
    if (config.codeArtifact) grantCodeArtifactRead(project, config.codeArtifact);
    if (config.npmRegistry) grantNpmRegistrySecretRead(project, config.npmRegistry);
    if (config.proxy) grantProxySecretRead(project, config.proxy);
    // Provisioned repos derive the URI from the pipeline account; a referenced repo may be elsewhere, but
    // grantPullPush + ECR's token endpoint cover same-account. (Cross-account push is a later slice.)

    pipeline.addStage({
      stageName: 'BuildImage',
      actions: [new actions.CodeBuildAction({ actionName: 'BuildAndPush', project, input: sourceOutput })],
    });

    if (config.complianceLogBucketName !== undefined) {
      if (Token.isUnresolved(stack.account) || Token.isUnresolved(stack.region)) {
        throw new Error(
          'cdk-cicd: compliance logging requires a concrete pipeline stack account and region so the ' +
            'S3 same-account/same-region requirement can be verified.',
        );
      }
      Aspects.of(scope).add(
        new AccessLogsForBucketAspect({
          complianceLogBucketName: config.complianceLogBucketName,
          complianceLogBucketAccount: stack.account,
          complianceLogBucketRegion: stack.region,
          complianceLogBucket: support.complianceLogBucket,
        }),
        { priority: AspectPriority.MUTATING },
      );
    }

    NagSuppressions.addResourceSuppressions(
      pipeline,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            "CDK-generated grants for the pipeline to read its own KMS-encrypted artifact bucket and the source object; scoped to the pipeline's own stores.",
        },
      ],
      true,
    );
    NagSuppressions.addResourceSuppressions(
      project,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'ECR grantPullPush issues ecr:GetAuthorizationToken on "*" (the token endpoint is not resource-scopable) plus repo-scoped push actions; the CodeBuild log/report and artifact-bucket wildcards are the project\'s own, as in the deploy pipeline. When a VPC is configured this also covers the CodeBuild-managed network-interface permissions, as in the deploy pipeline\'s project() suppression.',
        },
        {
          id: 'AwsSolutions-CB5',
          reason:
            'This project must build and push the deployer container image, which requires the local Docker daemon exposed by CodeBuild privileged mode.',
        },
      ],
      true,
    );
    NagSuppressions.addResourceSuppressions(support.artifactBucket, [
      { id: 'AwsSolutions-S1', reason: "The pipeline's internal artifact store; see the deploy-pipeline suppression." },
    ]);
  }

  /**
   * The Lambda that executes and awaits the change sets the prepare step created (D-deploy-wait).
   *
   * It is invoked as a CodePipeline **asynchronous** action: it does one unit of work per invocation and
   * returns a continuation token, so it is billed in ~1s slices instead of holding a build container for
   * the whole CloudFormation wait. The timeout is deliberately short for the same reason -- the function
   * is never supposed to sit and poll inside a single invocation.
   */
  private deployDriver(
    scope: Construct,
    stageName: string,
    planParam: string,
    account: string,
    regions: string[],
  ): lambda.Function {
    const stack = Stack.of(scope);
    const fn = new lambda.Function(scope, `Await-${stageName}`, {
      runtime: latestNodeRuntime(),
      // The AWS SDK v3 clients the handler uses are provided by the runtime, so the asset is just the
      // compiled handler -- no bundler, and no SDK dependency pushed into every consumer's install.
      code: lambda.Code.fromAsset(path.join(__dirname, 'deploy-driver')),
      handler: 'handler.handler',
      timeout: Duration.minutes(1),
      description: `cdk-cicd: execute and await CloudFormation change sets for stage ${stageName}`,
    });

    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [`arn:${stack.partition}:ssm:${stack.region}:${stack.account}:parameter${planParam}`],
      }),
    );
    // Scoped to the stage's own account and regions. The stack name cannot be known when the pipeline is
    // rendered -- the app is synthesized inside the pipeline -- which is the whole reason this is a Lambda
    // and not a set of native CloudFormation actions, so the stack segment is necessarily a wildcard.
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'cloudformation:ExecuteChangeSet',
          'cloudformation:DescribeChangeSet',
          'cloudformation:DescribeStacks',
        ],
        resources: regions.map((region) => `arn:${stack.partition}:cloudformation:${region}:${account}:stack/*/*`),
      }),
    );
    // The driver assumes neither deployment role. CDK already used `deployRole` while preparing the
    // change set, and baked `cfnExecutionRole` into it as CloudFormation's RoleARN. This Lambda only
    // executes that prepared change set under its own identity.

    NagSuppressions.addResourceSuppressions(
      fn,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'AWSLambdaBasicExecutionRole is the CDK default for a Lambda with no VPC; it grants only ' +
            "CloudWatch Logs writes for this function's own log group.",
        },
        {
          id: 'AwsSolutions-IAM5',
          reason:
            "Scoped to the stage's own account and regions. The stack name is a wildcard because the app " +
            'is synthesized inside the pipeline, so the stack set of a stage is not known when the ' +
            'pipeline is rendered -- that is precisely why this is a Lambda rather than native ' +
            'CloudFormation actions. codepipeline:PutJob*Result is granted on "*" by LambdaInvokeAction ' +
            'itself and cannot be resource-scoped.',
        },
      ],
      true,
    );
    return fn;
  }

  private ciCommands(config: ResolvedCicdConfig, synthed: string[], promote: boolean): string[] {
    const steps = Object.values(config.ci.steps);
    // With no ci.steps the engine runs the default CI (which begins with its own `npm ci`). With
    // ci.steps configured, those steps ARE the build phase verbatim -- the engine injects nothing, not
    // even `npm ci`: a project that customizes CI decides for itself whether and where to install.
    const base = steps.length > 0 ? steps : defaultCiCommands();
    // Account warming: when opted in, run the shared SSM scan (from CdkPipelinesEngine) so the synth sees
    // ACCOUNT_<STAGE> env vars. It must land AFTER the CI base (which installs) and BEFORE the synth
    // command(s), so the exports are in the same shell that runs `cdk synth`.
    const warming = config.warmAccountsFromSsm ? ssmWarmingCommands(config.qualifier) : [];
    // The synth is appended, never replaced by `ci.steps`. In promotion mode it produces the artifact
    // every deploy stage consumes, so a config that dropped it would render a pipeline that cannot
    // deploy at all; in deploy-time-synth mode it is the validation gate.
    return [...base, ...warming, ...synthCommands(synthed, promote)];
  }

  private project(
    scope: Construct,
    id: string,
    commands: string[],
    options: {
      readonly codeArtifact?: CodeArtifactConfig;
      readonly npmRegistry?: NpmRegistryConfig;
      readonly proxy?: ProxyConfig;
      readonly codeBuildEnvSettings?: codebuild.BuildEnvironment;
      readonly publishAssembly?: boolean;
      readonly partialBuildSpec?: codebuild.BuildSpec;
      readonly vpcNetworking?: VpcNetworking;
      readonly buildImage?: string;
      readonly buildImageCredentials?: CodeBuildImageCredentials;
      /** Whether this project normally needs the local Docker daemon for CDK assets or bundling. */
      readonly requiresDocker?: boolean;
      /** Compliance destination exported into application synthesis performed by this project. */
      readonly complianceLogging?: ComplianceLoggingEnvironment;
    } = {},
  ): codebuild.PipelineProject {
    const stack = Stack.of(scope);
    const {
      codeArtifact,
      npmRegistry,
      proxy,
      codeBuildEnvSettings,
      publishAssembly = false,
      partialBuildSpec,
      vpcNetworking,
      buildImage,
      buildImageCredentials,
      requiresDocker = false,
      complianceLogging,
    } = options;
    // Pin the Node runtime, but ONLY on the default (CodeBuild-managed) image. Without
    // `runtime-versions` the managed image's default applies, which on standard:7.0 is Node 18 -- and
    // `aws-cdk-lib` declares `node >= 20`, so every `npm ci` warned EBADENGINE and the app then ran on an
    // unsupported Node (measured in a real pipeline run). It must stay conditional: `runtime-versions` is
    // only honoured by the managed standard images, and each offers a fixed set, so emitting it for a
    // user-supplied `buildImage` (a custom registry image, or standard:5.0/6.0 where nodejs 22 does not
    // exist) turns a working pipeline into a hard YAML_FILE_ERROR in the install phase. A user who brings
    // their own image owns its Node version.
    // The proxy's exports run first, in `install` -- ahead of the codeArtifact login and `npm ci`, both
    // of which need HTTP(S)_PROXY/NO_PROXY already set (NO_PROXY is what lets the AWS-API-bound
    // `codeartifact login` skip the proxy while `npm ci` against public npm goes through it).
    const install = {
      ...(buildImage === undefined && codeBuildEnvSettings?.buildImage === undefined
        ? { 'runtime-versions': { nodejs: NODE_RUNTIME_VERSION } }
        : {}),
      ...(proxy ? { commands: proxyInstallCommands(proxy) } : {}),
    };
    // Private-registry setup has to run before npm ci. Keep setup, login, CI, and cleanup in the same
    // build phase: CodeBuild's phase-level `finally` is then guaranteed to run after any failed command.
    // Write the generic registry first so a following CodeArtifact login can append scoped entries.
    const privateNpm = npmRegistry !== undefined || codeArtifact !== undefined;
    const privateNpmCommands = [
      ...(privateNpm ? npmConfigSetupCommands() : []),
      ...(npmRegistry ? npmRegistryLoginCommands(npmRegistry) : []),
      ...(codeArtifact ? [codeArtifactLogin(stack, codeArtifact)] : []),
    ];
    const phases = {
      ...(Object.keys(install).length > 0 ? { install } : {}),
      build: {
        commands: [...privateNpmCommands, ...commands],
        ...(privateNpm ? { finally: npmConfigCleanupCommands() } : {}),
      },
    };

    const buildSpecEnv = buildSpecEnvironment(stack, proxy, npmRegistry, codeArtifact);
    const generatedBuildSpec = codebuild.BuildSpec.fromObject({
      version: '0.2',
      phases,
      ...(buildSpecEnv !== undefined ? { env: buildSpecEnv } : {}),
      // Publish the WHOLE source tree plus the synthesized assembly. node_modules is rebuilt downstream;
      // npm credential files are excluded defensively even though generated credentials live in /tmp.
      // A hardcoded source allowlist is intentionally avoided because deploy still loads cicd.config.ts
      // and any files/scripts it imports.
      ...(publishAssembly
        ? {
            artifacts: {
              files: ['**/*'],
              'exclude-paths': ['node_modules/**/*', '.npmrc', '**/.npmrc'],
            },
          }
        : {}),
    });

    const environment = withComplianceLoggingEnvironment(
      withPrivateNpmConfig(
        this.buildEnvironment(scope, id, codeBuildEnvSettings, buildImage, buildImageCredentials, requiresDocker),
        privateNpm,
      ),
      complianceLogging,
    );
    const project = new codebuild.PipelineProject(scope, id, {
      environment,
      vpc: vpcNetworking?.vpc,
      securityGroups: vpcNetworking?.securityGroups,
      subnetSelection: vpcNetworking?.subnetSelection,
      // The escape hatch (v2 `ciBuildSpec`, migrated): deep-merged, not replaced, so a user-supplied
      // fragment augments the engine's own phases/env instead of silently dropping them.
      buildSpec:
        partialBuildSpec !== undefined
          ? codebuild.mergeBuildSpecs(generatedBuildSpec, partialBuildSpec)
          : generatedBuildSpec,
    });
    grantCodeBuildImageCredentialKeyDecrypt(project, buildImageCredentials);
    if (codeArtifact) {
      grantCodeArtifactRead(project, codeArtifact);
    }
    if (npmRegistry) {
      grantNpmRegistrySecretRead(project, npmRegistry);
    }
    if (proxy) {
      grantProxySecretRead(project, proxy);
    }
    // CDK gives every CodeBuild project wildcard grants to its own CloudWatch log group/stream and
    // CodeBuild report group, plus read/write on the pipeline's KMS-encrypted artifact bucket. All are
    // scoped to the project's own logs and the pipeline's own artifact store -- no user data -- so the
    // AwsSolutions-IAM5 wildcards are suppressed with that evidence (see the note in render()).
    NagSuppressions.addResourceSuppressions(
      project,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            "CDK-generated grants, each scoped to the project's own resources: wildcards on its own " +
            "CloudWatch log group/stream and CodeBuild report group, and on the pipeline's KMS-encrypted " +
            'artifact bucket (s3:GetObject*/GetBucket*/List*, kms:ReEncrypt*/GenerateDataKey*). ' +
            'When codeArtifact is configured this also covers the one genuinely unscoped grant, ' +
            'sts:GetServiceBearerToken on Resource "*", which CodeArtifact requires and which IAM ' +
            'cannot express at resource level; it is constrained instead by a condition on ' +
            "sts:AWSServiceName = codeartifact.amazonaws.com, which cdk-nag's IAM5 rule does not read. " +
            'When a VPC is configured this also covers the CodeBuild-managed network-interface permissions ' +
            '(ec2:CreateNetworkInterface/DescribeNetworkInterfaces/DeleteNetworkInterface/DescribeSubnets/' +
            'DescribeSecurityGroups/DescribeDhcpOptions/DescribeVpcs on Resource "*"), which CDK generates ' +
            "for every VPC-attached CodeBuild project and which EC2 cannot scope to an ENI that doesn't " +
            'exist yet.',
        },
        ...(environment.privileged
          ? [
              {
                id: 'AwsSolutions-CB5',
                reason:
                  'CDK applications can synthesize DockerImageAsset and Docker-based bundling inputs. ' +
                  'CodeBuild privileged mode supplies the local Docker daemon those standard CDK asset ' +
                  'paths require; bootstrap-role IAM grants still scope publishing to the target environments.',
              },
            ]
          : []),
      ],
      true,
    );
    return project;
  }

  /**
   * Merge v2 `codeBuildEnvSettings` into a project's environment. Projects that synthesize or deploy
   * applications default to privileged mode so CDK Docker assets/bundling still work; plumbing-only
   * projects do not. An explicit user setting wins. A project-specific image wins over the shared one.
   */
  private buildEnvironment(
    scope: Construct,
    projectId: string,
    settings?: codebuild.BuildEnvironment,
    projectBuildImage?: string,
    buildImageCredentials?: CodeBuildImageCredentials,
    requiresDocker = false,
  ): codebuild.BuildEnvironment {
    if (projectBuildImage === undefined && buildImageCredentials !== undefined) {
      throw new Error('cdk-cicd: ci.codeBuildImageCredentials requires ci.image.');
    }
    const buildImage =
      projectBuildImage !== undefined
        ? buildImageFromString(scope, `${projectId}BuildImageRepository`, projectBuildImage, buildImageCredentials)
        : settings?.buildImage;
    return {
      ...settings,
      privileged: settings?.privileged ?? requiresDocker,
      ...(buildImage !== undefined ? { buildImage } : {}),
    };
  }
}

interface EcrImageReference {
  readonly account: string;
  readonly partition: string;
  readonly region: string;
  readonly repositoryName: string;
  readonly tagOrDigest?: string;
}

/**
 * Build-image strings cover three credential models:
 * - CodeBuild-managed images are pulled by the CodeBuild service.
 * - Private ECR images are bound to an IRepository so CDK grants the project role pull access.
 * - Other registry strings are public images pulled with service-role credentials.
 */
function buildImageFromString(
  scope: Construct,
  repositoryId: string,
  image: string,
  credentials?: CodeBuildImageCredentials,
): codebuild.IBuildImage {
  assertValidCiImageReference(image);
  if (image.startsWith('aws/codebuild/')) {
    assertNoCodeBuildRegistryCredentials(image, credentials, 'managed CodeBuild');
    return codebuild.LinuxBuildImage.fromCodeBuildImageId(image);
  }

  if (isPublicEcrRegistryHost(ciImageRegistryHost(image))) {
    assertNoCodeBuildRegistryCredentials(image, credentials, 'public ECR');
  }

  const parsed = parseEcrImageReference(image);
  if (parsed === undefined) {
    assertNoUnsupportedPrivateEcrEndpoint(image);
    const secret =
      credentials !== undefined
        ? importCodeBuildRegistrySecret(scope, `${repositoryId}RegistryCredentials`, credentials)
        : undefined;
    return codebuild.LinuxBuildImage.fromDockerRegistry(
      image,
      secret !== undefined ? { secretsManagerCredentials: secret } : undefined,
    );
  }

  assertNoCodeBuildRegistryCredentials(image, credentials, 'private ECR');
  const stack = Stack.of(scope);
  validatePrivateEcrBuildImageEnvironment(stack, parsed, image);
  const repository = ecr.Repository.fromRepositoryAttributes(scope, repositoryId, {
    repositoryName: parsed.repositoryName,
    repositoryArn: `arn:${parsed.partition}:ecr:${parsed.region}:${parsed.account}:repository/${parsed.repositoryName}`,
  });
  return codebuild.LinuxBuildImage.fromEcrRepository(repository, parsed.tagOrDigest);
}

function assertNoUnsupportedPrivateEcrEndpoint(image: string): void {
  const registryHost = ciImageRegistryHost(image);
  if (!isPrivateEcrRegistryHost(registryHost)) return;

  throw new Error(
    `cdk-cicd: private ECR CodeBuild image '${image}' does not use the canonical registry form ` +
      "'<account>.dkr.ecr.<region>.<AWS domain suffix>'. The installed aws-cdk-lib binds ECR build " +
      'images through that canonical endpoint; use the repository URI returned by ECR.',
  );
}

function validatePrivateEcrBuildImageEnvironment(stack: Stack, image: EcrImageReference, imageReference: string): void {
  if (Token.isUnresolved(stack.account) || Token.isUnresolved(stack.region)) {
    throw new Error(
      `cdk-cicd: private ECR CodeBuild image '${imageReference}' requires a concrete pipeline stack ` +
        'account and region so image access can be validated. Set the pipeline stack env.',
    );
  }
  if (image.region !== stack.region) {
    throw new Error(
      `cdk-cicd: private ECR CodeBuild image '${imageReference}' is in '${image.region}', but the ` +
        `CodeBuild project is in '${stack.region}'. CodeBuild custom ECR images must be in the same ` +
        'region; replicate or mirror the image into the pipeline region.',
    );
  }
  if (image.account !== stack.account) {
    throw new Error(
      `cdk-cicd: private ECR CodeBuild image '${imageReference}' is owned by account '${image.account}', ` +
        `but the flat pipeline runs in '${stack.account}'. This engine cannot create or verify the ` +
        'owner-side repository policy required for a cross-account build image; mirror the image into ' +
        'the pipeline account.',
    );
  }
}

function parseEcrImageReference(image: string): EcrImageReference | undefined {
  const firstSlash = image.indexOf('/');
  if (firstSlash < 1) return undefined;
  const registryHost = image.slice(0, firstSlash).toLowerCase();
  const repositoryReference = image.slice(firstSlash + 1);
  if (/^\d{12}\.dkr(?:\.ecr-fips|-ecr-fips)\./.test(registryHost)) {
    throw new Error(
      `cdk-cicd: private ECR CodeBuild image '${image}' uses a FIPS registry endpoint. The installed ` +
        'aws-cdk-lib CodeBuild image binding accepts an ECR repository and renders its canonical registry ' +
        'URI, so it cannot preserve a requested FIPS endpoint.',
    );
  }
  if (/^\d{12}\.dkr-ecr\.[a-z0-9-]+\.on\.aws$/.test(registryHost)) {
    throw new Error(
      `cdk-cicd: private ECR CodeBuild image '${image}' uses a dual-stack registry endpoint. The installed ` +
        'aws-cdk-lib CodeBuild image binding renders the canonical dkr.ecr endpoint.',
    );
  }

  const match = /^(\d{12})\.dkr\.ecr\.([a-z0-9-]+)\.(.+)$/.exec(registryHost);
  if (match === null) return undefined;

  const [, account, region, registrySuffix] = match;
  const regionInfo = RegionInfo.get(region);
  const expectedSuffix = regionInfo.domainSuffix;
  const partition = regionInfo.partition;
  if (expectedSuffix === undefined || partition === undefined) {
    throw new Error(
      `cdk-cicd: private ECR CodeBuild image '${image}' uses region '${region}', whose partition/domain ` +
        'suffix is not known to this aws-cdk-lib version. Upgrade the wrapper/CDK before using this image.',
    );
  }
  if (registrySuffix !== expectedSuffix) {
    throw new Error(
      `cdk-cicd: private ECR CodeBuild image '${image}' has registry suffix '${registrySuffix}', but ` +
        `region '${region}' belongs to partition '${partition}' and requires '${expectedSuffix}'.`,
    );
  }

  const digestSeparator = repositoryReference.indexOf('@');
  if (digestSeparator >= 0) {
    return {
      account,
      partition,
      region,
      repositoryName: repositoryReference.slice(0, digestSeparator),
      tagOrDigest: repositoryReference.slice(digestSeparator + 1),
    };
  }

  const tagSeparator = repositoryReference.lastIndexOf(':');
  return {
    account,
    partition,
    region,
    repositoryName: tagSeparator >= 0 ? repositoryReference.slice(0, tagSeparator) : repositoryReference,
    ...(tagSeparator >= 0 ? { tagOrDigest: repositoryReference.slice(tagSeparator + 1) } : {}),
  };
}

function assertNoCodeBuildRegistryCredentials(
  image: string,
  credentials: CodeBuildImageCredentials | undefined,
  imageKind: string,
): void {
  if (credentials === undefined) return;
  throw new Error(
    `cdk-cicd: ci.codeBuildImageCredentials cannot be used with ${imageKind} ci.image '${image}'; ` +
      'only authenticated external registries use Secrets Manager registry credentials.',
  );
}

function importCodeBuildRegistrySecret(
  scope: Construct,
  id: string,
  credentials: CodeBuildImageCredentials,
): secretsmanager.ISecret {
  if (credentials.secretArn.trim().length === 0) {
    throw new Error('cdk-cicd: ci.codeBuildImageCredentials.secretArn must not be empty.');
  }
  if (credentials.encryptionKeyArn !== undefined && credentials.encryptionKeyArn.trim().length === 0) {
    throw new Error('cdk-cicd: ci.codeBuildImageCredentials.encryptionKeyArn must not be empty.');
  }
  const encryptionKey =
    credentials.encryptionKeyArn !== undefined
      ? kms.Key.fromKeyArn(scope, `${id}EncryptionKey`, credentials.encryptionKeyArn)
      : undefined;
  return secretsmanager.Secret.fromSecretAttributes(scope, id, {
    secretCompleteArn: credentials.secretArn,
    ...(encryptionKey !== undefined ? { encryptionKey } : {}),
  });
}

/**
 * `fromDockerRegistry` binds the secret and grants `GetSecretValue`. In aws-cdk-lib 2.195.0,
 * `Secret.grantRead` expresses a CMK grant through `ViaServicePrincipal`; an imported key has no
 * mutable resource policy, so add the project-role decrypt permission explicitly.
 */
function grantCodeBuildImageCredentialKeyDecrypt(
  project: codebuild.PipelineProject,
  credentials: CodeBuildImageCredentials | undefined,
): void {
  if (credentials?.encryptionKeyArn === undefined) return;
  project.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['kms:Decrypt'],
      resources: [credentials.encryptionKeyArn],
    }),
  );
}

/** Project-level values outrank buildspec env, so force the credential file outside the source tree here too. */
function withPrivateNpmConfig(environment: codebuild.BuildEnvironment, enabled: boolean): codebuild.BuildEnvironment {
  if (!enabled) return environment;
  return {
    ...environment,
    environmentVariables: {
      ...environment.environmentVariables,
      NPM_CONFIG_USERCONFIG: { value: PRIVATE_NPM_CONFIG_PATH },
    },
  };
}

/** Wrapper-owned values win over user project settings so application synthesis cannot bypass logging. */
function withComplianceLoggingEnvironment(
  environment: codebuild.BuildEnvironment,
  complianceLogging?: ComplianceLoggingEnvironment,
): codebuild.BuildEnvironment {
  if (complianceLogging === undefined) return environment;
  return {
    ...environment,
    environmentVariables: {
      ...environment.environmentVariables,
      [COMPLIANCE_LOG_BUCKET_NAME_FLAG]: { value: complianceLogging.bucketName },
      [COMPLIANCE_LOG_BUCKET_ACCOUNT_FLAG]: { value: complianceLogging.account },
      [COMPLIANCE_LOG_BUCKET_REGION_FLAG]: { value: complianceLogging.region },
    },
  };
}

/** Older/direct JSII callers may omit the newly introduced synthesizer object. */
function synthesizerType(config: ResolvedCicdConfig): SynthesizerType {
  return config.synthesizer?.type ?? SynthesizerType.DEFAULT;
}

/**
 * Which stages the CI/Build phase synthesizes, and therefore which stages can deploy from a promoted
 * assembly instead of synthesizing again (`task.md` D-deploy, rule 2 -- efficiency first).
 *
 * - `ASSEMBLY_PROMOTION`: every stage, always. The assemblies ARE the deployed artifacts, so narrowing
 *   would leave a stage with nothing to deploy -- hence `ci.synthStages` is rejected rather than
 *   silently ignored in this mode.
 * - `DEPLOY_TIME_SYNTH`: `ci.synthStages` when set, otherwise **one** stage (the first). Synthesizing
 *   every stage in CI and then again per stage was the concrete waste that prompted the amendment; the
 *   one stage CI does synth is promoted and reused rather than synthesized twice.
 */
function ciSynthStages(config: ResolvedCicdConfig, promote: boolean): string[] {
  const names = config.stages.map((s) => s.name);
  const configured = config.ci.synthStages;
  if (promote) {
    if (configured.length > 0) {
      throw new Error(
        'cdk-cicd: ci.synthStages cannot be narrowed when deployModel is ASSEMBLY_PROMOTION -- every ' +
          "stage's assembly is synthesized once and promoted, so restricting the set would leave a stage " +
          'with nothing to deploy. Remove ci.synthStages, or set deployModel: DEPLOY_TIME_SYNTH.',
      );
    }
    return names;
  }
  if (configured.length === 0) {
    return names.slice(0, 1);
  }
  const unknown = configured.filter((name) => !names.includes(name));
  if (unknown.length > 0) {
    throw new Error(`cdk-cicd: ci.synthStages names unknown stage(s): ${unknown.join(', ')}`);
  }
  return configured;
}

/** The synth command(s) the CI phase runs for `synthed`. */
function synthCommands(synthed: string[], promote: boolean): string[] {
  // `--all` when it really is all, so the emitted buildspec keeps saying what it means.
  return promote ? ['npx cdk-cicd synth --all'] : synthed.map((name) => `npx cdk-cicd synth --stage ${name}`);
}

/** The `codeartifact login` that binds npm to the private repo, defaulting to the pipeline's own env. */
function codeArtifactLogin(stack: Stack, ca: CodeArtifactConfig): string {
  const account = ca.account ?? stack.account;
  const region = ca.region ?? stack.region;
  const scope = ca.npmScope !== undefined && ca.npmScope.length > 0 ? ` --namespace ${ca.npmScope}` : '';
  return `aws codeartifact login --tool npm --domain ${ca.domain} --domain-owner ${account} --region ${region} --repository ${ca.repository}${scope}`;
}

/** The read grants `codeartifact login` + `npm ci` need: a bearer token and read on the repo. */
function grantCodeArtifactRead(project: codebuild.PipelineProject, ca: CodeArtifactConfig): void {
  const stack = Stack.of(project);
  const account = ca.account ?? stack.account;
  const region = ca.region ?? stack.region;
  project.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['codeartifact:GetAuthorizationToken'],
      resources: [`arn:${stack.partition}:codeartifact:${region}:${account}:domain/${ca.domain}`],
    }),
  );
  project.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['codeartifact:GetRepositoryEndpoint', 'codeartifact:ReadFromRepository'],
      resources: [`arn:${stack.partition}:codeartifact:${region}:${account}:repository/${ca.domain}/${ca.repository}`],
    }),
  );
  // The token is minted through STS on CodeArtifact's behalf; scoped to that service, not blanket.
  project.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['sts:GetServiceBearerToken'],
      resources: ['*'],
      conditions: { StringEquals: { 'sts:AWSServiceName': 'codeartifact.amazonaws.com' } },
    }),
  );
}

/** Create the private npm config with owner-only permissions before any login mutates it. */
function npmConfigSetupCommands(): string[] {
  return [
    `export NPM_CONFIG_USERCONFIG="${PRIVATE_NPM_CONFIG_PATH}"`,
    'rm -f "$NPM_CONFIG_USERCONFIG"',
    'umask 077 && touch "$NPM_CONFIG_USERCONFIG"',
  ];
}

/** Remove the credential-bearing file after the build, including failed build phases. */
function npmConfigCleanupCommands(): string[] {
  return ['rm -f "$NPM_CONFIG_USERCONFIG"'];
}

/**
 * Turn CodePipeline's resolved source revision into a valid, deterministic OCI tag.
 *
 * Git-backed source actions normally supply a full commit hash, which remains useful as-is after
 * lower-casing. S3 supplies an object revision/version identity instead, and other unexpected values
 * are hashed so characters such as `/`, `+`, or `=` can never produce an invalid Docker/ECR tag.
 */
function immutableImageTagCommands(sourceType: RepositorySourceType): string[] {
  const preserveGitCommit = sourceType !== RepositorySourceType.S3;
  const expression = preserveGitCommit
    ? '/^[0-9a-f]{40,64}$/i.test(value) ? value.toLowerCase() : hash(value)'
    : 'hash(value)';
  const nodeProgram =
    'const crypto = require("crypto"); ' +
    'const value = process.argv[1]; ' +
    'const hash = (input) => crypto.createHash("sha256").update(input).digest("hex"); ' +
    `process.stdout.write(${expression});`;
  return [
    'export SOURCE_REVISION="${CODEBUILD_RESOLVED_SOURCE_VERSION:?CODEBUILD_RESOLVED_SOURCE_VERSION is required for GIT_SHA image tagging}"',
    `export IMAGE_TAG="$(node -e '${nodeProgram}' "$SOURCE_REVISION")"`,
  ];
}

/**
 * Write the generic registry into the temporary npm config. The token itself is injected by CodeBuild
 * from Secrets Manager as `NPM_AUTH_TOKEN`, so it never appears in the synthesized buildspec.
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

/** Buildspec environment shared by proxy and generic npm-registry authentication. */
function buildSpecEnvironment(
  stack: Stack,
  proxy?: ProxyConfig,
  npmRegistry?: NpmRegistryConfig,
  codeArtifact?: CodeArtifactConfig,
):
  | {
      readonly variables?: Record<string, string>;
      readonly 'secrets-manager'?: Record<string, string>;
    }
  | undefined {
  const privateNpm = npmRegistry !== undefined || codeArtifact !== undefined;
  if (proxy === undefined && !privateNpm) return undefined;
  const variables = {
    ...(proxy !== undefined ? proxyEnvVariables(stack, proxy) : {}),
    ...(privateNpm ? { NPM_CONFIG_USERCONFIG: PRIVATE_NPM_CONFIG_PATH } : {}),
  };
  const secretsManager = {
    ...(proxy !== undefined ? proxySecretsManagerVars(proxy) : {}),
    ...(npmRegistry !== undefined ? { NPM_AUTH_TOKEN: npmRegistry.basicAuthSecretArn } : {}),
  };
  return {
    ...(Object.keys(variables).length > 0 ? { variables } : {}),
    ...(Object.keys(secretsManager).length > 0 ? { 'secrets-manager': secretsManager } : {}),
  };
}

/** The generic registry's bearer token and optional CMK are scoped to their exact ARNs. */
function grantNpmRegistrySecretRead(project: codebuild.PipelineProject, npmRegistry: NpmRegistryConfig): void {
  project.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [npmRegistry.basicAuthSecretArn],
    }),
  );
  const encryptionKeyArn = npmRegistry.encryptionKeyArn?.trim();
  if (encryptionKeyArn !== undefined && encryptionKeyArn.length > 0) {
    project.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt'],
        resources: [encryptionKeyArn],
      }),
    );
  }
}

/**
 * Plain (non-secret) proxy env vars every build project needs (v2 `CodeBuildFactoryProvider` parity).
 * An empty `noProxy` defaults to the project's own region's AWS endpoint, so AWS API calls (like
 * `codeartifact login`) bypass the proxy while everything else -- `npm ci` against public npm -- goes
 * through it.
 */
function proxyEnvVariables(stack: Stack, proxy: ProxyConfig): Record<string, string> {
  const domainSuffix = Token.isUnresolved(stack.region)
    ? stack.urlSuffix
    : (RegionInfo.get(stack.region).domainSuffix ?? stack.urlSuffix);
  const noProxy = proxy.noProxy.length > 0 ? proxy.noProxy : [`${stack.region}.${domainSuffix}`];
  return {
    AWS_STS_REGIONAL_ENDPOINTS: 'regional',
    NO_PROXY: noProxy.join(','),
    PROXY_SECRET_ARN: proxy.proxySecretArn,
  };
}

/** The secret's fields, referenced by `<arn>:<jsonKey>` so CodeBuild resolves them at container start. */
function proxySecretsManagerVars(proxy: ProxyConfig): Record<string, string> {
  return {
    PROXY_USERNAME: `${proxy.proxySecretArn}:username`,
    PROXY_PASSWORD: `${proxy.proxySecretArn}:password`,
    HTTP_PROXY_PORT: `${proxy.proxySecretArn}:http_proxy_port`,
    HTTPS_PROXY_PORT: `${proxy.proxySecretArn}:https_proxy_port`,
    PROXY_DOMAIN: `${proxy.proxySecretArn}:proxy_domain`,
  };
}

/** Export the proxy for every later shell command, then prove the tunnel works before install runs. */
function proxyInstallCommands(proxy: ProxyConfig): string[] {
  return [
    'export HTTP_PROXY="http://$PROXY_USERNAME:$PROXY_PASSWORD@$PROXY_DOMAIN:$HTTP_PROXY_PORT"',
    'export HTTPS_PROXY="https://$PROXY_USERNAME:$PROXY_PASSWORD@$PROXY_DOMAIN:$HTTPS_PROXY_PORT"',
    'echo "--- Proxy Test ---"',
    `curl -Is --connect-timeout 5 ${proxy.proxyTestUrl} | grep "HTTP/"`,
  ];
}

/** The read grant the proxy secret and its optional customer-managed KMS key need. */
function grantProxySecretRead(project: codebuild.PipelineProject, proxy: ProxyConfig): void {
  project.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [proxy.proxySecretArn],
    }),
  );
  const encryptionKeyArn = proxy.encryptionKeyArn?.trim();
  if (encryptionKeyArn !== undefined && encryptionKeyArn.length > 0) {
    project.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt'],
        resources: [encryptionKeyArn],
      }),
    );
  }
}
