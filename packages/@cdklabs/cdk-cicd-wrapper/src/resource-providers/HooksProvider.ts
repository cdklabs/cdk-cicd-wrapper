// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Step } from 'aws-cdk-lib/pipelines';
import { DeploymentHookConfig, GlobalResources, IResourceProvider, ResourceContext, Scope } from '../common';

export interface IDeploymentHookConfigProvider {
  readonly config: DeploymentHookConfig;

  addPreHook(hook: Step): void;

  addPostHook(hook: Step): void;
}

export class HookProvider implements IResourceProvider {
  scope? = Scope.PER_STAGE;

  provide(_: ResourceContext): any {
    return new BaseDeploymentHookConfig();
  }
}

class BaseDeploymentHookConfig implements IDeploymentHookConfigProvider {
  private _pre: Step[] = [];

  private _post: Step[] = [];

  get config() {
    return {
      pre: this._pre,
      post: this._post,
    };
  }

  addPreHook(hook: Step) {
    this._pre.push(hook);
  }

  addPostHook(hook: Step): void {
    this._post.push(hook);
  }
}

export class Hook {
  static addPreHook(hook: Step) {
    const hookConfigProvider = ResourceContext.instance().get(GlobalResources.HOOK) as IDeploymentHookConfigProvider;

    hookConfigProvider.addPreHook(hook);
  }

  static addPostHook(hook: Step) {
    const hookConfigProvider = ResourceContext.instance().get(GlobalResources.HOOK) as IDeploymentHookConfigProvider;

    hookConfigProvider.addPostHook(hook);
  }
}
