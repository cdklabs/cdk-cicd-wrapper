// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Blueprint shipped this as `DisablePublicIPAssignmentForEC2Plugin`, on by default
// (m9-migrate-security-plugins). v3 has no plugin registry -- it is a plain `IAspect`, wired
// tree-wide by the runtime injection hook (m2-attach/m2-register) alongside cdk-nag, tags and log
// retention.
//
// Checks the CloudFormation resource type structurally (`CfnResource.isCfnResource` +
// `cfnResourceType`) rather than `instanceof CfnSubnet`: an `instanceof` check on an L1 CFN class
// can silently miss a match when the app resolves a second, physically distinct copy of
// `aws-cdk-lib` (the failure mode `m9-migrate-log-retention` hit against a real deploy).

import { IAspect, CfnResource } from 'aws-cdk-lib';
import { CfnSubnet } from 'aws-cdk-lib/aws-ec2';
import { IConstruct } from 'constructs';

const SUBNET_RESOURCE_TYPE = 'AWS::EC2::Subnet';

/**
 * Forces `MapPublicIpOnLaunch: false` on every VPC subnet it visits, matching Blueprint's default-on
 * `DisablePublicIPAssignmentForEC2Plugin`.
 */
export class DisablePublicIPAssignmentForEC2Aspect implements IAspect {
  public visit(node: IConstruct): void {
    if (CfnResource.isCfnResource(node) && node.cfnResourceType === SUBNET_RESOURCE_TYPE) {
      (node as CfnSubnet).mapPublicIpOnLaunch = false;
    }
  }
}
