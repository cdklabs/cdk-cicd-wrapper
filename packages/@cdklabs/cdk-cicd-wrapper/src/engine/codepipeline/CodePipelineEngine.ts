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
  Arn,
  ArnFormat,
  DefaultStackSynthesizer,
  Duration,
  RemovalPolicy,
  Stack,
  aws_lambda as lambda,
  aws_codebuild as codebuild,
  aws_codepipeline as codepipeline,
  aws_codepipeline_actions as actions,
  aws_ecr as ecr,
  aws_iam as iam,
} from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { buildSourceAction } from './source';
import { BuildImage, BuildImageKind, ImageTagStrategy } from '../../config/build-image';
import { CodeArtifactConfig, DeployModel, ProxyConfig, ResolvedCicdConfig } from '../../config/types';
import { SupportResources } from '../../support/SupportResources';
import { VpcNetworking } from '../../support/Vpc';
import { EngineRenderProps, IEngine } from '../types';

/**
 * Default CI commands when the config sets none. The engine, not the config layer, owns these.
 * `check` runs the validate/audit/license/security set before synth, which is what makes those checks
 * default-on in CI: a project that configures no `ci.steps` still gets them.
 */
const DEFAULT_CI_COMMANDS = ['npm ci', 'npx cdk-cicd check'];

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

/** Options for the CodePipeline engine. */
export interface CodePipelineEngineProps {
  /** CodeBuild image for the CI and deploy projects. Defaults to the standard Amazon Linux image. */
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
    const sourceOutput = new codepipeline.Artifact();
    const support = new SupportResources(scope, 'Support', {
      removalPolicy: this.removalPolicy,
      vpc: config.vpc,
      useProxy: config.proxy !== undefined,
      complianceLogBucketName: config.complianceLogBucketName,
    });
    const vpcNetworking = support.vpcNetworking;
    // v2 `ComplianceBucketProvider` provisioned this bucket eagerly whenever a name was configured
    // (default-on, not gated behind a separate opt-in); force the same here by reading the lazy
    // getter, so setting `complianceLogBucketName` alone is enough to get the bucket.
    if (config.complianceLogBucketName !== undefined) {
      void support.complianceLogBucket;
    }

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

