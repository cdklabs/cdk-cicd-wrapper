// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { CodeBuildOptions } from 'aws-cdk-lib/pipelines';
import { IParameterConstruct } from '.';
import { IProxyConfig } from './ProxyProvider';
import { ResourceContext, IResourceProvider, GlobalResources, NPMRegistryConfig, PipelinePhases } from '../common';

/**
 * Interface for a factory that provides CodeBuild options for the pipeline.
 */
export interface ICodeBuildFactory {
  /**
   * Provides the CodeBuild options for the pipeline
   * @returns The CodeBuildOptions object containing options for the CodeBuild project
   */
  provideCodeBuildOptions(): CodeBuildOptions;
}

/**
 * Provides HTTPProxy settings for the pipeline.
 */
export class CodeBuildFactoryProvider implements IResourceProvider {
  constructor() {}

  /**
   * Provides the DefaultCodeBuildFactory instance
   * @param context The ResourceContext object containing blueprint properties and other resources
   * @returns The DefaultCodeBuildFactory instance
   */
  provide(context: ResourceContext): any {
    let proxyConfig: IProxyConfig | undefined;
    if (context.has(GlobalResources.PROXY)) {
      proxyConfig = context.get(GlobalResources.PROXY)!;
    }

    const vpc = context.get(GlobalResources.VPC).vpc;
    const parameterProvider = context.get(GlobalResources.PARAMETER_STORE);
    const phaseCommandsProvider = context.get(GlobalResources.PHASE);

    return new DefaultCodeBuildFactory({
      applicationQualifier: context.blueprintProps.applicationQualifier,
      region: context.blueprintProps.deploymentDefinition.RES.env.region,
      resAccount: context.blueprintProps.deploymentDefinition.RES.env.account,
      vpc,
      proxyConfig,
      npmRegistry: context.blueprintProps.npmRegistry,
      codeBuildEnvSettings: context.blueprintProps.codeBuildEnvSettings,
      parameterProvider,
      installCommands: phaseCommandsProvider.getCommands(PipelinePhases.INITIALIZE),
    });
  }
}

export interface DefaultCodeBuildFactoryProps {
  /**
   * The applicationQualifier used for the pipeline.
   */
  readonly applicationQualifier: string;
  /**
   * The AWS region to set.
   */
  readonly region: string;
  /**
   * The account ID of the RES stage
   */
  readonly resAccount: string;
  /**
   * The VPC to use for the CodeBuild project
   * Default value is undefined (no VPC)
   */
  readonly vpc?: ec2.IVpc;
  /**
   * Configuration for an HTTP proxy
   * Default value is undefined
   */
  readonly proxyConfig?: IProxyConfig;
  /**
   * Configuration for an NPM registry
   * Default value is undefined
   */
  readonly npmRegistry?: NPMRegistryConfig;
  /**
   * Environment settings for the CodeBuild project
   * Default value is undefined
   */
  readonly codeBuildEnvSettings?: codebuild.BuildEnvironment;
  /**
   * Provider for Parameter Store parameters
   */
  readonly parameterProvider: IParameterConstruct;
  /**
   * The install commands to run before the build phase
   */
  readonly installCommands?: string[];
  /**
   * Additional IAM policy statements to be added to the CodeBuild project role
   * Default value is undefined
   */
  readonly additionalRolePolicies?: iam.PolicyStatement[];
}

/**
 * Default implementation of the ICodeBuildFactory interface
 * Provides CodeBuild options for the pipeline, including proxy and NPM registry configurations
 */
export class DefaultCodeBuildFactory implements ICodeBuildFactory {
  private codeBuildOptions: CodeBuildOptions;

  private partialCodeBuildSpec = {
    version: '0.2', // The version of the CodeBuild buildspec
    env: {
      shell: 'bash', // The shell to use for build commands
    },
  };

  constructor(props: DefaultCodeBuildFactoryProps) {
    this.codeBuildOptions = {
      ...this.generateVPCCodeBuildDefaults(props.vpc), // Default options for a CodeBuild project in a VPC
      partialBuildSpec: this.generatePartialBuildSpec(props), // The partially constructed buildspec
      buildEnvironment: props.codeBuildEnvSettings, // Environment settings for the CodeBuild project
      rolePolicy: this.generateRolePolicies(props),
    };
  }

