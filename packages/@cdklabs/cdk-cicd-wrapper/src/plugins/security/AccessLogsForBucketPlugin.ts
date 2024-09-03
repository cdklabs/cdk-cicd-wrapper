// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { IAspect, Aspects, Names } from 'aws-cdk-lib';
import { CfnBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { GlobalResources, PluginBase, ResourceContext } from '../../common';

/**
 * Plugin to enable access logs for an S3 bucket.
 */
export class AccessLogsForBucketPlugin extends PluginBase {
  readonly name: string = 'AccessLogsForBucketPlugin';

  readonly version: string = '1.0';

  afterStage(scope: Construct, context: ResourceContext): void {
    const complianceLogBucketName = context.blueprintProps.deploymentDefinition[context.stage].complianceLogBucketName;

    if (complianceLogBucketName) {
      // ensure it has been initialized if the plugin is active
      context.get(GlobalResources.COMPLIANCE_BUCKET);
      Aspects.of(scope).add(new AccessLogsForBucketAspect(complianceLogBucketName));
    }
  }
}

class AccessLogsForBucketAspect implements IAspect {
  constructor(private complianceLogBucketName: string) {}

  visit(node: Construct): void {
    if (node instanceof CfnBucket && this.complianceLogBucketName) {
      // Configure S3 bucket logging
      node.loggingConfiguration = {
        destinationBucketName: this.complianceLogBucketName,
        logFilePrefix: Names.uniqueId(node),
      };
    }
  }
}
