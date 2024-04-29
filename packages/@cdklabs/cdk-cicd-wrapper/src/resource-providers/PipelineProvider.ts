// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { CDKPipeline } from '../code-pipeline';
import { GlobalResources, ResourceContext, IResourceProvider, INTEGRATION_PHASES } from '../common';

/**
 * Provides CodePipeline implementation
 */
export class PipelineProvider implements IResourceProvider {
  provide(context: ResourceContext): any {
    const { pipelineStack, blueprintProps } = context;

    const vpcProvider = context.get(GlobalResources.VPC)!;
    const repositoryProvider = context.get(GlobalResources.REPOSITORY)!;
    const phaseDefinition = context.get(GlobalResources.PHASE)!;
    const codebuildFactory = context.get(GlobalResources.CODEBUILD_FACTORY)!;

    let proxy;
    if (context.has(GlobalResources.PROXY)) {
      proxy = context.get(GlobalResources.PROXY)!;
    }

    return new CDKPipeline(pipelineStack, 'CdkPipeline', {
      repositoryInput: repositoryProvider.pipelineInput,
      branch: repositoryProvider.repositoryBranch,
      pipelineVariables: {
        PROXY_SECRET_ARN: proxy?.proxySecretArn ?? '',
        ...(blueprintProps.npmRegistry
          ? {
              NPM_REGISTRY: blueprintProps.npmRegistry.url,
              NPM_BASIC_AUTH_SECRET_ID: blueprintProps.npmRegistry.basicAuthSecretArn,
              NPM_SCOPE: blueprintProps.npmRegistry.scope ?? '',
            }
          : {}),
        ...repositoryProvider.pipelineEnvVars,
      },
      vpcProps: vpcProvider.vpc
        ? {
            vpc: vpcProvider.vpc,
            proxy: proxy,
          }
        : undefined,
      buildImage: blueprintProps.codeBuildEnvSettings.buildImage,
      codeGuruScanThreshold: blueprintProps.codeGuruScanThreshold,
      isDockerEnabledForSynth: true,
      applicationQualifier: blueprintProps.applicationQualifier,
      primaryOutputDirectory: blueprintProps.primaryOutputDirectory,
      pipelineName: blueprintProps.applicationName,
      pipelineCommands: phaseDefinition.getCommands(...INTEGRATION_PHASES),
      codeBuildDefaults: codebuildFactory.provideCodeBuildOptions(),
    });
  }
}
