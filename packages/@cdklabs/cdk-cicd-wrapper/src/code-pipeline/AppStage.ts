// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
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

/**
 * Represents a stage in the application deployment process.
 * This class encapsulates the logic for creating and configuring a deployment stage in an application.
 * @class AppStage
 * @extends cdk.Stage - Inherits functionality from the cdk.Stage class.
 */
export class AppStage extends cdk.Stage {
  synth(options?: cdk.StageSynthesisOptions | undefined): cdk.cx_api.CloudAssembly {
    cdk.Aspects.of(this).add(new AwsSolutionsChecks({ verbose: false }));
    return super.synth(options);
  }
}
