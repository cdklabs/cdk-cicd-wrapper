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
 * CodeBuildFactory
 */
export interface ICodeBuildFactory {

  provideCodeBuildOptions() : CodeBuildOptions;
}

/**
 * Provides HTTPProxy settings for the pipeline.
 */
export class CodeBuildFactoryProvider implements IResourceProvider {

  constructor() {}

  provide(context: ResourceContext): any {

    let proxyConfig : IProxyConfig | undefined;
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
  vpc?: ec2.IVpc;
  proxyConfig?: IProxyConfig;
  npmRegistry?: NPMRegistryConfig;
  codeBuildEnvSettings?: codebuild.BuildEnvironment;
  parameterProvider: IParameterConstruct;
}

export class DefaultCodeBuildFactory implements ICodeBuildFactory {

  private codeBuildOptions: CodeBuildOptions;

  private partialCodeBuildSpec = {
    version: '0.2',
    env: {
      shell: 'bash',
    },
  };

  constructor(props: DefaultCodeBuildFactoryProps) {

    let buildSpec = codebuild.BuildSpec.fromObject(this.partialCodeBuildSpec);

    if (props.proxyConfig) {

      const {
        noProxy,
        proxySecretArn,
        proxyTestUrl,
      } = props.proxyConfig;

      // Construct environment variables
      const envVariables = {
        NO_PROXY: noProxy.join(', '),
        AWS_STS_REGIONAL_ENDPOINTS: 'regional',
      };

      // Construct secrets manager object
      const secretsManager = {
        PROXY_USERNAME: `${proxySecretArn}:username`,
        PROXY_PASSWORD: `${proxySecretArn}:password`,
        HTTP_PROXY_PORT: `${proxySecretArn}:http_proxy_port`,
        HTTPS_PROXY_PORT: `${proxySecretArn}:https_proxy_port`,
        PROXY_DOMAIN: `${proxySecretArn}:proxy_domain`,
      };

      // Merge the constructed objects with existing buildSpec
      buildSpec = codebuild.mergeBuildSpecs(buildSpec, codebuild.BuildSpec.fromObject({
        env: {
          'variables': envVariables,
          'secrets-manager': secretsManager,
        },
        phases: {
          install: {
            commands: [
              'export HTTP_PROXY="http://$PROXY_USERNAME:$PROXY_PASSWORD@$PROXY_DOMAIN:$HTTP_PROXY_PORT"',
              'export HTTPS_PROXY="https://$PROXY_USERNAME:$PROXY_PASSWORD@$PROXY_DOMAIN:$HTTPS_PROXY_PORT"',
              'echo "--- Proxy Test ---"',
              `curl -Is --connect-timeout 5 ${proxyTestUrl} | grep "HTTP/"`,
            ],
          },
        },
      }));
    }

    this.codeBuildOptions = {
      ...this.generateVPCCodeBuildDefaults(props.vpc),
      partialBuildSpec: buildSpec,
      buildEnvironment: props.codeBuildEnvSettings,
      rolePolicy: [
        ...(props.proxyConfig?.proxySecretArn
          ? [
            new iam.PolicyStatement({
              actions: ['secretsmanager:GetSecretValue'],
              resources: [props.proxyConfig.proxySecretArn],
            }),
          ]
          : []),
        ...(props.npmRegistry
          ? [
            new iam.PolicyStatement({
              actions: ['secretsmanager:GetSecretValue'],
              resources: [props.npmRegistry.basicAuthSecretArn],
            }),
          ]
          : []),
        props.parameterProvider.provideParameterPolicyStatement(),
      ],
    };
  }

  generateVPCCodeBuildDefaults(vpc?: ec2.IVpc): object {
    if (!vpc) return {};

    return {
      vpc: vpc,
      subnetSelection: vpc.isolatedSubnets ?? vpc.privateSubnets,
    };
  }

  provideCodeBuildOptions() : CodeBuildOptions {
    return this.codeBuildOptions;
  }

}
