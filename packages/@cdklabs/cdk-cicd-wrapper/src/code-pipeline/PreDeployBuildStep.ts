// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as pipelines from 'aws-cdk-lib/pipelines';
import { CDKPipeline } from './CDKPipeline';

/**
 * A class that extends the CodeBuildStep class from the aws-cdk-lib/pipelines module.
 * This class is used to create a pre-deployment build step for a specific stage in a pipeline.
 */
export class PreDeployBuildStep extends pipelines.CodeBuildStep {
  private stage: string;

  /**
   * Creates a new instance of the PreDeployBuildStep class.
   *
   * @param stage - The stage for which the pre-deployment build step is being created.
   * @param props - The properties to be used for creating the CodeBuildStep.
   */
  constructor(stage: string, props: pipelines.CodeBuildStepProps) {
    super(`PreDeploy${stage}`, {
      ...props,
      env: {
        ...props.env,
        STAGE: stage,
      },
      commands: [...CDKPipeline.installCommands, ...props.commands],
    });
    this.stage = stage;
  }

  /**
   * Appends a manual approval step to the pipeline after the pre-deployment build step.
   *
   * @returns A new instance of the ManualApprovalStep class representing the manual approval step.
   */
  public appendManualApprovalStep(): pipelines.ManualApprovalStep {
    // append a pipelines.ManualApprovalStep AFTER the prebuild step and return it
    const manualApprovalStep = new pipelines.ManualApprovalStep(`PromoteTo${this.stage}`);
    manualApprovalStep.addStepDependency(this);
    return manualApprovalStep;
  }
}
