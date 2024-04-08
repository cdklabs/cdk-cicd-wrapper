// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { ResourceContext, IResourceProvider, Scope } from '../common';
import { ComplianceLogBucketStack } from '../stacks';

/**
 * Compliance Bucket configuration
 */
export interface IComplianceBucketConfig {
  readonly bucketName: string;
}

/**
 * Compliance bucket provider which uses existing previously created buckets.
 */
export class ComplianceBucketConfigProvider implements IResourceProvider {
  scope? = Scope.PER_STAGE;

  provide(context: ResourceContext): any {
    const { account, region } = context.environment;

    return new ComplianceLogBucketStack(context.scope, `${context.blueprintProps.applicationName}ComplianceLogBucketStack`, {
      complianceLogBucketName: `compliance-log-${account}-${region}`,
    });
  }
}
