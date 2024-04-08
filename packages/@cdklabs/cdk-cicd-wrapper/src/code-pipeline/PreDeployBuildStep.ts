// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as pipelines from 'aws-cdk-lib/pipelines';
import { CDKPipeline } from './CDKPipeline';

export class PreDeployBuildStep extends pipelines.CodeBuildStep {
  private stage: string;

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

  public appendManualApprovalStep(): pipelines.ManualApprovalStep {
    // append a pipelines.ManualApprovalStep AFTER the prebuild step and return it
    const manualApprovalStep = new pipelines.ManualApprovalStep(`PromoteTo${this.stage}`);
    manualApprovalStep.addStepDependency(this);
    return manualApprovalStep;
  }
}
