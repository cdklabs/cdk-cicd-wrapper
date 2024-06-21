// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

<<<<<<< HEAD
<<<<<<< HEAD
import {GlobalResources, ResourceContext, IResourceProvider, Scope } from '../common';
=======
import { IVpcConstruct } from './VPCProvider';
import { ResourceContext, IResourceProvider, Scope, GlobalResources } from '../common';
>>>>>>> e8d8dbc (feat!: running custom resources in the VPC if the VPC is configured)
=======
import {GlobalResources, ResourceContext, IResourceProvider, Scope } from '../common';
>>>>>>> d89793e (feat: added config validator in synth)
import { ComplianceLogBucketStack } from '../stacks';

/**
 * Compliance Bucket configuration interface.
 * This interface defines the configuration properties for a compliance bucket.
 */
export interface IComplianceBucketConfig {
  /**
   * The name of the compliance bucket.
   */
  readonly bucketName: string;
}

/**
 * Compliance bucket provider which uses existing previously created buckets.
 * This class is responsible for providing a compliance bucket resource using an existing bucket.
 */
export class ComplianceBucketConfigProvider implements IResourceProvider {
  /**
   * The scope of the provider, which is set to PER_STAGE by default.
   * This means that the provider will create a separate resource for each stage.
   */
  scope? = Scope.PER_STAGE;

  /**
   * Provides the compliance bucket resource based on the given context.
   *
   * @param context The resource context containing environment information and blueprint properties.
   * @returns The ComplianceLogBucketStack instance representing the compliance bucket resource.
   */
  provide(context: ResourceContext): any {
    const { account, region } = context.environment;

    const vpcProvider = context.get(GlobalResources.VPC)!;

    const vpcProvider = context.get(GlobalResources.VPC)!;

    return new ComplianceLogBucketStack(
      context.scope,
      `${context.blueprintProps.applicationName}ComplianceLogBucketStack`,
      {
        complianceLogBucketName: `compliance-log-${account}-${region}`,
      },
    );
  }
}