  /**
   * Generates a partial CodeBuild buildspec based on the provided properties
   * @param props The properties used to generate the buildspec
   * @returns The partially constructed buildspec
   */
  protected generatePartialBuildSpec(props: DefaultCodeBuildFactoryProps) {
    // Merge the constructed objects with existing buildSpec
    const buildSpec = codebuild.BuildSpec.fromObject(this.partialCodeBuildSpec);

    return codebuild.mergeBuildSpecs(
      buildSpec,
      codebuild.BuildSpec.fromObject({
        env: {
          variables: this.generateBuildEnvironmentVariables(props), // Environment variables for the proxy configuration
          'secrets-manager': this.generateCodeBuildSecretsManager(props), // Secrets Manager values for the proxy configuration
        },
        phases: {
          install: {
            commands: this.generateInstallCommands(props),
          },
        },
      }),
    );
  }

  /**
   * Generates build environment variables for the CodeBuild project based on the provided proxy configuration
   * @param props The properties containing the proxy configuration
   * @returns An object containing the build environment variables
   */
  protected generateBuildEnvironmentVariables(props: DefaultCodeBuildFactoryProps): Record<string, string> {
    const { proxyConfig, npmRegistry } = props;
    const envVariables: Record<string, string> = {};

    envVariables.CDK_QUALIFIER = props.applicationQualifier;
    envVariables.AWS_REGION = props.region;

    if (proxyConfig) {
      envVariables.AWS_STS_REGIONAL_ENDPOINTS = 'regional';
      envVariables.NO_PROXY = proxyConfig.noProxy.join(','); // Comma-separated list of hosts that should bypass the proxy
      envVariables.PROXY_SECRET_ARN = proxyConfig.proxySecretArn;
    }

    if (npmRegistry) {
      envVariables.NPM_REGISTRY = npmRegistry.url;
      envVariables.NPM_BASIC_AUTH_SECRET_ID = npmRegistry.basicAuthSecretArn;
      envVariables.NPM_SCOPE = npmRegistry.scope ?? '';
    }

    return envVariables;
  }

  /**
   * Generates install commands for the CodeBuild project based on the provided proxy configuration
   * @param props The properties containing the proxy configuration
   * @returns An array of install commands
   */
  protected generateInstallCommands(props: DefaultCodeBuildFactoryProps): string[] {
    const commands: string[] = [];

    if (props.proxyConfig) {
      commands.push('export HTTP_PROXY="http://$PROXY_USERNAME:$PROXY_PASSWORD@$PROXY_DOMAIN:$HTTP_PROXY_PORT"'); // Set the HTTP proxy
      commands.push('export HTTPS_PROXY="https://$PROXY_USERNAME:$PROXY_PASSWORD@$PROXY_DOMAIN:$HTTPS_PROXY_PORT"'); // Set the HTTPS proxy
      commands.push('echo "--- Proxy Test ---"'); // Print a message for the proxy test
      commands.push(`curl -Is --connect-timeout 5 ${props.proxyConfig.proxyTestUrl} | grep "HTTP/"`); // Test the proxy by making a request and checking for an HTTP response
    }

    props.installCommands?.forEach((command) => commands.push(command));

    return commands;
  }

  /**
   * Generates Secrets Manager values for the CodeBuild project based on the provided proxy configuration
   * @param props The properties containing the proxy configuration
   * @returns An object containing Secrets Manager values
   */
  protected generateCodeBuildSecretsManager(props: DefaultCodeBuildFactoryProps): Record<string, string> {
    const proxySecretArn = props.proxyConfig?.proxySecretArn;

    if (!proxySecretArn) {
      return {};
    }

    return {
      PROXY_USERNAME: `${proxySecretArn}:username`,
      PROXY_PASSWORD: `${proxySecretArn}:password`,
      HTTP_PROXY_PORT: `${proxySecretArn}:http_proxy_port`,
      HTTPS_PROXY_PORT: `${proxySecretArn}:https_proxy_port`,
      PROXY_DOMAIN: `${proxySecretArn}:proxy_domain`,
    };
  }

