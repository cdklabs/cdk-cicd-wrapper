// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { CDKPipeline } from '../code-pipeline';
import { GlobalResources, ResourceContext, IResourceProvider } from '../common';

/**
 * Provides CodePipeline implementation
 */
export class PipelineProvider implements IResourceProvider {
  /**
   * Provides the CodePipeline resource.
   *
   * @param context - The resource context containing the required resources and properties.
   * @returns The created CodePipeline resource.
   */
  provide(context: ResourceContext): any {
    const { pipelineStack, blueprintProps } = context;

    const vpcProvider = context.get(GlobalResources.VPC)!;
    const repositoryProvider = context.get(GlobalResources.REPOSITORY)!;
    const ciDefinition = context.get(GlobalResources.CI_DEFINITION)!;
    const codebuildFactory = context.get(GlobalResources.CODEBUILD_FACTORY)!;

    let proxy;
    if (context.has(GlobalResources.PROXY)) {
      proxy = context.get(GlobalResources.PROXY)!;
    }

    return new CDKPipeline(pipelineStack, 'CdkPipeline', {
      repositoryInput: repositoryProvider.pipelineInput,
      branch: repositoryProvider.repositoryBranch,
      pipelineVariables: {
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
      ciBuildSpec: ciDefinition.provideBuildSpec(),
      synthCodeBuildDefaults: ciDefinition.provideCodeBuildDefaults(),
      codeBuildDefaults: codebuildFactory.provideCodeBuildOptions(),
      options: blueprintProps.pipelineOptions,
    });
  }
}
