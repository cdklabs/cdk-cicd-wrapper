// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import { IPipelineBlueprintProps } from './PipelineBlueprint';
import { PostDeployBuildStep, PreDeployBuildStep } from '../code-pipeline';
import {
  DeploymentDefinition,
  Environment,
  PipelinePhases,
  Stage,
  GlobalResources,
  ResourceContext,
  IStackProvider,
  DeploymentHookConfig,
} from '../common';

/**
 * Base class for pipeline blueprints.
 * This class provides common functionality for creating and configuring pipeline stages.
 */
export class PipelineBlueprintBase extends cdk.Stack {
  protected resourceContext: ResourceContext;

  /**
   * Creates a new instance of the PipelineBlueprintBase class.
   *
   * @param scope The parent construct.
   * @param id The unique identifier for the construct.
   * @param env The environment configuration for the stack.
   * @param config The configuration properties for the pipeline blueprint.
   */
  constructor(
    scope: Construct,
    id: string,
    env: Environment,
    readonly config: IPipelineBlueprintProps,
  ) {
    super(scope, id, { env });

    this.resourceContext = new ResourceContext(scope, this, config);

    this.resourceContext.initStage(Stage.RES);
  }

  /**
   * Renders a pipeline stage by configuring the pre-deploy and post-deploy steps, and adding stacks to the stage.
   *
   * @param pipeline The CodePipeline instance to which the stage will be added.
   * @param stage The name of the stage to render.
   * @param deploymentDefinition The deployment definition containing information about the environment and stacks to deploy.
   */
  protected renderStage(pipeline: pipelines.CodePipeline, stage: string, deploymentDefinition: DeploymentDefinition) {
    const deploymentEnvironment = deploymentDefinition.env;

    if (stage == Stage.RES) {
      // Allow to define additional stacks for RES stage
      deploymentDefinition.stacksProviders.forEach((stackProvider) => stackProvider.provide(this.resourceContext));
      return;
    }

    // [Backward compatibility] Allows to ignore stages which was env variable ACCOUNT_{STAGE} has discovered but value is set to - to ignore
    if (deploymentEnvironment.account == '-') return;

    const phaseDefinition = this.resourceContext.get(GlobalResources.PHASE)!;
    this.resourceContext.initStage(stage);
    const preDeployStep = new PreDeployBuildStep(stage, {
      env: {
        TARGET_REGION: deploymentEnvironment.region,
      },
      commands: phaseDefinition.getCommands(PipelinePhases.PRE_DEPLOY),
    });

    const appStage = this.resourceContext.get(GlobalResources.STAGE_PROVIDER)!;

    const hooks = this.renderStacks(appStage, deploymentDefinition.stacksProviders);

    pipeline.addStage(appStage, {
      pre: [
        preDeployStep,
        // add manual approval step for all stages, except DEV
        ...(stage != Stage.DEV ? [preDeployStep.appendManualApprovalStep()] : []),
        ...hooks.flatMap((hook) => hook.pre ?? []),
      ],
      post: [
        new PostDeployBuildStep(
          stage,
          {
            env: {
              ACCOUNT_ID: deploymentEnvironment.account,
              TARGET_REGION: deploymentEnvironment.region,
            },
            commands: phaseDefinition.getCommands(PipelinePhases.POST_DEPLOY),
          },
          this.resourceContext.blueprintProps.applicationName,
          this.resourceContext.blueprintProps.logRetentionInDays,
          appStage.logRetentionRoleArn,
        ),
        ...hooks.flatMap((hook) => hook.post ?? []),
      ],
    });
  }

  /**
   * Renders the stacks for a given stage by invoking the `provide` method on each stack provider.
   *
   * @param scope The scope in which the stacks should be rendered.
   * @param stacksProviders The array of stack providers.
   * @returns An array of deployment hook configurations for the rendered stacks.
   */
  protected renderStacks(scope: Construct, stacksProviders: IStackProvider[]) {
    const hooks: DeploymentHookConfig[] = [];

    this.resourceContext._scoped(scope, () => {
      stacksProviders.forEach((stackProvider) => {
        const hookConfig = stackProvider.provide(this.resourceContext);

        if (hookConfig) {
          hooks.push(hookConfig);
        }
      });
    });

    return hooks;
  }
}
