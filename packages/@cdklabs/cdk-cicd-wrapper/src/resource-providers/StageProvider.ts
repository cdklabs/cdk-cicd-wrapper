// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { AppStage } from '../code-pipeline/AppStage';
import { ResourceContext, IResourceProvider, Scope } from '../common';

/**
 * Provides AppStage definitions
 */
export class StageProvider implements IResourceProvider {
  /**
   * Scope at which the provider operates. Defaults to Scope.PER_STAGE.
   */
  scope? = Scope.PER_STAGE;

  /**
   * Provides an AppStage instance based on the given ResourceContext.
   *
   * @param context - The ResourceContext containing information about the current scope, stage, and environment.
   * @returns An instance of AppStage.
   */
  provide(context: ResourceContext): any {
    const { scope, stage, environment } = context;

    return new AppStage(scope, stage, {
      env: environment,
    });
  }
}
