// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as kms from 'aws-cdk-lib/aws-kms';
import { IConstruct } from 'constructs';
import { ResourceContext, IResourceProvider, Scope } from '../common';
import { EncryptionStack } from '../stacks/EncryptionStack';

/**
 * Interface representing a construct for supplying an encryption key.
 */
export interface IEncryptionKey extends IConstruct {
  /**
   * The KMS Key used for encryption.
   */
  readonly kmsKey: kms.Key;
}

/**
 * A provider for encryption resources that creates dedicated encryption stacks in each stage.
 */
export class EncryptionProvider implements IResourceProvider {
  scope? = Scope.PER_STAGE; // The default scope for this provider is per stage.

  /**
   * Provides the encryption resources based on the given context.
   *
   * @param context The resource context containing information about the current scope, blueprint properties, stage, and environment.
   * @returns The EncryptionStack construct containing the encryption resources.
   */
  provide(context: ResourceContext): any {
    const { scope, blueprintProps, stage, environment } = context;

    return new EncryptionStack(scope, `${blueprintProps.applicationName}EncryptionStack`, {
      env: environment,
      applicationName: blueprintProps.applicationName,
      stageName: stage,
    });
  }
}
