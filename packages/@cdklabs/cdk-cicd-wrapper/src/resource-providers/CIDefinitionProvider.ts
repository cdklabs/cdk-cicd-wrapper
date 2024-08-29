// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { GlobalResources, INTEGRATION_PHASES, IResourceProvider, ResourceContext } from '../common';

/**
 * Provides CodeBuild BuildSpec for the Synth Step
 */
export class CIDefinitionProvider implements IResourceProvider {
  provide(context: ResourceContext): any {
    const phaseDefinition = context.get(GlobalResources.PHASE)!;
    const { applicationQualifier, buildSpec } = context.blueprintProps;

    const defaultBuildSpec = codebuild.BuildSpec.fromObject({
      version: '0.2',
      env: {
        variables: {
          CDK_QUALIFIER: applicationQualifier,
        },
      },
    });

    if (buildSpec) {
      return codebuild.mergeBuildSpecs(defaultBuildSpec, buildSpec);
    }

    return codebuild.mergeBuildSpecs(
      defaultBuildSpec,
      codebuild.BuildSpec.fromObject({
        phases: {
          build: {
            commands: phaseDefinition.getCommands(...INTEGRATION_PHASES),
          },
        },
      }),
    );
  }
}
