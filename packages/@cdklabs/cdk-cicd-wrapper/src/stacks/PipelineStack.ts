// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Construct } from 'constructs';
import { IPipelineBlueprintProps } from './PipelineBlueprint';
import { PipelineBlueprintBase } from './PipelineBlueprintBase';
import { GlobalResources } from '../common';

/**
 * PipelineStack class responsible for creating the pipeline and its stages based on the provided deployment definition.
 */
export class PipelineStack extends PipelineBlueprintBase {
  /**
   * Constructs a new instance of the PipelineStack class.
   *
   * @param scope The construct scope in which the stack resides.
   * @param id The unique identifier for the stack.
   * @param config The configuration object containing the deployment definition and other pipeline blueprint properties.
   */
  constructor(scope: Construct, id: string, config: IPipelineBlueprintProps) {
    super(scope, id, config.deploymentDefinition.RES.env, config);

    // Retrieve global resources from the resource context
    this.resourceContext.get(GlobalResources.REPOSITORY);
    this.resourceContext.get(GlobalResources.PARAMETER_STORE);
    this.resourceContext.get(GlobalResources.ENCRYPTION);
    this.resourceContext.get(GlobalResources.VPC);
    const pipeline = this.resourceContext.get(GlobalResources.PIPELINE)!;

    // Render stages based on the deployment definition
    Object.entries(config.deploymentDefinition).forEach(([deploymentStage, deploymentDefinition]) => {
      this.renderStage(pipeline, deploymentStage, deploymentDefinition);
    });

    // Build the pipeline
    pipeline.buildPipeline();
  }
}
