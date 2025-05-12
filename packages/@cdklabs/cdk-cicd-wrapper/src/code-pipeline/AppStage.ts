// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import { AwsSolutionsChecks } from 'cdk-nag';
import { ResourceContext } from '../common';

/**
 * Interface for the properties required to create an AppStage.
 * This interface represents the configuration properties needed to create a stage in the application deployment process.
 * @interface AppStageProps
 * @extends cdk.StageProps - Inherits properties from the cdk.StageProps interface.
 * @property {ResourceContext} context - The resource context object containing deployment-related information.
 */
export interface AppStageProps extends cdk.StageProps {
  readonly context: ResourceContext;
}

export interface IStageConfig {
  /**
   * The reason for disabling the transition.
   */
  disableTransition?: string;

  /**
   * The method to use when a stage allows entry.
   *
   * @default - No conditions are applied before stage entry
   */
  beforeEntry?: codepipeline.Conditions;
  /**
   * The method to use when a stage has not completed successfully.
   *
   * @default - No failure conditions are applied
   */
  onFailure?: codepipeline.FailureConditions;
  /**
   * The method to use when a stage has succeeded.
   *
   * @default - No success conditions are applied
   */
  onSuccess?: codepipeline.Conditions;
}

/**
 * Represents a stage in the application deployment process.
 * This class encapsulates the logic for creating and configuring a deployment stage in an application.
 * @class AppStage
 * @extends cdk.Stage - Inherits functionality from the cdk.Stage class.
 */
export class AppStage extends cdk.Stage {
  /**
   * The stage configuration for PipelineV2
   */
  private _config: IStageConfig = {};

  synth(options?: cdk.StageSynthesisOptions | undefined): cdk.cx_api.CloudAssembly {
    cdk.Aspects.of(this).add(new AwsSolutionsChecks({ verbose: false }));
    return super.synth(options);
  }

  /**
   * Returns the stage configuration.
   *
   * @returns The stage configuration.
   */
  get config(): IStageConfig {
    return this._config;
  }

  /**
   * Sets the reason for disabling the transition.
   *
   * @param reason - The reason for disabling the transition.
   */
  disableTransition(reason: string): void {
    this._config.disableTransition = reason;
  }

  /**
   * Sets the conditions to be applied before the stage entry.
   *
   * @param conditions - The conditions to be applied before the stage entry.
   */
  addBeforeEntryCondition(conditions: codepipeline.Conditions): void {
    this._config.beforeEntry = {
      conditions: [...(this._config.beforeEntry?.conditions ?? []), ...(conditions.conditions ?? [])],
    };
  }

  /**
   * Sets the conditions to be applied when the stage has not completed successfully.
   *
   * @param conditions - The failure conditions to be applied.
   */
  onFailure(conditions: codepipeline.FailureConditions): void {
    if (this._config.onFailure) {
      throw new Error('onFailure is already set. You cannot set it again.');
    }

    this._config.onFailure = conditions;
  }

  /**
   * Sets the conditions to be applied when the stage has succeeded.
   *
   * @param conditions - The success conditions to be applied.
   */
  onSuccess(conditions: codepipeline.Conditions): void {
    if (this._config.onSuccess) {
      throw new Error('onSuccess is already set. You cannot set it again.');
    }

    this._config.onSuccess = conditions;
  }
}
