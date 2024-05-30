// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { IConstruct } from 'constructs';
import { GlobalResources, ResourceContext, IResourceProvider } from '../common';
import { VPCStack } from '../stacks';

/**
 * Legacy VPC Type Definitions
 */
export type VpcType = 'NO_VPC' | 'VPC' | 'VPC_FROM_LOOK_UP';

/**
 * VPC Configuration for new VPC
 */
export interface IVpcConfigNewVpc {
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
  vpcType: VpcType;
  vpc?: IVpcConfigNewVpc;
  vpcFromLookUp?: IVpcConfigFromLookUp;
}

/**
 * Backward compatibility settings for VPC
 */
const defaultVPC = {
  vpcType: (process.env.CICD_VPC_TYPE || process.env.npm_package_config_cicdVpcType) as VpcType,
  vpc: {
    // preserving original functionality where vpc is created from defaults.
    cidrBlock: process.env.CICD_VPC_CIDR || process.env.npm_package_config_cicdVpcCidr || '172.31.0.0/20',
    subnetCidrMask: parseInt(process.env.CICD_VPC_CIDR_MASK || process.env.npm_package_config_cicdVpcCidrMask || '24'),
    maxAzs: parseInt(process.env.CICD_VPC_MAXAZS || process.env.npm_package_config_cicdVpcMaxAZs || '2'),
  },
  vpcFromLookUp: {
    vpcId: process.env.CICD_VPC_ID || process.env.npm_package_config_cicdVpcId || '',
  },
};

/**
 * VPC construct that provides the VPC and HTTP proxy settings
 */
export interface IVpcConstruct extends IConstruct {
  readonly vpc?: ec2.IVpc;
}

/**
 * Legacy VPC Provider that defines the VPC used by the CI/CD process
 */
export class VPCProvider implements IResourceProvider {
  constructor(readonly vpc: IVpcConfig = defaultVPC) {}

  /**
   * Provides the VPC resource
   * @param context The resource context
   * @returns The VPC stack
   */
  provide(context: ResourceContext): any {
    const { scope, blueprintProps, environment } = context;

    return new VPCStack(scope, `${blueprintProps.applicationName}VPCStack`, {
      env: environment,
      vpcConfig: this.vpc,
      flowLogsBucketName: context.get(GlobalResources.COMPLIANCE_BUCKET)?.bucketName,
      useProxy: context.has(GlobalResources.PROXY),
    });
  }
}
