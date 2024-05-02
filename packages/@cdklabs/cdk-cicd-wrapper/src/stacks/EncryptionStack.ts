// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

/**
 * Properties for the EncryptionStack.
 */
export interface EncryptionStackProps extends cdk.StackProps {
  /**
   * The name of the application.
   */
  readonly applicationName: string;

  /**
   * The name of the stage.
   */
  readonly stageName: string;
}

/**
 * A stack that creates a KMS key for encryption and grants the necessary permissions.
 */
export class EncryptionStack extends cdk.Stack {
  /**
   * The KMS key created by this stack.
   */
  public readonly kmsKey: kms.Key;

  constructor(scope: Construct, id: string, props: EncryptionStackProps) {
    super(scope, id, props);

    /**
     * Creates a new KMS key with key rotation enabled and an alias based on the application name and stage name.
     */
    this.kmsKey = new kms.Key(this, 'Key', {
      enableKeyRotation: true,
      alias: `${props.applicationName}-${props.stageName}-key`,
    });

    /**
     * Grants the logs.${this.region}.amazonaws.com service principal the ability to encrypt and decrypt data using the KMS key.
     */
    this.kmsKey.grantEncryptDecrypt(new iam.ServicePrincipal(`logs.${this.region}.amazonaws.com`));

    /**
     * Creates a CloudFormation output with the ARN of the KMS key.
     */
    new cdk.CfnOutput(this, 'KeyArnCfnOutput', {
      value: this.kmsKey.keyArn,
      description: 'The id of the main kms key',
      exportName: `${props.applicationName}-${props.stageName}-kms-key-arn`,
    });
  }
}
