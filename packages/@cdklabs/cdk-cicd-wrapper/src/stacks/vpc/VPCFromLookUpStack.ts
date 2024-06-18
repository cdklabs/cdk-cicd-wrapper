// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

/**
 * Properties for the VPCStack.
 */
export interface VPCFromLookUpStackProps extends cdk.StackProps {
  /**
   * The configuration for the VPC to be created or looked up.
   */
  readonly vpcId: string;

  /**
   * The list of CodeBuild VPC InterfacesVpcEndpointAwsServices to extend the defaultCodeBuildVPCInterfaces
   */
  readonly codeBuildVPCInterfaces?: ec2.InterfaceVpcEndpointAwsService[];
}

/**
 * A stack that creates or looks up a VPC and configures its settings.
 */
export class VPCFromLookUpStack extends cdk.Stack {
  /**
   * The VPC created or looked up by this stack.
   */
  readonly vpc: ec2.IVpc;

  /**
   * The security group attached to the VPC
   */
  readonly securityGroup?: ec2.ISecurityGroup;

  /**
   * The subnets attached to the VPC
   */
  readonly subnetType?: ec2.SubnetType;

  /**
   * The list of CodeBuild VPC InterfacesVpcEndpointAwsServices
   */
  readonly codeBuildVPCInterfaces: ec2.InterfaceVpcEndpointAwsService[];

  /**
   * The ID of the VPC being created or looked up.
   */
  readonly vpcId: string;

  constructor(scope: Construct, id: string, props: VPCFromLookUpStackProps) {
    super(scope, id, props);

    /**
     * Default list of CodeBuild VPC InterfacesVpcEndpointAwsServices,
     * which can be extended by the codeBuildVPCInterfaces prop.
     */
    this.codeBuildVPCInterfaces = [
      ec2.InterfaceVpcEndpointAwsService.SSM,
      ec2.InterfaceVpcEndpointAwsService.STS,
      ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      ec2.InterfaceVpcEndpointAwsService.CLOUDFORMATION,
      ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      ec2.InterfaceVpcEndpointAwsService.KMS,
      ...(props.codeBuildVPCInterfaces || []),
    ];

    /**
     * If the provided vpcId starts with 'resolve:ssm:', it is treated as a parameter name
     * and the actual value is fetched from the AWS Systems Manager Parameter Store.
     * Otherwise, the provided vpcId is used as is.
     */
    this.vpcId = props.vpcId.startsWith('resolve:ssm:')
      ? StringParameter.valueFromLookup(this, props.vpcId.replace('resolve:ssm:', ''))
      : props.vpcId;

    /**
     * Creates or looks up a VPC based on the provided vpcId.
     */
    this.vpc = ec2.Vpc.fromLookup(this, 'vpc', {
      vpcId: this.vpcId,
    });
  }
}
