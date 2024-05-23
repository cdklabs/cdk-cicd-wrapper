// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Step } from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import { DeploymentHookConfig, IPipelineConfig, IStackProvider, ResourceContext } from '../';

/**
 * Abstract base class for providing stacks to a deployment pipeline.
 * This class implements the IStackProvider interface and provides default implementation
 * for providing deployment hook configurations (pre and post hooks) and accessing context properties.
 */
export abstract class BaseStackProvider implements IStackProvider {
  private _context?: ResourceContext;

  private _scope?: Construct;

  private _env?: cdk.Environment;

  private _stageName?: string;

  private _applicationName?: string;

  private _applicationQualifier?: string;

  private _properties?: IPipelineConfig;

  /**
   * Provides the deployment hook configuration for this stack provider.
   * @param context The resource context containing the scope, stage, environment, and blueprint properties.
   * @returns The deployment hook configuration with pre and post hooks.
   */
  provide(context: ResourceContext): DeploymentHookConfig {
    this._context = context;
    this._scope = context.scope;
    this._stageName = context.stage;
    this._applicationName = context.blueprintProps.applicationName;
    this._applicationQualifier = context.blueprintProps.applicationQualifier;
    this._env = context.environment;
    this._properties = context.blueprintProps;

    this.stacks(context);

    return {
      pre: this.preHooks(),
      post: this.postHooks(),
    };
  }

  /**
   * Returns the pre-deployment hook steps for this stack provider.
   * @returns An array of pre-deployment hook steps.
   */
  protected preHooks(): Step[] {
    return [];
  }

  /**
   * Returns the post-deployment hook steps for this stack provider.
   * @returns An array of post-deployment hook steps.
   */
  protected postHooks(): Step[] {
    return [];
  }

  /**
   * Abstract method that must be implemented by subclasses to define the stacks to be deployed.
   * @param context The resource context containing the scope, stage, environment, and blueprint properties.
   */
  abstract stacks(context: ResourceContext): void;

  /**
   * Getter for the resource context.
   * @returns The resource context containing the scope, stage, environment, and blueprint properties.
   */
  protected get context(): ResourceContext {
    return this._context!;
  }

  /**
   * Getter for the deployment scope.
   * @returns The deployment scope construct.
   */
  protected get scope(): Construct {
    return this._scope!;
  }

  /**
   * Getter for the deployment environment.
   * @returns The deployment environment.
   */
  protected get env(): cdk.Environment {
    return this._env!;
  }

  /**
   * Getter for the stage name.
   * @returns The name of the deployment stage.
   */
  protected get stageName(): string {
    return this._stageName!;
  }

  /**
   * Getter for the application name.
   * @returns The name of the application being deployed.
   */
  protected get applicationName(): string {
    return this._applicationName!;
  }

  /**
   * Getter for the application qualifier.
   * @returns The qualifier for the application being deployed.
   */
  protected get applicationQualifier(): string {
    return this._applicationQualifier!;
  }

  /**
   * Getter for the pipeline configuration properties.
   * @returns The pipeline configuration properties.
   */
  protected get properties(): IPipelineConfig {
    return this._properties!;
  }
}
