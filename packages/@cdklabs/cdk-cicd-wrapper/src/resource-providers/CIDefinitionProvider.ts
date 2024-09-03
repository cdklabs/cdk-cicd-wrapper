// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { GlobalResources, INTEGRATION_PHASES, IResourceProvider, ResourceContext } from '../common';

export interface ICIDefinition {
  provideBuildSpec(): codebuild.BuildSpec;

  append(partialBuildSpec: codebuild.BuildSpec): void;

  provideCodeBuildDefaults(): pipelines.CodeBuildOptions;

  additionalPolicyStatements(policyStatements: iam.PolicyStatement[]): void;
}

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
      return new BaseCIDefinition(codebuild.mergeBuildSpecs(defaultBuildSpec, buildSpec));
    }

    return new BaseCIDefinition(
      codebuild.mergeBuildSpecs(
        defaultBuildSpec,
        codebuild.BuildSpec.fromObject({
          phases: {
            build: {
              commands: phaseDefinition.getCommands(...INTEGRATION_PHASES),
            },
          },
        }),
      ),
    );
  }
}

class BaseCIDefinition implements ICIDefinition {
  private buildSpec: codebuild.BuildSpec;

  private policyStatements: iam.PolicyStatement[] = [];

  constructor(buildSpec: codebuild.BuildSpec) {
    this.buildSpec = buildSpec;
  }

  provideBuildSpec(): codebuild.BuildSpec {
    return this.buildSpec;
  }

  provideCodeBuildDefaults(): pipelines.CodeBuildOptions {
    return this.policyStatements.length === 0
      ? {}
      : {
          rolePolicy: this.policyStatements,
        };
  }

  append(partialBuildSpec: codebuild.BuildSpec): void {
    this.buildSpec = this.buildSpec ? codebuild.mergeBuildSpecs(this.buildSpec, partialBuildSpec) : partialBuildSpec;
  }

  additionalPolicyStatements(policyStatements: iam.PolicyStatement[]): void {
    this.policyStatements.push(...policyStatements);
  }
}
