// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { CodeBuildOptions } from 'aws-cdk-lib/pipelines';
import { IParameterConstruct } from '.';
import { IProxyConfig } from './ProxyProvider';
import { ResourceContext, IResourceProvider, GlobalResources, NPMRegistryConfig } from '../common';

/**
 * Interface for a factory that provides CodeBuild options for the pipeline.
 */
export interface ICodeBuildFactory {
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

    return new DefaultCodeBuildFactory({
      vpc,
      proxyConfig,
      npmRegistry: context.blueprintProps.npmRegistry,
      codeBuildEnvSettings: context.blueprintProps.codeBuildEnvSettings,
      parameterProvider,
    });
  }
}

export interface DefaultCodeBuildFactoryProps {
  vpc?: ec2.IVpc; // The VPC to use for the CodeBuild project
  proxyConfig?: IProxyConfig; // Configuration for an HTTP proxy
  npmRegistry?: NPMRegistryConfig; // Configuration for an NPM registry
  codeBuildEnvSettings?: codebuild.BuildEnvironment; // Environment settings for the CodeBuild project
  parameterProvider: IParameterConstruct; // Provider for Parameter Store parameters
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
    let buildSpec = codebuild.BuildSpec.fromObject(this.partialCodeBuildSpec);

    if (props.proxyConfig) {
      const { noProxy, proxySecretArn, proxyTestUrl } = props.proxyConfig;

      // Construct environment variables
      const envVariables = {
        NO_PROXY: noProxy.join(', '), // Comma-separated list of hosts that should bypass the proxy
        AWS_STS_REGIONAL_ENDPOINTS: 'regional', // Use regional endpoints for AWS STS
      };

      // Construct secrets manager object
      const secretsManager = {
        PROXY_USERNAME: `${proxySecretArn}:username`, // Username for the proxy, stored in Secrets Manager
        PROXY_PASSWORD: `${proxySecretArn}:password`, // Password for the proxy, stored in Secrets Manager
        HTTP_PROXY_PORT: `${proxySecretArn}:http_proxy_port`, // HTTP proxy port, stored in Secrets Manager
        HTTPS_PROXY_PORT: `${proxySecretArn}:https_proxy_port`, // HTTPS proxy port, stored in Secrets Manager
        PROXY_DOMAIN: `${proxySecretArn}:proxy_domain`, // Domain for the proxy, stored in Secrets Manager
      };

      // Merge the constructed objects with existing buildSpec
      buildSpec = codebuild.mergeBuildSpecs(
        buildSpec,
        codebuild.BuildSpec.fromObject({
          env: {
            variables: envVariables, // Environment variables for the proxy configuration
            'secrets-manager': secretsManager, // Secrets Manager values for the proxy configuration
          },
          phases: {
            install: {
              commands: [
                'export HTTP_PROXY="http://$PROXY_USERNAME:$PROXY_PASSWORD@$PROXY_DOMAIN:$HTTP_PROXY_PORT"', // Set the HTTP proxy
                'export HTTPS_PROXY="https://$PROXY_USERNAME:$PROXY_PASSWORD@$PROXY_DOMAIN:$HTTPS_PROXY_PORT"', // Set the HTTPS proxy
                'echo "--- Proxy Test ---"', // Print a message for the proxy test
                `curl -Is --connect-timeout 5 ${proxyTestUrl} | grep "HTTP/"`, // Test the proxy by making a request and checking for an HTTP response
              ],
            },
          },
        }),
      );
    }

    this.codeBuildOptions = {
      ...this.generateVPCCodeBuildDefaults(props.vpc), // Default options for a CodeBuild project in a VPC
      partialBuildSpec: buildSpec, // The partially constructed buildspec
      buildEnvironment: props.codeBuildEnvSettings, // Environment settings for the CodeBuild project
      rolePolicy: [
        ...(props.proxyConfig?.proxySecretArn // If a proxy configuration is provided
          ? [
              new iam.PolicyStatement({
                actions: ['secretsmanager:GetSecretValue'], // Allow retrieving secrets from Secrets Manager
                resources: [props.proxyConfig.proxySecretArn], // The ARN of the secret containing proxy configuration
              }),
            ]
          : []), // Otherwise, an empty array
        ...(props.npmRegistry // If an NPM registry configuration is provided
          ? [
              new iam.PolicyStatement({
                actions: ['secretsmanager:GetSecretValue'], // Allow retrieving secrets from Secrets Manager
                resources: [props.npmRegistry.basicAuthSecretArn], // The ARN of the secret containing NPM registry authentication
              }),
            ]
          : []), // Otherwise, an empty array
        props.parameterProvider.provideParameterPolicyStatement(), // Policy statement for accessing Parameter Store parameters
      ],
    };
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
