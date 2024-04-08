// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { AppStage } from '../code-pipeline/AppStage';
import { ResourceContext, IResourceProvider, Scope } from '../common';

/**
 * Provides AppStage definitions
 */
export class StageProvider implements IResourceProvider {
  scope? = Scope.PER_STAGE;

  provide(context: ResourceContext): any {
    const { scope, stage, environment } = context;

    return new AppStage(scope, stage, {
      env: environment,
      context,
    });
  }
}
