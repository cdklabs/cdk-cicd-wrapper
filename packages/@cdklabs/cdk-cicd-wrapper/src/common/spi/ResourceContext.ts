// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Construct } from 'constructs';
import { IPipelineBlueprintProps } from '../../stacks';
import { IStage, Environment, Stage } from '../types/Types';

/**
 * Defines the scope of a resource provider.
 */
export enum Scope {
  /**
   * The resource provider will be available globally across all stages.
   */
  GLOBAL = 'GLOBAL',

  /**
   * The resource provider will be available only within the current stage.
   */
  PER_STAGE = 'PER_STAGE',
}

/**
 * Interface representing a generic resource provider.
 * Provides resources through the `provide` method.
 */
export interface IResourceProvider {
  /**
   * The scope in which the resource provider is available.
   * Defaults to `Scope.GLOBAL`.
   */
  scope?: Scope;

  /**
   * Provides resources based on the given context.
   *
   * @param context The context in which the resources are provided.
   * @returns The provided resources.
   */
  provide(context: ResourceContext): any;
}

/**
 * Internal class used to manage scoped storage of resources and providers.
 */
class ScopedStorage {
  private initialized: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private resources: Map<string, any> = new Map();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private providers: Map<string, IResourceProvider> = new Map();

  constructor(private resourceContext: ResourceContext) {}

  /**
   * Adds a resource provider to the storage.
   *
   * @param name The name of the resource provider.
   * @param provider The resource provider instance.
   */
  public add(name: string, provider: IResourceProvider): void {
    if (this.providers.has(name)) {
      throw new Error(`Overwriting ${name} resource during execution is not allowed.`);
    }
    this.providers.set(name, provider);
  }

  /**
   * Checks if a resource provider with the given name exists in the storage.
   *
   * @param name The name of the resource provider.
   * @returns True if the resource provider exists, false otherwise.
   */
  public has(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * Retrieves a resource from the storage or initializes it if not already initialized.
   *
   * @param name The name of the resource.
   * @returns The resource, or undefined if it doesn't exist.
   */
  public get(name: string): any | undefined {
    const resource = this.resources.get(name) as any | undefined;

    if (resource) {
      return resource;
    }

    return this.initialize(name);
  }

  /**
   * Initializes all resources in the storage.
   */
  public initializeAll() {
    this.providers.forEach((_, key) => this.initialize(key));
  }

  /**
   * Initializes a resource by invoking its provider's `provide` method and stores the result in the storage.
   *
   * @param name The name of the resource to initialize.
   * @returns The initialized resource.
   */
  public initialize(name: string): any {
    if (this.initialized.indexOf(name) == -1) {
      if (!this.providers.has(name)) {
        throw new Error(`Missing ${name} provider.`);
      }

      const provider = this.providers.get(name) as IResourceProvider;

      const value = provider.provide(this.resourceContext);

      this.initialized.push(name);
      this.resources.set(name, value);

      return value;
    } else {
      return this.resources.get(name);
    }
  }
}

/** @internal */
export interface ResourceProviderSupplier {
  resourceProviders: Map<string, IResourceProvider>;
}

/**
 * Provides an API to register resource providers and access the provided resources.
 */
export class ResourceContext {
  /**
   * Returns the singleton instance of ResourceContext.
   *
   * @returns The ResourceContext instance.
   */
  static instance() {
    return ResourceContext._instance;
  }

  private static _instance: ResourceContext;

  private readonly globalScope: ScopedStorage;
  private stagedScope?: ScopedStorage;

  private _currentStage: string = Stage.RES;
  private _currentEnv?: Environment;

  /**
   * Constructs a new instance of ResourceContext.
   *
   * @param _scope The construct scope.
   * @param pipelineStack The pipeline stack construct.
   * @param blueprintProps The pipeline blueprint properties.
   */
  constructor(
    private _scope: Construct,
    public readonly pipelineStack: Construct,
    public readonly blueprintProps: IPipelineBlueprintProps,
  ) {
    ResourceContext._instance = this;

    this.globalScope = new ScopedStorage(this);

    for (const [key, resourceProvider] of Object.entries(blueprintProps.resourceProviders)) {
      if (!resourceProvider.scope || resourceProvider.scope == Scope.GLOBAL) {
        this.globalScope.add(key, resourceProvider);
      }
    }
  }

  /** @internal */
  public _scoped(scopeToUse: Construct, block: () => any) {
    const currentScope = this._scope;

    this._scope = scopeToUse;
    const result = block();

    this._scope = currentScope;

    return result;
  }

  /**
   * Initializes the current stage and its associated resource providers.
   *
   * @param stage The current stage.
   */
  public initStage(stage: IStage) {
    this.stagedScope = new ScopedStorage(this);

    this._currentStage = stage;
    this._currentEnv = this.blueprintProps.deploymentDefinition[stage].env;

    for (const [key, resourceProvider] of Object.entries(this.blueprintProps.resourceProviders)) {
      if (resourceProvider.scope && resourceProvider.scope == Scope.PER_STAGE) {
        this.stagedScope.add(key, resourceProvider);
      }
    }
  }

  /**
   * Retrieves a resource by its name.
   *
   * @param name The name of the resource.
   * @returns The resource, or undefined if it doesn't exist.
   */
  public get(name: string): any | undefined {
    if (this.globalScope.has(name)) {
      return this.globalScope.get(name);
    }
    return this.stagedScope!.get(name);
  }

  /**
   * Checks if a resource with the given name exists.
   *
   * @param name The name of the resource.
   * @returns True if the resource exists, false otherwise.
   */
  public has(name: string): boolean {
    return this.globalScope.has(name) || this.stagedScope!.has(name);
  }

  /**
   * Retrieves the current stage.
   *
   * @returns The current stage.
   */
  public get stage(): string {
    return this._currentStage;
  }

  /**
   * Retrieves the current environment.
   *
   * @returns The current environment.
   */
  public get environment(): Environment {
    return this._currentEnv!;
  }

  /**
   * Retrieves the current construct scope.
   *
   * @returns The current construct scope.
   */
  public get scope(): Construct {
    return this._scope;
  }
}

/**
 * Enum representing global resources.
 */
export enum GlobalResources {
  REPOSITORY = 'repository',
  VPC = 'vpc',
  PROXY = 'proxy',
  ENCRYPTION = 'encryption',
  PARAMETER_STORE = 'parameter-store',
  STAGE_PROVIDER = 'stage-provider',
  CODEBUILD_FACTORY = 'codebuild-factory',
  COMPLIANCE_BUCKET = 'compliance-bucket',
  PIPELINE = 'pipeline',
  PHASE = 'phase',
  ADDON_STORE = 'addon-store',
}
