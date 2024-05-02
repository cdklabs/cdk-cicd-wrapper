// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IPipelineBlueprintProps } from './PipelineBlueprint';
import { PipelineBlueprintBase } from './PipelineBlueprintBase';
import { Environment, Stage, GlobalResources } from '../common';
import { SecurityControls } from '../utils';

/**
 * Represents a sandbox stack within the pipeline blueprint.
 */
export class SandboxStack extends PipelineBlueprintBase {
  /**
   * Creates a new instance of the SandboxStack class.
   *
   * @param scope The scope in which the stack is created.
   * @param id The unique identifier for the stack.
   * @param env The environment in which the stack is deployed.
   * @param config The pipeline blueprint configuration properties.
   */
  constructor(
    scope: Construct,
    id: string,
    env: Environment,
    readonly config: IPipelineBlueprintProps,
  ) {
    super(scope, id, env, config);

    // Initialize the stage for the sandbox stack
    this.resourceContext.initStage(config.sandbox!.options.stageToUse);

    // Retrieve the encryption key from the global resources
    this.resourceContext.get(GlobalResources.ENCRYPTION);

    // Add security controls to the stack
    cdk.Aspects.of(scope).add(
      new SecurityControls(
        this.resourceContext.get(GlobalResources.ENCRYPTION)!.kmsKey,
        Stage.RES,
        config.logRetentionInDays,
        this.resourceContext.get(GlobalResources.COMPLIANCE_BUCKET)!.bucketName,
      ),
    );

    // Render the stacks for the sandbox
    this.renderStacks(this, [config.sandbox?.stackProvider!]);
  }
}
