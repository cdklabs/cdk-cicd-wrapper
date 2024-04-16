// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IPipelineBlueprintProps } from './PipelineBlueprint';
import { PipelineBlueprintBase } from './PipelineBlueprintBase';
import { Environment, Stage, GlobalResources } from '../common';

import { SecurityControls } from '../utils';

export class SandboxStack extends PipelineBlueprintBase {
  constructor(
    scope: Construct,
    id: string,
    env: Environment,
    readonly config: IPipelineBlueprintProps,
  ) {
    super(scope, id, env, config);

    this.resourceContext.initStage(config.sandbox!.stageToUse);

    this.resourceContext.get(GlobalResources.PARAMETER_STORE);
    this.resourceContext.get(GlobalResources.ENCRYPTION);

    cdk.Aspects.of(scope).add(
      new SecurityControls(
        this.resourceContext.get(GlobalResources.ENCRYPTION)!.kmsKey,
        Stage.RES,
        config.logRetentionInDays,
        this.resourceContext.get(GlobalResources.COMPLIANCE_BUCKET)!.bucketName,
      ),
    );

    this.renderStacks(this, [config.sandbox?.stackProvider!]);
  }
}
