// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import { IPipelineBlueprintProps } from './PipelineBlueprint';
import { PostDeployExecutorStack } from './PostDeployExecutorStack';
import { AppStage, CDKPipeline, PostDeployBuildStep, PreDeployBuildStep } from '../code-pipeline';
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
import { IDeploymentHookConfigProvider } from '../resource-providers';

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

    Object.values(config.plugins).forEach((plugin) => (plugin.create ? plugin.create(this.resourceContext) : null));

    this.resourceContext.initStage(Stage.RES);
  }

  /**
   * Renders a pipeline stage by configuring the pre-deploy and post-deploy steps, and adding stacks to the stage.
   *
   * @param pipeline The CodePipeline instance to which the stage will be added.
   * @param stage The name of the stage to render.
   * @param deploymentDefinition The deployment definition containing information about the environment and stacks to deploy.
   */
  protected renderStage(pipeline: CDKPipeline, stage: string, deploymentDefinition: DeploymentDefinition) {
    const deploymentEnvironment = deploymentDefinition.env;

    if (stage == Stage.RES) {
      Object.values(this.config.plugins).forEach((plugin) =>
        plugin.beforeStage ? plugin.beforeStage(this.resourceContext.scope, this.resourceContext) : null,
      );
      // Allow to define additional stacks for RES stage
      deploymentDefinition.stacksProviders.forEach((stackProvider) => stackProvider.provide(this.resourceContext));

      Object.values(this.config.plugins).forEach((plugin) =>
        plugin.afterStage ? plugin.afterStage(this.resourceContext.scope, this.resourceContext) : null,
      );
      return;
    }

    // [Backward compatibility] Allows to ignore stages which was env variable ACCOUNT_{STAGE} has discovered but value is set to - to ignore
    if (deploymentEnvironment.account == '-') return;

    if (deploymentDefinition.stacksProviders.length == 0) {
      // Do not provision stage if there are no stacks to provision
      return;
    }

    this.resourceContext.initStage(stage);

    const appStage = this.resourceContext.get(GlobalResources.STAGE_PROVIDER)! as AppStage;

    const hooks = this.renderStacks(appStage, deploymentDefinition.stacksProviders);

    const stageConfig = appStage.config;

    pipeline.addStageWithV2Options(appStage, {
      pre: this.preStageSteps(deploymentDefinition, stage, hooks),
      post: this.postStageSteps(deploymentDefinition, stage, hooks),
      transitionToEnabled: !stageConfig.disableTransition,
      transitionDisabledReason: stageConfig.disableTransition,
      beforeEntry: stageConfig.beforeEntry,
      onFailure: stageConfig.onFailure,
      onSuccess: stageConfig.onSuccess,
    });
  }

  protected preStageSteps(deploymentDefinition: DeploymentDefinition, stage: string, hooks: DeploymentHookConfig[]) {
    const phaseDefinition = this.resourceContext.get(GlobalResources.PHASE)!;

    const preHooks: pipelines.Step[] = [];

    const preDeployCommands = phaseDefinition.getCommands(PipelinePhases.PRE_DEPLOY);

    if (preDeployCommands && preDeployCommands.length != 0) {
      preHooks.push(
        new PreDeployBuildStep(stage, {
          env: {
            TARGET_REGION: deploymentDefinition.env.region,
          },
          commands: preDeployCommands,
        }),
      );
    }

    preHooks.push(...hooks.flatMap((hook) => hook.pre ?? []));

    if (deploymentDefinition.manualApprovalRequired) {
      const approvalStep = new pipelines.ManualApprovalStep(`PromoteTo${stage}`);
      preHooks.forEach((step) => step.addStepDependency(approvalStep));
      preHooks.push(approvalStep);
    }

    return preHooks;
  }

  protected postStageSteps(deploymentDefinition: DeploymentDefinition, stage: string, hooks: DeploymentHookConfig[]) {
    const phaseDefinition = this.resourceContext.get(GlobalResources.PHASE)!;

    const postHooks: pipelines.Step[] = [];

    const postDeployCommands = phaseDefinition.getCommands(PipelinePhases.POST_DEPLOY);

    if (postDeployCommands && postDeployCommands.length != 0) {
      const roleArn = this.resourceContext.get(PostDeployExecutorStack.POST_DEPLOY_ROLE_ARN);
      if (!roleArn) {
        throw new Error(
          'Post deploy role arn is not defined. Please ensure the PostDeployExecutorStack is added to the stage.',
        );
      }
      postHooks.push(
        new PostDeployBuildStep(
          stage,
          {
            env: {
              ACCOUNT_ID: deploymentDefinition.env.account,
              TARGET_REGION: deploymentDefinition.env.region,
            },
            commands: phaseDefinition.getCommands(PipelinePhases.POST_DEPLOY),
          },
          this.resourceContext.blueprintProps.applicationName,
          roleArn,
        ),
      );
    }

    postHooks.push(...hooks.flatMap((hook) => hook.post ?? []));

    return postHooks;
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
      Object.values(this.config.plugins).forEach((plugin) =>
        plugin.beforeStage ? plugin.beforeStage(this.resourceContext.scope, this.resourceContext) : null,
      );
      stacksProviders.forEach((stackProvider) => {
        stackProvider.provide(this.resourceContext);
      });

      Object.values(this.config.plugins).forEach((plugin) =>
        plugin.afterStage ? plugin.afterStage(this.resourceContext.scope, this.resourceContext) : null,
      );
      const hookConfig = this.resourceContext.get(GlobalResources.HOOK) as IDeploymentHookConfigProvider;

      hooks.push(hookConfig.config);
    });

    return hooks;
  }
}