    pipeline.addStage({
      stageName: 'Build',
      actions: [
        new actions.CodeBuildAction({
          actionName: 'Build',
          project: this.project(
            scope,
            'BuildProject',
            this.ciCommands(config, synthed, promote),
            config.codeArtifact,
            config.proxy,
            config.codeBuildEnvSettings,
            assembly !== undefined,
            config.ci.partialBuildSpec,
            vpcNetworking,
          ),
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
    const stack = Stack.of(scope);
    // The self-update must re-emit the SAME pipeline it is part of. A disposable pipeline that ran a
    // bare `deploy-ci` here would re-synth itself with the default RETAIN and quietly un-dispose its own
    // bucket and key on the first run -- so thread the flag through, keyed off the removal policy in hand.
    const deployCi =
      this.removalPolicy === RemovalPolicy.DESTROY ? 'npx cdk-cicd deploy-ci --disposable' : 'npx cdk-cicd deploy-ci';
    const selfUpdate = this.project(
      scope,
      'UpdatePipeline',
      ['npm ci', deployCi],
      config.codeArtifact,
      config.proxy,
      config.codeBuildEnvSettings,
      false,
      undefined,
      vpcNetworking,
    );
    this.grantDeployPermissions(selfUpdate, stack.account, [stack.region]);
    pipeline.addStage({
      stageName: 'UpdatePipeline',
      actions: [new actions.CodeBuildAction({ actionName: 'SelfMutate', project: selfUpdate, input: sourceOutput })],
    });

    // One deploy action per stage; the region fan-out lives inside `cdk-cicd deploy`.
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

      // With asyncDeploy the build only PREPARES change sets and exits; a Lambda executes and awaits them,
      // so no build minutes are billed for the CloudFormation wait (D-deploy-wait). The plan travels
      // through an SSM parameter whose name is fixed at render time, so both halves can name it without
      // the Lambda having to download and unzip a pipeline artifact.
      const planParam = config.asyncDeploy ? `/cdk-cicd/${props.pipelineName}/${stage.name}/deploy-plan` : undefined;
      const stageCmd =
        planParam !== undefined ? `${deployCmd} --prepare-only --plan-parameter ${planParam}` : deployCmd;

      const project = this.project(
        scope,
        `Deploy-${stage.name}`,
        ['npm ci', stageCmd],
        config.codeArtifact,
        config.proxy,
        config.codeBuildEnvSettings,
        false,
        undefined,
        vpcNetworking,
      );
      this.grantDeployPermissions(project, account, regions, stage.deployment?.deployRole);
      if (planParam !== undefined) {
        project.addToRolePolicy(
          new iam.PolicyStatement({
            actions: ['ssm:PutParameter'],
            resources: [`arn:${stack.partition}:ssm:${stack.region}:${stack.account}:parameter${planParam}`],
          }),
        );
      }

      const driver =
        planParam !== undefined ? this.deployDriver(scope, stage.name, planParam, account, regions) : undefined;

      // A gated stage puts its approval in the SAME pipeline stage as the deploy, ordered ahead of it,
      // rather than in a stage of its own: run order already sequences them, and one stage per
      // deployment stage keeps the pipeline's shape readable and matches the flat-footprint story.
      pipeline.addStage({
        stageName: stage.name,
        actions: [
          ...(stage.manualApproval
            ? [new actions.ManualApprovalAction({ actionName: `Approve-${stage.name}`, runOrder: 1 })]
            : []),
          new actions.CodeBuildAction({
            actionName: `Deploy-${stage.name}`,
            project,
            // Per stage, not per pipeline: a reusing stage takes the Build output (cdk.out + the few
            // source files `npm ci` needs), while a stage that still synthesizes must take the RAW
            // SOURCE -- the assembly artifact deliberately omits bin/ and lib/, so synthesizing from it
            // would fail.
            input: reuse && assembly !== undefined ? assembly : sourceOutput,
            runOrder: stage.manualApproval ? 2 : 1,
          }),
          // Ordered strictly after the prepare step: it reads the plan that step writes.
          ...(driver !== undefined
            ? [
                new actions.LambdaInvokeAction({
                  actionName: `Await-${stage.name}`,
                  lambda: driver,
                  userParameters: { planParameterName: planParam },
                  runOrder: stage.manualApproval ? 3 : 2,
                }),
              ]
            : []),
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
  }

  /**
   * Let a `cdk deploy` project actually deploy into `account`/`regions` -- a stage's application
   * deploy, or the self-update stage deploying the pipeline into its own account. `cdk deploy` does
   * everything through the CDK bootstrap roles, so the project's own role needs nothing but permission
   * to assume them, plus any forced deployer role passed in. Without this the project fails AccessDenied.
   *
   * The bootstrap version parameter is granted for the CLI's base-credentials path only; on the
   * normal path the CLI reads it under the *assumed* bootstrap role, not under this project's role.
   *
   * The qualifier is the bootstrap default because that is what the wrapper's synthesizer uses --
   * `resolveSynthesizer` builds a plain `DefaultStackSynthesizer` and does not thread the config's
   * `qualifier` through, so keying these ARNs off `config.qualifier` would point at roles that do not
   * exist. A user who sets the `@aws-cdk/core:bootstrapQualifier` context in their own `cdk.json`
   * does move their app's roles, and this grant does NOT follow -- see finding
   * `code-review-bootstrap-qualifier-not-single-source-of-truth`.
   */
  private grantDeployPermissions(
    project: codebuild.PipelineProject,
    account: string,
    regions: string[],
    forcedDeployRole?: string,
  ): void {
    const stack = Stack.of(project);
    const qualifier = DefaultStackSynthesizer.DEFAULT_QUALIFIER;

    const roleArns = regions.flatMap((region) =>
      BOOTSTRAP_ROLE_KINDS.map(
        (kind) => `arn:${stack.partition}:iam::${account}:role/cdk-${qualifier}-${kind}-role-${account}-${region}`,
      ),
    );
    // Same emptiness guard the CLI applies before passing --role-arn: a blank configured role is
    // "no forced role", not an empty ARN (which would make the policy document malformed).
    if (forcedDeployRole !== undefined && forcedDeployRole.length > 0) {
      roleArns.push(forcedDeployRole);
    }

    project.addToRolePolicy(new iam.PolicyStatement({ actions: ['sts:AssumeRole'], resources: roleArns }));
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
          });

    pipeline.addStage({ stageName: 'Source', actions: [buildSourceAction(scope, config.repository, sourceOutput)] });

    // The image tag: the resolved source commit, so the image is immutable and hash-versioned; `latest`
    // when the strategy asks for it. `CODEBUILD_RESOLVED_SOURCE_VERSION` is the commit CodeBuild checked
    // out. The registry URI is derived from the pipeline's own account/region at run time.
    const tag =
      build.tagStrategy === ImageTagStrategy.LATEST ? 'latest' : '${CODEBUILD_RESOLVED_SOURCE_VERSION:-latest}';
    const uri = `${stack.account}.dkr.ecr.${stack.region}.${stack.urlSuffix}/${repository.repositoryName}`;
    const commands = [
      ...(config.codeArtifact ? [codeArtifactLogin(stack, config.codeArtifact)] : []),
      'npm ci',
      'npx cdk-cicd check',
      // Log in to ECR, build the deployer image from the source, tag by commit, push. The image payload
      // is the app + deps (per the Dockerfile), NOT cdk.out -- Repo 2 synths at run time.
      `aws ecr get-login-password --region ${stack.region} | docker login --username AWS --password-stdin ${stack.account}.dkr.ecr.${stack.region}.${stack.urlSuffix}`,
      `docker build -f ${build.dockerfile} -t ${uri}:${tag} .`,
      `docker push ${uri}:${tag}`,
    ];

    // The proxy's exports run first, in `install` -- ahead of the codeArtifact login and `npm ci`, same
    // ordering as `project()` (NO_PROXY is what lets the AWS-API-bound `codeartifact login` skip the
    // proxy while `npm ci` against public npm goes through it).
    const install = {
      ...(this.buildImage === undefined ? { 'runtime-versions': { nodejs: NODE_RUNTIME_VERSION } } : {}),
      ...(config.proxy ? { commands: proxyInstallCommands(config.proxy) } : {}),
    };

    const project = new codebuild.PipelineProject(scope, 'BuildImage', {
      // Docker builds need a privileged environment; runtime pinned like the deploy projects.
      // `codeBuildEnvSettings` still contributes computeType/environmentVariables here -- only
      // `privileged` is forced (Docker requires it regardless of what the config says).
      environment: { ...this.buildEnvironment(config.codeBuildEnvSettings), privileged: true },
      vpc: vpcNetworking?.vpc,
      securityGroups: vpcNetworking?.securityGroups,
      subnetSelection: vpcNetworking?.subnetSelection,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          ...(Object.keys(install).length > 0 ? { install } : {}),
          build: { commands },
        },
        // The proxy credentials/ports live in Secrets Manager, not in plain env vars.
        ...(config.proxy
          ? {
              env: {
                variables: proxyEnvVariables(stack, config.proxy),
                'secrets-manager': proxySecretsManagerVars(config.proxy),
              },
            }
          : {}),
      }),
    });
    repository.grantPullPush(project);
    if (config.codeArtifact) grantCodeArtifactRead(project, config.codeArtifact);
    if (config.proxy) grantProxySecretRead(project, config.proxy);
    // Provisioned repos derive the URI from the pipeline account; a referenced repo may be elsewhere, but
    // grantPullPush + ECR's token endpoint cover same-account. (Cross-account push is a later slice.)

    pipeline.addStage({
      stageName: 'BuildImage',
      actions: [new actions.CodeBuildAction({ actionName: 'BuildAndPush', project, input: sourceOutput })],
    });

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
    // NOTE: no sts:AssumeRole for a stage's `deployRole`. That role is a CloudFormation SERVICE role
    // (trusted by cloudformation.amazonaws.com), baked into the change set as its RoleARN via
    // `cdk deploy --role-arn`; CloudFormation assumes it at ExecuteChangeSet time. The Lambda executes
    // the change set under its OWN identity and does not -- cannot -- assume that role.

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
    const base = steps.length > 0 ? ['npm ci', ...steps] : DEFAULT_CI_COMMANDS;
    // The synth is appended, never replaced by `ci.steps`. In promotion mode it produces the artifact
    // every deploy stage consumes, so a config that dropped it would render a pipeline that cannot
    // deploy at all; in deploy-time-synth mode it is the validation gate. `ci.steps` still replaces the
    // check step -- see finding `code-review-ci-steps-replace-drops-checks`, unchanged here.
    return [...base, ...synthCommands(synthed, promote)];
  }

  private project(
    scope: Construct,
    id: string,
    commands: string[],
    codeArtifact?: CodeArtifactConfig,
    proxy?: ProxyConfig,
    codeBuildEnvSettings?: codebuild.BuildEnvironment,
    publishAssembly = false,
    partialBuildSpec?: codebuild.BuildSpec,
    vpcNetworking?: VpcNetworking,
  ): codebuild.PipelineProject {
    const stack = Stack.of(scope);
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
      ...(this.buildImage === undefined ? { 'runtime-versions': { nodejs: NODE_RUNTIME_VERSION } } : {}),
      ...(proxy ? { commands: proxyInstallCommands(proxy) } : {}),
    };
    // Every project runs `npm ci`; a private-registry login has to come first, or the install resolves
    // against public npm and fails on the private packages (the wrapper's own, before it is published).
    const preBuildCommands = codeArtifact ? [codeArtifactLogin(stack, codeArtifact)] : [];
    const phases = {
      ...(Object.keys(install).length > 0 ? { install } : {}),
      ...(preBuildCommands.length > 0 ? { pre_build: { commands: preBuildCommands } } : {}),
      build: { commands },
    };

    const generatedBuildSpec = codebuild.BuildSpec.fromObject({
      version: '0.2',
      phases,
      // The proxy credentials/ports live in Secrets Manager, not in plain env vars.
      ...(proxy
        ? { env: { variables: proxyEnvVariables(stack, proxy), 'secrets-manager': proxySecretsManagerVars(proxy) } }
        : {}),
      // Publish the WHOLE source tree plus the synthesized assembly, excluding only node_modules (the
      // deploy re-runs `npm ci`). A hardcoded file allowlist was wrong: `cdk-cicd deploy --from-assembly`
      // still loads `cicd.config.ts` under ts-node, so a config that imports another file, a tsconfig it
      // compiles against, or a package.json `postinstall`/`prepare` that reads `scripts/`/`patches/` --
      // all ordinary layouts -- would be missing from the artifact and fail at the deploy stage, after
      // Build had already gone green. Excluding node_modules keeps the artifact from ballooning.
      ...(publishAssembly ? { artifacts: { files: ['**/*'], 'exclude-paths': ['node_modules/**/*'] } } : {}),
    });

    const project = new codebuild.PipelineProject(scope, id, {
      environment: this.buildEnvironment(codeBuildEnvSettings),
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
    if (codeArtifact) {
      grantCodeArtifactRead(project, codeArtifact);
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
            'When a proxy is configured this also covers the cross-account KMS grant on key/* under the ' +
            "secret's own account/region -- Secrets Manager does not expose a per-key ARN to scope to. " +
            'When a VPC is configured this also covers the CodeBuild-managed network-interface permissions ' +
            '(ec2:CreateNetworkInterface/DescribeNetworkInterfaces/DeleteNetworkInterface/DescribeSubnets/' +
            'DescribeSecurityGroups/DescribeDhcpOptions/DescribeVpcs on Resource "*"), which CDK generates ' +
            "for every VPC-attached CodeBuild project and which EC2 cannot scope to an ENI that doesn't " +
            'exist yet.',
        },
      ],
      true,
    );
    return project;
  }

  /**
   * Merge v2 `codeBuildEnvSettings` (privileged mode, compute type, environment variables --
   * `CodeBuildFactoryProvider` parity) into a project's `environment`, applied uniformly to every
   * CodeBuild project like v2 did. The engine's own `buildImage` ctor prop (a Docker-registry image
   * string) wins over `codeBuildEnvSettings.buildImage` (a full `IBuildImage`) when both are set -- it
   * is the more specific, code-level choice.
   */
  private buildEnvironment(settings?: codebuild.BuildEnvironment): codebuild.BuildEnvironment | undefined {
    const buildImage =
      this.buildImage !== undefined
        ? codebuild.LinuxBuildImage.fromDockerRegistry(this.buildImage)
        : settings?.buildImage;
    if (settings === undefined && buildImage === undefined) return undefined;
    return { ...settings, ...(buildImage !== undefined ? { buildImage } : {}) };
  }
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

/**
 * Plain (non-secret) proxy env vars every build project needs (v2 `CodeBuildFactoryProvider` parity).
 * An empty `noProxy` defaults to the project's own region's AWS endpoint, so AWS API calls (like
 * `codeartifact login`) bypass the proxy while everything else -- `npm ci` against public npm -- goes
 * through it.
 */
function proxyEnvVariables(stack: Stack, proxy: ProxyConfig): Record<string, string> {
  const noProxy = proxy.noProxy.length > 0 ? proxy.noProxy : [`${stack.region}.amazonaws.com`];
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

/** The read grant the proxy secret needs, plus cross-account KMS decrypt when the secret lives elsewhere. */
function grantProxySecretRead(project: codebuild.PipelineProject, proxy: ProxyConfig): void {
  const stack = Stack.of(project);
  project.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [proxy.proxySecretArn],
    }),
  );
  const secretAccount = Arn.split(proxy.proxySecretArn, ArnFormat.SLASH_RESOURCE_NAME).account;
  if (secretAccount !== undefined && secretAccount !== stack.account) {
    const secretRegion = Arn.split(proxy.proxySecretArn, ArnFormat.SLASH_RESOURCE_NAME).region;
    project.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt', 'kms:DescribeKey', 'kms:Encrypt', 'kms:GenerateDataKey*', 'kms:ReEncrypt*'],
        resources: [`arn:${stack.partition}:kms:${secretRegion}:${secretAccount}:key/*`],
      }),
    );
  }
}
