// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export interface EncryptionStackProps extends cdk.StackProps {
  readonly applicationName: string;
  readonly stageName: string;
}

export class EncryptionStack extends cdk.Stack {
  public readonly kmsKey: kms.Key;

  constructor(scope: Construct, id: string, props: EncryptionStackProps) {
    super(scope, id, props);

    this.kmsKey = new kms.Key(this, 'Key', {
      enableKeyRotation: true,
      alias: `${props.applicationName}-${props.stageName}-key`,
    });
    this.kmsKey.grantEncryptDecrypt(new iam.ServicePrincipal(`logs.${this.region}.amazonaws.com`));

    new cdk.CfnOutput(this, 'KeyArnCfnOutput', {
      value: this.kmsKey.keyArn,
      description: 'The id of the main kms key',
      exportName: `${props.applicationName}-${props.stageName}-kms-key-arn`,
    });
  }
}
