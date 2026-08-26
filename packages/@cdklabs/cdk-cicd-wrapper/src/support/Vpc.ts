// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Resolves the pipeline's own VPC networking (Blueprint `VPCProvider`/`ManagedVPCStack`/`VPCFromLookUpStack`,
// migrated). Blueprint provisioned this as its own per-stage CloudFormation stack, driven by a resource
// provider; Autopilot attaches it directly to the pipeline's construct tree instead -- there is no separate
// stack, because the CodeBuild projects that consume it already live in the same stack this resolves
// against. `SupportResources.vpcNetworking` is the lazy entry point engines read; `resolveVpcNetworking`
// is exported separately for `CdkPipelinesEngine`, which does not use `SupportResources`.

import { aws_ec2 as ec2, aws_s3 as s3 } from 'aws-cdk-lib';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { ManagedVpcConfig, VpcConfig } from '../config/types';

/** The default CodeBuild VPC interface endpoints (Blueprint `ManagedVPCStack.codeBuildVPCInterfaces` default). */
const DEFAULT_CODEBUILD_VPC_INTERFACES: ec2.InterfaceVpcEndpointAwsService[] = [
  ec2.InterfaceVpcEndpointAwsService.SSM,
  ec2.InterfaceVpcEndpointAwsService.STS,
  ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
  ec2.InterfaceVpcEndpointAwsService.CLOUDFORMATION,
  ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
  ec2.InterfaceVpcEndpointAwsService.KMS,
];

/** VPC + security groups + subnet selection an engine attaches to every CodeBuild project it creates. */
export interface VpcNetworking {
  /** The VPC to run CodeBuild's network interfaces in. */
  readonly vpc: ec2.IVpc;
  /** Security group(s) to associate with those network interfaces. Undefined for a looked-up VPC. */
  readonly securityGroups?: ec2.ISecurityGroup[];
  /** Which subnets to use. Undefined for a looked-up VPC (CodeBuild then selects private subnets). */
  readonly subnetSelection?: ec2.SubnetSelection;
}

/**
 * Resolve a `VpcConfig` into the networking an engine attaches to its CodeBuild projects. Returns
 * `undefined` for the (default) no-VPC case -- Blueprint's `NoVPCStack`.
 *
 * @param useProxy Same flag Blueprint's `VPCProvider` read off `GlobalResources.PROXY`: a managed VPC gets
 * isolated subnets (no NAT egress; the CodeBuild VPC endpoints cover AWS API calls instead) when a
 * proxy is configured, otherwise subnets with NAT egress.
 */
export function resolveVpcNetworking(
  scope: Construct,
  config: VpcConfig | undefined,
  useProxy: boolean,
): VpcNetworking | undefined {
  if (config?.managedVpc !== undefined) {
    return buildManagedVpc(scope, config.managedVpc, useProxy);
  }
  if (config?.vpcId !== undefined) {
    return lookupVpc(scope, config.vpcId);
  }
  return undefined;
}

/** Blueprint's `ManagedVPCStack`, ported as a plain construct under the caller's own stack. */
function buildManagedVpc(scope: Construct, managed: ManagedVpcConfig, useProxy: boolean): VpcNetworking {
  const cidrBlock = managed.cidrBlock ?? '172.31.0.0/20';
  const subnetCidrMask = managed.subnetCidrMask ?? 24;
  const maxAzs = managed.maxAzs ?? 2;
  // Blueprint read these with `props.x || true`, which evaluates to `true` even when the caller explicitly
  // passed `false` -- a defect ported forward here as `??` so a caller CAN turn either flag off.
  const restrictDefaultSecurityGroup = managed.restrictDefaultSecurityGroup ?? true;
  const allowAllOutbound = managed.allowAllOutbound ?? true;
  const subnetType =
    managed.subnetType ?? (useProxy ? ec2.SubnetType.PRIVATE_ISOLATED : ec2.SubnetType.PRIVATE_WITH_EGRESS);
  const isolated = subnetType === ec2.SubnetType.PRIVATE_ISOLATED;

  const vpc = new ec2.Vpc(scope, 'Vpc', {
    ipAddresses: ec2.IpAddresses.cidr(cidrBlock),
    restrictDefaultSecurityGroup,
    maxAzs,
    subnetConfiguration: isolated
      ? [{ cidrMask: subnetCidrMask, name: 'private-isolated', subnetType }]
      : [
          { cidrMask: subnetCidrMask, name: 'private-egress', subnetType },
          { cidrMask: subnetCidrMask, name: 'public', subnetType: ec2.SubnetType.PUBLIC },
        ],
  });

  const securityGroup = new ec2.SecurityGroup(scope, 'VpcSecurityGroup', {
    vpc,
    description: isolated
      ? 'Allow traffic between CodeBuildStep and AWS Service VPC Endpoints'
      : 'Security group for the VPC with egress + public subnets',
    allowAllOutbound,
  });

  if (isolated) {
    securityGroup.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(443), 'HTTPS traffic');
    const codeBuildVpcInterfaces = [...DEFAULT_CODEBUILD_VPC_INTERFACES, ...(managed.codeBuildVpcInterfaces ?? [])];
    codeBuildVpcInterfaces.forEach((service) => {
      vpc.addInterfaceEndpoint(`VpcEndpoint${service.shortName}`, {
        service,
        open: false,
        securityGroups: [securityGroup],
      });
    });
    vpc.addGatewayEndpoint('VpcGatewayS3', { service: ec2.GatewayVpcEndpointAwsService.S3 });
  }

  if (managed.flowLogsBucketName !== undefined) {
    vpc.addFlowLog('VpcFlowLogs', {
      destination: ec2.FlowLogDestination.toS3(
        s3.Bucket.fromBucketName(scope, 'VpcFlowLogsBucket', managed.flowLogsBucketName),
      ),
      trafficType: ec2.FlowLogTrafficType.ALL,
    });
  } else {
    // Blueprint shipped flow logs opt-in via flowLogsBucketName (unset by default) -- this is the pipeline's
    // own internal networking, not a customer workload, and forcing on a flow-log bucket + storage
    // cost by default would be a behaviour change from Blueprint, not just a nag-compliance fix.
    NagSuppressions.addResourceSuppressions(vpc, [
      {
        id: 'AwsSolutions-VPC7',
        reason: 'Flow logs are opt-in via vpc.managedVpc.flowLogsBucketName (Blueprint parity); set it to enable them.',
      },
    ]);
  }

  return { vpc, securityGroups: [securityGroup], subnetSelection: { subnetType } };
}

/** Blueprint's `VPCFromLookUpStack`: look up an existing VPC by id, optionally resolved from SSM first. */
function lookupVpc(scope: Construct, vpcId: string): VpcNetworking {
  const resolvedId = vpcId.startsWith('resolve:ssm:')
    ? StringParameter.valueFromLookup(scope, vpcId.replace('resolve:ssm:', ''))
    : vpcId;
  const vpc = ec2.Vpc.fromLookup(scope, 'Vpc', { vpcId: resolvedId });
  return { vpc };
}
