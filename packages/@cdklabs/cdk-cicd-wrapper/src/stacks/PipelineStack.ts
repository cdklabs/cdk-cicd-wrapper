// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IPipelineBlueprintProps } from './PipelineBlueprint';
import { PipelineBlueprintBase } from './PipelineBlueprintBase';
import { Stage, GlobalResources } from '../common';

import { SecurityControls } from '../utils';

export class PipelineStack extends PipelineBlueprintBase {
  constructor(scope: Construct, id: string, config: IPipelineBlueprintProps) {
    super(scope, id, config.deploymentDefinition.RES.env, config);

    this.resourceContext.get(GlobalResources.REPOSITORY);
    this.resourceContext.get(GlobalResources.PARAMETER_STORE);
    this.resourceContext.get(GlobalResources.ENCRYPTION);
    this.resourceContext.get(GlobalResources.VPC);
    const pipeline = this.resourceContext.get(GlobalResources.PIPELINE)!;

    cdk.Aspects.of(scope).add(
      new SecurityControls(
        this.resourceContext.get(GlobalResources.ENCRYPTION)!.kmsKey,
        Stage.RES,
        config.logRetentionInDays,
        this.resourceContext.get(GlobalResources.COMPLIANCE_BUCKET)!.bucketName,
      ),
    );

    Object.entries(config.deploymentDefinition).forEach(([deploymentStage, deploymentDefinition]) => {
      this.renderStage(pipeline, deploymentStage, deploymentDefinition);
    });

    pipeline.buildPipeline();
  }
}
