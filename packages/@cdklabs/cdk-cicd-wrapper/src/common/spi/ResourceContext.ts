// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Construct } from 'constructs';
import { IVanillaPipelineBlueprintProps } from '../../stacks';
import { IStage, Environment, Stage } from '../types/Types';

export enum Scope {
  GLOBAL = 'GLOBAL',
  PER_STAGE = 'PER_STAGE',
}

/**
 * Generic resource provider interface.
 **/
export interface IResourceProvider {
  scope?: Scope;

  provide(context: ResourceContext): any;
}

class ScopedStorage {
  private initialized: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private resources: Map<string, any> = new Map();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private providers: Map<string, IResourceProvider> = new Map();

  constructor(private resourceContext: ResourceContext) {}

  public add(name: string, provider: IResourceProvider): void {
    if (this.providers.has(name)) {
      throw new Error(`Overwriting ${name} resource during execution is not allowed.`);
    }
    this.providers.set(name, provider);
  }

  public has(name: string): boolean {
    return this.providers.has(name);
  }

  public get(name: string): any | undefined {
    const resource = this.resources.get(name) as any | undefined;

    if (resource) {
      return resource;
    }

    return this.initialize(name);
  }

  public initializeAll() {
    this.providers.forEach((_, key) => this.initialize(key));
  }

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resourceProviders: Map<string, IResourceProvider>;
}

/**
 * Provides API to register resource providers and get access to the provided resources.
 */
export class ResourceContext {
  static instance() {
    return ResourceContext._instance;
  }

  private static _instance: ResourceContext;

  private readonly globalScope: ScopedStorage;

  private stagedScope?: ScopedStorage;

  private _currentStage: string = Stage.RES;

  private _currentEnv?: Environment;

  constructor(
    private _scope: Construct,
    public readonly pipelineStack: Construct,
    public readonly blueprintProps: IVanillaPipelineBlueprintProps,
  ) {
    ResourceContext._instance = this;

    this.globalScope = new ScopedStorage(this);

    blueprintProps.resourceProviders;
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

  public get(name: string): any | undefined {
    if (this.globalScope.has(name)) {
      return this.globalScope.get(name);
    }
    return this.stagedScope!.get(name);
  }

  public has(name: string): boolean {
    return this.globalScope.has(name) || this.stagedScope!.has(name);
  }

  public get stage(): string {
    return this._currentStage;
  }

  public get environment(): Environment {
    return this._currentEnv!;
  }

  public get scope(): Construct {
    return this._scope;
  }
}

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
}
