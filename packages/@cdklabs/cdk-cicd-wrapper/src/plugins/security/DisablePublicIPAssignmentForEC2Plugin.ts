// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { IAspect, Aspects } from 'aws-cdk-lib';
import { CfnSubnet } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { IPlugin, ResourceContext } from '../../common';

/**
 * Plugin to disable public IP assignment for EC2 instances.
 */
export class DisablePublicIPAssignmentForEC2Plugin implements IPlugin {
  readonly name: string = 'DisablePublicIPAssignmentForEC2Plugin';

  readonly version: string = '1.0';

  afterStage(scope: Construct, _: ResourceContext): void {
    Aspects.of(scope).add(new DisablePublicIPAssignmentForEC2Aspect());
  }
}

class DisablePublicIPAssignmentForEC2Aspect implements IAspect {
  constructor() {}

  visit(node: Construct): void {
    if (node instanceof CfnSubnet) {
      // Disable public IP assignment for EC2 instances in the subnet
      node.mapPublicIpOnLaunch = false;
    }
  }
}
