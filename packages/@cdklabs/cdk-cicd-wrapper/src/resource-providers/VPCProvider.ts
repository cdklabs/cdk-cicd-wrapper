// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { GlobalResources, ResourceContext, IResourceProvider, Scope, Stage } from '../common';
import { ManagedVPCStack } from '../stacks/vpc/ManagedVPCStack';
import { NoVPCStack } from '../stacks/vpc/NoVPCStack';
import { VPCFromLookUpStack } from '../stacks/vpc/VPCFromLookUpStack';

/**
 * VPC Configuration for new VPC
 */
export interface IManagedVpcConfig {
  /**
   * CIDR block for the VPC. default is: 172.31.0.0/20
   */
  cidrBlock: string;

  /**
   * Subnets CIDR masks. default is: 24
   */
  subnetCidrMask: number;

  /**
   * Max AZs. default is: 2
   */
  maxAzs: number;
}

/**
 * VPC Configuration for VPC id lookup
 */
export interface IVpcConfigFromLookUp {
  /**
   * VPC id to lookup
   */
  vpcId: string;
}

/**
 * Interface representing VPC configuration
 */
export interface IVpcConfig {
  managedVPC?: IManagedVpcConfig;
  vpcFromLookUp?: string;
}

/**
 * Backward compatibility settings for VPC
 */
const defaultVPC = {
  managedVPC:
    (process.env.CICD_VPC_TYPE || process.env.npm_package_config_cicdVpcType) === 'VPC'
      ? {
          // preserving original functionality where vpc is created from defaults.
          cidrBlock: process.env.CICD_VPC_CIDR || process.env.npm_package_config_cicdVpcCidr || '172.31.0.0/20',
          subnetCidrMask: parseInt(
            process.env.CICD_VPC_CIDR_MASK || process.env.npm_package_config_cicdVpcCidrMask || '24',
          ),
          maxAzs: parseInt(process.env.CICD_VPC_MAXAZS || process.env.npm_package_config_cicdVpcMaxAZs || '2'),
        }
      : undefined,
  vpcFromLookUp: process.env.CICD_VPC_ID || process.env.npm_package_config_cicdVpcId,
};

/**
 * VPC construct that provides the VPC and HTTP proxy settings
 */
export interface IVpcConstruct {
  readonly vpc?: ec2.IVpc;

  readonly securityGroup?: ec2.ISecurityGroup;

  readonly subnetType?: ec2.SubnetType;
}

/**
 * Legacy VPC Provider that defines the VPC used by the CI/CD process
 */
export class VPCProvider implements IResourceProvider {
  scope? = Scope.PER_STAGE;

  constructor(readonly legacyConfig: IVpcConfig = defaultVPC) {}

  /**
   * Provides the VPC resource
   * @param context The resource context
   * @returns The VPC stack
   */
  provide(context: ResourceContext): any {
    const { scope, blueprintProps, environment } = context;

    const complianceLogBucketName = blueprintProps.deploymentDefinition[context.stage].complianceLogBucketName;

    const stageSpecificVpcConfig = blueprintProps.deploymentDefinition[context.stage].vpc;

    // Backward compatibility for VPC settings, only configure the VPC for the RES stage
    const vpcConfig = stageSpecificVpcConfig || (context.stage == Stage.RES ? this.legacyConfig : {});

    if (vpcConfig.managedVPC) {
      return new ManagedVPCStack(scope, `${blueprintProps.applicationName}VPCStack`, {
        env: environment,
        cidrBlock: vpcConfig.managedVPC.cidrBlock,
        subnetCidrMask: vpcConfig.managedVPC.subnetCidrMask,
        maxAzs: vpcConfig.managedVPC.maxAzs,
        flowLogsBucketName: complianceLogBucketName,
        useProxy: context.has(GlobalResources.PROXY),
      });
    } else if (vpcConfig.vpcFromLookUp) {
      return new VPCFromLookUpStack(scope, `${blueprintProps.applicationName}VPCStack`, {
        env: environment,
        vpcId: vpcConfig.vpcFromLookUp,
      });
    } else {
      return new NoVPCStack();
    }
  }
}
