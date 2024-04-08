// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { aws_s3 } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { IVpcConfig } from '../resource-providers';

export interface VPCStackProps extends cdk.StackProps {
  readonly vpcConfig: IVpcConfig;
  readonly useProxy: boolean;
  readonly flowLogsBucketName: string;
}
export class VPCStack extends cdk.Stack {
  readonly vpc: ec2.IVpc | undefined;

  constructor(scope: Construct, id: string, props: VPCStackProps) {
    super(scope, id, props);

    switch (props.vpcConfig.type) {
      case 'NO_VPC':
        break;

      case 'VPC_FROM_LOOK_UP':
        const vpcConfig = props.vpcConfig.vpcFromLookUp!;
        const vpcId = vpcConfig.vpcId.startsWith('resolve:ssm:')
          ? StringParameter.valueFromLookup(this, vpcConfig.vpcId.replace('resolve:ssm:', ''))
          : vpcConfig.vpcId;
        this.vpc = ec2.Vpc.fromLookup(this, 'vpc', {
          vpcId,
        });
        break;

      case 'VPC':
        this.vpc = props.useProxy ? this.launchVPCIsolated(props) : this.launchVPCWithEgress(props);
        const vpcFlowLogsDestinationS3 = aws_s3.Bucket.fromBucketName(
          this,
          'VpcFlowLogsBucket',
          props.flowLogsBucketName,
        );
        this.vpc.addFlowLog('vpcFlowLogs', {
          destination: ec2.FlowLogDestination.toS3(vpcFlowLogsDestinationS3),
          trafficType: ec2.FlowLogTrafficType.ALL,
        });
        break;
    }
  }

  private launchVPCIsolated(props: VPCStackProps) {
    const vpc = new ec2.Vpc(this, 'vpc', {
      ipAddresses: ec2.IpAddresses.cidr(props.vpcConfig.vpc?.cidrBlock!),
      restrictDefaultSecurityGroup: true,
      subnetConfiguration: [
        {
          cidrMask: props.vpcConfig.vpc?.subnetCidrMask,
          name: 'private-isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
      maxAzs: props.vpcConfig.vpc?.maxAzs,
    });

    const securityGroup = new ec2.SecurityGroup(this, 'VpcSecurityGroup', {
      vpc: vpc,
      description: 'Allow traffic between CodeBuildStep and AWS Service VPC Endpoints',
      securityGroupName: 'Security Group for AWS Service VPC Endpoints',
      allowAllOutbound: true,
    });
    securityGroup.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(443), 'HTTPS Traffic');

    [
      //VpcEndpoints
      ec2.InterfaceVpcEndpointAwsService.SSM,
      ec2.InterfaceVpcEndpointAwsService.STS,
      ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      ec2.InterfaceVpcEndpointAwsService.CLOUDFORMATION,
      ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      ec2.InterfaceVpcEndpointAwsService.KMS,
    ].forEach((service: ec2.InterfaceVpcEndpointAwsService) => {
      vpc.addInterfaceEndpoint(`VpcEndpoint${service.shortName}`, {
        service,
        open: false,
        securityGroups: [securityGroup],
      });
    });

    // VPCGatewayEndpoints
    vpc.addGatewayEndpoint('VpcGatewayS3', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    return vpc;
  }

  private launchVPCWithEgress(props: VPCStackProps) {
    const vpc = new ec2.Vpc(this, 'vpc', {
      ipAddresses: ec2.IpAddresses.cidr(props.vpcConfig.vpc?.cidrBlock!),
      restrictDefaultSecurityGroup: true,
      subnetConfiguration: [
        {
          cidrMask: props.vpcConfig.vpc?.subnetCidrMask,
          name: 'private-egress',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
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