  /**
   * Generates IAM role policies for the CodeBuild project based on the provided properties
   * @param props The properties containing configuration for the CodeBuild project
   * @returns An array of IAM policy statements
   */
  protected generateRolePolicies(props: DefaultCodeBuildFactoryProps) {
    const rolePolicies = [];

    rolePolicies.push(props.parameterProvider.provideParameterPolicyStatement()); // Policy statement for accessing Parameter Store parameters)

    if (props.proxyConfig?.proxySecretArn) {
      rolePolicies.push(
        new iam.PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'], // Allow retrieving secrets from Secrets Manager
          resources: [props.proxyConfig.proxySecretArn], // The ARN of the secret containing proxy configuration
        }),
      );

      const arnSplit = cdk.Arn.split(props.proxyConfig.proxySecretArn, cdk.ArnFormat.SLASH_RESOURCE_NAME);

      if (arnSplit.account != props.resAccount) {
        rolePolicies.push(
          new iam.PolicyStatement({
            actions: ['kms:Decrypt', 'kms:DescribeKey', 'kms:Encrypt', 'kms:GenerateDataKey*', 'kms:ReEncrypt*'], // Allow retrieving secrets from Secrets Manager
            resources: [`arn:aws:kms:${arnSplit.region}:${arnSplit.account}:key/*`], // The ARN of the secret containing NPM registry authentication
          }),
        );
      }
    }

    if (props.npmRegistry) {
      rolePolicies.push(
        new iam.PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'], // Allow retrieving secrets from Secrets Manager
          resources: [props.npmRegistry.basicAuthSecretArn], // The ARN of the secret containing NPM registry authentication
        }),
      );
    }

    return rolePolicies;
  }

  /**
   * Generates default options for a CodeBuild project in a VPC
   * @param vpc The VPC to use for the CodeBuild project, default is undefined (no VPC)
   * @returns An object containing default options for a CodeBuild project in a VPC
   */
  generateVPCCodeBuildDefaults(vpc?: ec2.IVpc): object {
    if (!vpc) return {}; // If no VPC is provided, return an empty object

    return {
      vpc: vpc, // The VPC to use for the CodeBuild project
      subnetSelection: vpc.isolatedSubnets ?? vpc.privateSubnets, // Use isolated subnets if available, otherwise use private subnets
    };
  }

  /**
   * Provides the CodeBuild options for the pipeline
   * @returns The CodeBuildOptions object containing options for the CodeBuild project
   */
  provideCodeBuildOptions(): CodeBuildOptions {
    return this.codeBuildOptions;
  }
}

/**
 * Merges two sets of CodeBuildOptions into one, prioritizing fields from the secondary options
 * over the primary options where applicable.
 *
 * @param {CodeBuildOptions} primaryOptions - The primary set of CodeBuild options.
 * @param {CodeBuildOptions} secondaryOptions - The secondary set of CodeBuild options.
 * @returns {CodeBuildOptions} - The merged set of CodeBuild options.
 */
export function mergeCodeBuildOptions(
  primaryOptions: CodeBuildOptions,
  secondaryOptions: CodeBuildOptions,
): CodeBuildOptions {
  return {
    buildEnvironment: mergeBuildEnvironments(primaryOptions.buildEnvironment, secondaryOptions.buildEnvironment),
    rolePolicy: definedArray([
      ...(primaryOptions.rolePolicy ? primaryOptions.rolePolicy : []),
      ...(secondaryOptions.rolePolicy ? secondaryOptions.rolePolicy : []),
    ]),
    securityGroups: definedArray([
      ...(primaryOptions.securityGroups ? primaryOptions.securityGroups : []),
      ...(secondaryOptions.securityGroups ? secondaryOptions.securityGroups : []),
    ]),
    partialBuildSpec: mergeBuildSpecs(primaryOptions.partialBuildSpec, secondaryOptions.partialBuildSpec),
    vpc: secondaryOptions.vpc ? secondaryOptions.vpc : primaryOptions.vpc,
    subnetSelection: secondaryOptions.subnetSelection
      ? secondaryOptions.subnetSelection
      : primaryOptions.subnetSelection,
    timeout: secondaryOptions.timeout ? secondaryOptions.timeout : primaryOptions.timeout,
    cache: secondaryOptions.cache ? secondaryOptions.cache : primaryOptions.cache,
    fileSystemLocations: definedArray([
      ...(primaryOptions.fileSystemLocations ? primaryOptions.fileSystemLocations : []),
      ...(secondaryOptions.fileSystemLocations ? secondaryOptions.fileSystemLocations : []),
    ]),
    logging: secondaryOptions.logging ? secondaryOptions.logging : primaryOptions.logging,
  };
}

