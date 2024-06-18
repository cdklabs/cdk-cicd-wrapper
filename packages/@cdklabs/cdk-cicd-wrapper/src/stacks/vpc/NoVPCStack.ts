// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { IVpcConstruct } from '../../resource-providers';

/**
 * A NoVPCStack that does not create a VPC.
 */
export class NoVPCStack implements IVpcConstruct {
  /**
   * The VPC created or looked up by this stack.
   */
  readonly vpc?: ec2.IVpc;

  /**
   * The security group attached to the VPC.
   */
  readonly securityGroup?: ec2.ISecurityGroup;

  /**
   * The subnet type attached to the VPC.
   */
  readonly subnetType?: ec2.SubnetType;

  /**
   * The list of CodeBuild VPC Interface VPC Endpoint AWS Services.
   */
  readonly codeBuildVPCInterfaces: ec2.InterfaceVpcEndpointAwsService[] = [];

  /**
   * Constructs a new instance of the NoVPCStack class.
   */
  constructor() {}
}
