// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { Construct } from 'constructs';
import { GlobalResources, ResourceContext } from '../common';
import { LogRetentionRoleStack } from '../stacks';
import { SecurityControls } from '../utils';

export interface AppStageProps extends cdk.StageProps {
  readonly context: ResourceContext;
}

export class AppStage extends cdk.Stage {
  private _logRetentionRoleArn = '';

  constructor(scope: Construct, id: string, props: AppStageProps) {
    super(scope, id, props);

    const context = props.context;

    const resAccount = context.blueprintProps.deploymentDefinition.RES.env.account;
    const applicationName = context.blueprintProps.applicationName;
    const logRetentionInDays = context.blueprintProps.logRetentionInDays;
    const stage = context.stage;

    context._scoped(this, () => {
      const complianceLogBucketName = context.get(GlobalResources.COMPLIANCE_BUCKET)!.bucketName;

      const encryptionStack = context.get(GlobalResources.ENCRYPTION)!;

      const logRetentionRoleStack = new LogRetentionRoleStack(this, `${applicationName}LogRetentionRoleStack`, {
        resAccount: resAccount,
        stageName: stage,
        applicationName: applicationName,
        encryptionKey: encryptionStack.kmsKey,
      });

      this._logRetentionRoleArn = logRetentionRoleStack.roleArn;

      cdk.Aspects.of(this).add(
        new SecurityControls(encryptionStack.kmsKey, stage, logRetentionInDays, complianceLogBucketName),
      );
      cdk.Aspects.of(this).add(new AwsSolutionsChecks({ verbose: false }));
    });
  }

  public get logRetentionRoleArn(): string {
    return this._logRetentionRoleArn;
  }
}
