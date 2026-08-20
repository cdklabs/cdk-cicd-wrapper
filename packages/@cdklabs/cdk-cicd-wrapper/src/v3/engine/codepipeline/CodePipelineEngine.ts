// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The CodePipeline engine. It builds a raw aws-codepipeline Pipeline (NOT CDK Pipelines) that is a
// thin orchestrator: source -> one CI/build project -> ONE CodeBuild deploy action per stage that
// runs `cdk-cicd deploy --stage <name>`. The deploy action reuses the M3 CLI, which synths per
// region at deploy time and handles multi-region itself -- so a stage with N regions is still one
// action, and there are no per-asset publishing projects. This flat footprint is the whole point:
// it replaces v2's per-asset/per-stage CDK Pipelines project sprawl.

import {
  DefaultStackSynthesizer,
  RemovalPolicy,
  Stack,
  aws_codebuild as codebuild,
  aws_codepipeline as codepipeline,
  aws_codepipeline_actions as actions,
  aws_iam as iam,
} from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { CodeArtifactConfig, ResolvedCicdConfig } from '../../config/types';
import { SupportResources } from '../../support/SupportResources';
import { EngineRenderProps, IEngine } from '../types';
import { buildSourceAction } from './source';

/**
 * Default CI commands when the config sets none. The engine, not the config layer, owns these.
 * `check` runs the validate/audit/license/security set before synth, which is what makes those checks
 * default-on in CI: a project that configures no `ci.steps` still gets them.
 */
const DEFAULT_CI_COMMANDS = ['npm ci', 'npx cdk-cicd check', 'npx cdk-cicd synth --all'];

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
    const support = new SupportResources(scope, 'Support', { removalPolicy: this.removalPolicy });

    const pipeline = new codepipeline.Pipeline(scope, 'Pipeline', {
      pipelineName: props.pipelineName,
      restartExecutionOnUpdate: true,
      // Our own bucket rather than the one CodePipeline would generate, so the artifact store is
      // encrypted with the wrapper's key and follows the configured removal policy.
      artifactBucket: support.artifactBucket,
    });

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

    pipeline.addStage({
      stageName: 'Build',
      actions: [
        new actions.CodeBuildAction({
          actionName: 'Build',
          project: this.project(scope, 'BuildProject', this.ciCommands(config), config.codeArtifact),
          input: sourceOutput,
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
    const selfUpdate = this.project(scope, 'UpdatePipeline', ['npm ci', deployCi], config.codeArtifact);
    this.grantDeployPermissions(selfUpdate, stack.account, [stack.region]);
    pipeline.addStage({
      stageName: 'UpdatePipeline',
      actions: [new actions.CodeBuildAction({ actionName: 'SelfMutate', project: selfUpdate, input: sourceOutput })],
    });

    // One deploy action per stage; the region fan-out lives inside `cdk-cicd deploy`.
    for (const stage of config.stages) {
      const project = this.project(
        scope,
        `Deploy-${stage.name}`,
        ['npm ci', `npx cdk-cicd deploy --stage ${stage.name} --yes`],
        config.codeArtifact,
      );
      // An empty region list means "wherever the pipeline itself runs" (an env-agnostic stage).
      const account = stage.env.account ?? stack.account;
      const regions = stage.env.regions.length > 0 ? stage.env.regions : [stack.region];
      this.grantDeployPermissions(project, account, regions, stage.deployment?.deployRole);

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
            input: sourceOutput,
            runOrder: stage.manualApproval ? 2 : 1,
          }),
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

  /** The CI/build commands: config-provided step values in order, else the engine default set. */
  private ciCommands(config: ResolvedCicdConfig): string[] {
    const steps = Object.values(config.ci.steps);
    return steps.length > 0 ? ['npm ci', ...steps] : DEFAULT_CI_COMMANDS;
  }

  private project(
    scope: Construct,
    id: string,
    commands: string[],
    codeArtifact?: CodeArtifactConfig,
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
    const install =
      this.buildImage === undefined ? { install: { 'runtime-versions': { nodejs: NODE_RUNTIME_VERSION } } } : {};
    // Every project runs `npm ci`; a private-registry login has to come first, or the install resolves
    // against public npm and fails on the private packages (the wrapper's own, before it is published).
    const phases = codeArtifact
      ? { ...install, pre_build: { commands: [codeArtifactLogin(stack, codeArtifact)] }, build: { commands } }
      : { ...install, build: { commands } };

    const project = new codebuild.PipelineProject(scope, id, {
      environment:
        this.buildImage !== undefined
          ? { buildImage: codebuild.LinuxBuildImage.fromDockerRegistry(this.buildImage) }
          : undefined,
      buildSpec: codebuild.BuildSpec.fromObject({ version: '0.2', phases }),
    });
    if (codeArtifact) {
      grantCodeArtifactRead(project, codeArtifact);
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
            "sts:AWSServiceName = codeartifact.amazonaws.com, which cdk-nag's IAM5 rule does not read.",
        },
      ],
      true,
    );
    return project;
  }
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
