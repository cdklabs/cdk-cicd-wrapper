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
import { Construct } from 'constructs';
import { ResolvedCicdConfig, ResolvedStage } from '../../config/types';
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

    pipeline.addStage({
      stageName: 'Source',
      actions: [buildSourceAction(scope, config.repository, sourceOutput)],
    });

    pipeline.addStage({
      stageName: 'Build',
      actions: [
        new actions.CodeBuildAction({
          actionName: 'Build',
          project: this.project(scope, 'BuildProject', this.ciCommands(config)),
          input: sourceOutput,
        }),
      ],
    });

    // One deploy action per stage; the region fan-out lives inside `cdk-cicd deploy`.
    for (const stage of config.stages) {
      const project = this.project(scope, `Deploy-${stage.name}`, [
        'npm ci',
        `npx cdk-cicd deploy --stage ${stage.name} --yes`,
      ]);
      this.grantDeployPermissions(scope, project, stage);

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
  }

  /**
   * Let a stage's deploy project actually deploy. `cdk deploy` does everything through the CDK
   * bootstrap roles, so the project's own role needs nothing but permission to assume them, plus any
   * forced deployer role the stage configures. Without this the project runs and fails AccessDenied.
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
  private grantDeployPermissions(scope: Construct, project: codebuild.PipelineProject, stage: ResolvedStage): void {
    const stack = Stack.of(scope);
    const account = stage.env.account ?? stack.account;
    // An empty region list means "wherever the pipeline itself runs" (an env-agnostic stage).
    const regions = stage.env.regions.length > 0 ? stage.env.regions : [stack.region];
    const qualifier = DefaultStackSynthesizer.DEFAULT_QUALIFIER;

    const roleArns = regions.flatMap((region) =>
      BOOTSTRAP_ROLE_KINDS.map(
        (kind) => `arn:${stack.partition}:iam::${account}:role/cdk-${qualifier}-${kind}-role-${account}-${region}`,
      ),
    );
    // Same emptiness guard the CLI applies before passing --role-arn: a blank configured role is
    // "no forced role", not an empty ARN (which would make the policy document malformed).
    const forcedDeployRole = stage.deployment?.deployRole;
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

  private project(scope: Construct, id: string, commands: string[]): codebuild.PipelineProject {
    return new codebuild.PipelineProject(scope, id, {
      environment:
        this.buildImage !== undefined
          ? { buildImage: codebuild.LinuxBuildImage.fromDockerRegistry(this.buildImage) }
          : undefined,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: { build: { commands } },
      }),
    });
  }
}
