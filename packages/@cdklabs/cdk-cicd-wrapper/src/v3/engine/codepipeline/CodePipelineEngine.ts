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
  aws_codebuild as codebuild,
  aws_codepipeline as codepipeline,
  aws_codepipeline_actions as actions,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ResolvedCicdConfig } from '../../config/types';
import { EngineRenderProps, IEngine } from '../types';
import { buildSourceAction } from './source';

/** Default CI commands when the config sets none. The engine, not the config layer, owns these. */
const DEFAULT_CI_COMMANDS = ['npm ci', 'npx cdk-cicd synth --all'];

/** Options for the CodePipeline engine. */
export interface CodePipelineEngineProps {
  /** CodeBuild image for the CI and deploy projects. Defaults to the standard Amazon Linux image. */
  readonly buildImage?: string;
}

/** Renders a resolved cicd config into an AWS CodePipeline. */
export class CodePipelineEngine implements IEngine {
  private readonly buildImage?: string;

  public constructor(props: CodePipelineEngineProps = {}) {
    this.buildImage = props.buildImage;
  }

  public render(scope: Construct, props: EngineRenderProps): void {
    const config = props.config;
    const sourceOutput = new codepipeline.Artifact();

    const pipeline = new codepipeline.Pipeline(scope, 'Pipeline', {
      pipelineName: props.pipelineName,
      restartExecutionOnUpdate: true,
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
      pipeline.addStage({
        stageName: stage.name,
        actions: [
          new actions.CodeBuildAction({
            actionName: `Deploy-${stage.name}`,
            project: this.project(scope, `Deploy-${stage.name}`, ['npm ci', `npx cdk-cicd deploy --stage ${stage.name} --yes`]),
            input: sourceOutput,
          }),
        ],
      });
    }
  }

  /** The CI/build commands: config-provided step values in order, else the engine default set. */
  private ciCommands(config: ResolvedCicdConfig): string[] {
    const steps = Object.values(config.ci.steps);
    return steps.length > 0 ? ['npm ci', ...steps] : DEFAULT_CI_COMMANDS;
  }

  private project(scope: Construct, id: string, commands: string[]): codebuild.PipelineProject {
    return new codebuild.PipelineProject(scope, id, {
      environment: this.buildImage !== undefined ? { buildImage: codebuild.LinuxBuildImage.fromDockerRegistry(this.buildImage) } : undefined,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: { build: { commands } },
      }),
    });
  }
}
