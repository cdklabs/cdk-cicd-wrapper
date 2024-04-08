// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as kms from 'aws-cdk-lib/aws-kms';
import { IConstruct } from 'constructs';
import { ResourceContext, IResourceProvider, Scope } from '../common';
import { EncryptionStack } from '../stacks/EncryptionStack';

/**
 * Construct for supplying encryption key
 */
export interface IEncryptionKey extends IConstruct {
  /**
   * KMS Key
   */
  readonly kmsKey: kms.Key;
}

/**
 * Encryption key provider that creates dedicated encryption stacks in each stages.
 */
export class EncryptionProvider implements IResourceProvider {
  scope? = Scope.PER_STAGE;

  provide(context: ResourceContext): any {
    const { scope, blueprintProps, stage, environment } = context;

    return new EncryptionStack(scope, `${blueprintProps.applicationName}EncryptionStack`, {
      env: environment,
      applicationName: blueprintProps.applicationName,
      stageName: stage,
    });
  }
}
