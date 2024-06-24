// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BaseStackProvider } from './BaseStackProvider';
import { ParameterResolver } from '../../utils';
import { ResourceContext } from '../spi/ResourceContext';

/**
 * Options for the DefaultStackProvider class.
 */
export interface DefaultStackProviderOptions {
  /**
   * Indicates whether to use the application name or not.
   * @default false
   */
  useApplicationName?: boolean;

  /**
   * The name of the provider.
   */
  providerName?: string;
}

/**
 * A class to store stage-specific values.
 */
class StageStore {
  private _records: Record<string, any> = {};

  /**
   * Adds a value to the store.
   * @param env The environment name.
   * @param key The key to store the value under.
   * @param value The value to store.
   */
  addValue(env: string, key: string, value: any): void {
    this._records[`${env}:${key}`] = value;
  }

  /**
   * Retrieves a value from the store.
   * @param env The environment name.
   * @param key The key to retrieve the value for.
   * @returns The stored value.
   * @throws {Error} If the value is not found.
   */
  getValue(env: string, key: string): any {
    const value = this._records[`${env}:${key}`];

    if (value) {
      return value;
    } else {
      throw new Error(`Value not found for key: ${key}`);
    }
  }
}

/**
 * An abstract class that extends BaseStackProvider and provides default functionality
 * for registering and retrieving values in a stage store.
 */
export abstract class DefaultStackProvider extends BaseStackProvider {
  private static stageStore: StageStore = new StageStore();

  private _stage?: Construct;
  private _appScope?: cdk.Stack;
  private _providerScope?: cdk.Stack;

  protected providerName: string;

  /**
   * Creates a new instance of the DefaultStackProvider class.
   * @param options The options for the provider.
   */
  constructor(options: DefaultStackProviderOptions = {}) {
    super();
    this.providerName = options.providerName ?? this.constructor.name;
  }

  /**
   * Provides resources based on the given context.
   * @param context The resource context.
   */
  provide(context: ResourceContext): void {
    this.cleanup();
    super.provide(context);
    this.cleanup();
  }

  private cleanup(): void {
    this._stage = undefined;
    this._appScope = undefined;
    this._providerScope = undefined;
  }

  /**
   * Registers a value in the stage store.
   * @param key The key to store the value under.
   * @param value The value to store.
   */
  register(key: string, value: any): void {
    DefaultStackProvider.stageStore.addValue((this.scope as cdk.Stack).environment, key, value);
  }

  /**
   * Retrieves a value from the stage store.
   * @param key The key to retrieve the value for.
   * @returns The stored value.
   * @throws {Error} If the value is not found.
   */
  get(key: string): any {
    return DefaultStackProvider.stageStore.getValue((this.scope as cdk.Stack).environment, key);
  }

  /**
   * Returns the scope for the provider.
   * @returns The provider scope.
   */
  protected get scope(): Construct {
    if (!this._providerScope) {
      this._stage = super.scope;

      if (this._stage.node.tryGetContext('workbench')) {
        this._appScope = this._stage as cdk.Stack;
        this._providerScope = this._appScope;
      } else {
        this._appScope =
          (this._stage.node.tryFindChild(this.applicationName) as cdk.Stack) ||
          new cdk.Stack(this._stage, this.applicationName);
        this._providerScope = new cdk.Stack(this._appScope, this.providerName);
      }
    }

    return this._providerScope;
  }

  /**
   * Resolves the value of an SSM parameter.
   * @param ssmParameterName The name of the SSM parameter.
   * @returns The resolved value of the SSM parameter.
   */
  resolve(ssmParameterName: string): string {
    return ParameterResolver.resolveValue(this._appScope!, 'resolve:ssm:' + ssmParameterName);
  }
}
