// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { aws_s3 } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { IVpcConfig } from '../resource-providers';
import { ParameterResolver } from '../utils';

/**
 * Properties for the VPCStack.
 */
export interface VPCStackProps extends cdk.StackProps {
  /**
   * The configuration for the VPC to be created or looked up.
   */
  readonly vpcConfig: IVpcConfig;

  /**
   * Whether to use a proxy for the VPC.
   * Default value is false.
   */
  readonly useProxy: boolean;

  /**
   * The name of the S3 bucket for VPC flow logs.
   */
  readonly flowLogsBucketName?: string;

  /**
   * If set to true then the default inbound & outbound rules will be removed
   * from the default security group
   */
  readonly restrictDefaultSecurityGroup?: boolean;

  /**
   * Whether to allow all outbound traffic by default.
   *
   * If this is set to true, there will only be a single egress rule which allows all
   * outbound traffic. If this is set to false, no outbound traffic will be allowed by
   * default and all egress traffic must be explicitly authorized.
   */
  readonly allowAllOutbound?: boolean;

  /**
   * The list of CodeBuild VPC InterfacesVpcEndpointAwsServices to extend the defaultCodeBuildVPCInterfaces
   */
  readonly codeBuildVPCInterfaces?: ec2.InterfaceVpcEndpointAwsService[];

  /**
   * The subnets attached to the VPC
   *
   * @default - Private Subnet only
   */
  readonly subnetType?: ec2.SubnetType;
}

/**
 * A stack that creates or looks up a VPC and configures its settings.
 */
export class VPCStack extends cdk.Stack {
  /**
   * The VPC created or looked up by this stack.
   */
  readonly vpc?: ec2.IVpc;

  /**
   * The security group attached to the VPC
   */
  private _securityGroup?: ec2.ISecurityGroup;

  /**
   * The subnets attached to the VPC
   */
  readonly subnetType?: ec2.SubnetType;

  /**
   * The list of CodeBuild VPC InterfacesVpcEndpointAwsServices
   */
  readonly codeBuildVPCInterfaces: ec2.InterfaceVpcEndpointAwsService[];

  get securityGroup(): ec2.ISecurityGroup | undefined {
    return this._securityGroup;
  }

  constructor(scope: Construct, id: string, props: VPCStackProps) {
    super(scope, id, props);

    this.codeBuildVPCInterfaces = [
      ec2.InterfaceVpcEndpointAwsService.SSM,
      ec2.InterfaceVpcEndpointAwsService.STS,
      ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      ec2.InterfaceVpcEndpointAwsService.CLOUDFORMATION,
      ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      ec2.InterfaceVpcEndpointAwsService.KMS,
      ...(props.codeBuildVPCInterfaces || []),
    ];

    switch (props.vpcConfig.vpcType) {
      case 'NO_VPC':
        break;

      case 'VPC_FROM_LOOK_UP':
        const vpcConfig = props.vpcConfig.vpcFromLookUp!;
        const vpcId = ParameterResolver.resolveValue(this, vpcConfig.vpcId);
        this.vpc = ec2.Vpc.fromLookup(this, 'vpc', {
          vpcId,
        });
        break;

      case 'VPC':
        if (props.useProxy) {
          this.subnetType = props.subnetType || ec2.SubnetType.PRIVATE_ISOLATED;
          this.vpc = this.launchVPCIsolated(props);
        } else {
          this.subnetType = props.subnetType || ec2.SubnetType.PRIVATE_WITH_EGRESS;
          this.vpc = this.launchVPCWithEgress(props);
        }

        const vpcFlowLogsDestinationS3 = aws_s3.Bucket.fromBucketName(
          this,
          'VpcFlowLogsBucket',
          props.flowLogsBucketName!,
        );
        this.vpc.addFlowLog('vpcFlowLogs', {
          destination: ec2.FlowLogDestination.toS3(vpcFlowLogsDestinationS3),
          trafficType: ec2.FlowLogTrafficType.ALL,
        });
        break;
    }
  }

  /**
   * Launches a VPC with an isolated subnet and configures security groups and VPC endpoints.
   * @param props The properties for configuring the VPC.
   * @returns The created VPC.
   */
  private launchVPCIsolated(props: VPCStackProps) {
    const vpc = new ec2.Vpc(this, 'vpc', {
      ipAddresses: ec2.IpAddresses.cidr(props.vpcConfig.vpc?.cidrBlock!),
      restrictDefaultSecurityGroup: props.restrictDefaultSecurityGroup || true,
      subnetConfiguration: [
        {
          cidrMask: props.vpcConfig.vpc?.subnetCidrMask,
          name: 'private-isolated',
          subnetType: this.subnetType!,
        },
      ],
      maxAzs: props.vpcConfig.vpc?.maxAzs,
    });

    this._securityGroup = new ec2.SecurityGroup(this, 'VpcSecurityGroup', {
      vpc: vpc,
      description: 'Allow traffic between CodeBuildStep and AWS Service VPC Endpoints',
      securityGroupName: 'Security Group for AWS Service VPC Endpoints',
      allowAllOutbound: props.allowAllOutbound || true,
    });

    this._securityGroup.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(443), 'HTTPS Traffic');

    this.codeBuildVPCInterfaces.forEach((service: ec2.InterfaceVpcEndpointAwsService) => {
      vpc.addInterfaceEndpoint(`VpcEndpoint${service.shortName}`, {
        service,
        open: false,
        securityGroups: [this._securityGroup!],
      });
    });

    vpc.addGatewayEndpoint('VpcGatewayS3', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    return vpc;
  }

  /**
   * Launches a VPC with a private subnet with egress.
   * @param props The properties for configuring the VPC.
   * @returns The created VPC.
   */
  private launchVPCWithEgress(props: VPCStackProps) {
    const vpc = new ec2.Vpc(this, 'vpc', {
      ipAddresses: ec2.IpAddresses.cidr(props.vpcConfig.vpc?.cidrBlock!),
      restrictDefaultSecurityGroup: true,
      subnetConfiguration: [
        {
          cidrMask: props.vpcConfig.vpc?.subnetCidrMask,
          name: 'private-egress',
          subnetType: this.subnetType!,
        },
        {
          cidrMask: props.vpcConfig.vpc?.subnetCidrMask,
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
      maxAzs: props.vpcConfig.vpc?.maxAzs,
    });

    return vpc;
  }
}