/**
 * Merges two CodeBuild environments, prioritizing fields from the secondary environment
 * over the primary environment where applicable.
 *
 * @param {codebuild.BuildEnvironment} primaryEnvironment - The primary CodeBuild environment.
 * @param {codebuild.BuildEnvironment} [secondaryEnvironment] - The secondary CodeBuild environment.
 * @returns {codebuild.BuildEnvironment | undefined} - The merged CodeBuild environment, or undefined if both are undefined.
 */
function mergeBuildEnvironments(
  primaryEnvironment: codebuild.BuildEnvironment,
  secondaryEnvironment?: codebuild.BuildEnvironment,
): codebuild.BuildEnvironment;
function mergeBuildEnvironments(
  primaryEnvironment: codebuild.BuildEnvironment | undefined,
  secondaryEnvironment: codebuild.BuildEnvironment,
): codebuild.BuildEnvironment;
function mergeBuildEnvironments(
  primaryEnvironment?: codebuild.BuildEnvironment,
  secondaryEnvironment?: codebuild.BuildEnvironment,
): codebuild.BuildEnvironment | undefined;
function mergeBuildEnvironments(
  primaryEnvironment?: codebuild.BuildEnvironment,
  secondaryEnvironment?: codebuild.BuildEnvironment,
): codebuild.BuildEnvironment | undefined {
  if (!primaryEnvironment || !secondaryEnvironment) {
    return primaryEnvironment ?? secondaryEnvironment;
  }

  return {
    buildImage: secondaryEnvironment.buildImage ?? primaryEnvironment.buildImage,
    computeType: secondaryEnvironment.computeType ?? primaryEnvironment.computeType,
    environmentVariables: {
      ...primaryEnvironment.environmentVariables,
      ...secondaryEnvironment.environmentVariables,
    },
    privileged: secondaryEnvironment.privileged ?? primaryEnvironment.privileged,
  };
}

/**
 * Returns the array if it contains elements, otherwise returns undefined.
 *
 * @param {ArrayElement[]} array - The array to check.
 * @returns {ArrayElement[] | undefined} - The original array if it contains elements, or undefined if it is empty.
 */
function definedArray<ArrayElement>(array: ArrayElement[]): ArrayElement[] | undefined {
  return array.length > 0 ? array : undefined;
}

/**
 * Merges two BuildSpecs, prioritizing fields from the secondary BuildSpec over the primary BuildSpec where applicable.
 *
 * @param {codebuild.BuildSpec} [primaryBuildSpec] - The primary CodeBuild BuildSpec.
 * @param {codebuild.BuildSpec} [secondaryBuildSpec] - The secondary CodeBuild BuildSpec.
 * @returns {codebuild.BuildSpec | undefined} - The merged BuildSpec, or undefined if both are undefined.
 */
function mergeBuildSpecs(
  primaryBuildSpec?: codebuild.BuildSpec,
  secondaryBuildSpec?: codebuild.BuildSpec,
): codebuild.BuildSpec | undefined {
  if (!primaryBuildSpec || !secondaryBuildSpec) {
    return primaryBuildSpec ?? secondaryBuildSpec;
  }
  return codebuild.mergeBuildSpecs(primaryBuildSpec, secondaryBuildSpec);
}
