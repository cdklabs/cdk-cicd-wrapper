// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { Construct } from 'constructs';
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
  /**
   * Creates an instance of AppStage.
   * @constructor
   * @param {Construct} scope - The scope in which the stage is created.
   * @param {string} id - The unique identifier for the stage.
   * @param {AppStageProps} props - The properties required to create the stage.
   */
  constructor(scope: Construct, id: string, props: AppStageProps) {
    super(scope, id, props);

    const context = props.context;

    context._scoped(this, () => {
      cdk.Aspects.of(this).add(new AwsSolutionsChecks({ verbose: false }));
    });
  }
}
