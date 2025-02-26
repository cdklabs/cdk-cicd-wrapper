// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { IAspect, Aspects, Names, Stack, Annotations } from 'aws-cdk-lib';
import { CfnBucket } from 'aws-cdk-lib/aws-s3';
import { Construct, IConstruct } from 'constructs';
import { GlobalResources, PluginBase, ResourceContext } from '../../common';

/**
 * Plugin to enable access logs for an S3 bucket.
 */
export class AccessLogsForBucketPlugin extends PluginBase {
  readonly name: string = 'AccessLogsForBucketPlugin';

  readonly version: string = '1.1';

  afterStage(scope: Construct, context: ResourceContext): void {
    const complianceLogBucketName = context.blueprintProps.deploymentDefinition[context.stage].complianceLogBucketName;
    const region = context.blueprintProps.deploymentDefinition[context.stage].env.region;

    if (complianceLogBucketName) {
      // ensure it has been initialized if the plugin is active
      context.get(GlobalResources.COMPLIANCE_BUCKET);
      Aspects.of(scope).add(new AccessLogsForBucketAspect(complianceLogBucketName, region));
    }
  }
}

class AccessLogsForBucketAspect implements IAspect {
  constructor(
    private complianceLogBucketName: string,
    private mainRegion: string,
  ) {}

  visit(node: Construct): void {
    if (node instanceof CfnBucket && this.complianceLogBucketName) {
      // Configure S3 bucket logging if none setup
      // Only allow overwritting of logFilePrefix if setup
      const stack = this.findStack(node);

      if (!stack) {
        throw new Error('Could not find stack for the bucket');
      }

      let complianceLogBucketName = this.complianceLogBucketName;

      if (stack.region !== this.mainRegion) {
        Annotations.of(node).addWarningV2(
          'access-logs-bucket-plugin-cross-region-used',
          'The Access Logs Bucket plugin is used cross region',
        );
        complianceLogBucketName = this.complianceLogBucketName.replace(this.mainRegion, stack.region);
      }

      if (node.loggingConfiguration === undefined) {
        node.loggingConfiguration = {
          destinationBucketName: complianceLogBucketName,
          logFilePrefix: Names.uniqueId(node),
        };
      } else {
        const currentLoggingConfig = node.loggingConfiguration as CfnBucket.LoggingConfigurationProperty;
        if (currentLoggingConfig.logFilePrefix) {
          node.loggingConfiguration = {
            destinationBucketName: complianceLogBucketName,
            logFilePrefix: currentLoggingConfig.logFilePrefix,
          };
        }
      }
    }
  }

  findStack(node: IConstruct): Stack | undefined {
    while (node && node.node.scope && !('stackName' in node)) {
      node = node.node.scope;
    }
    return node as Stack;
  }
}
