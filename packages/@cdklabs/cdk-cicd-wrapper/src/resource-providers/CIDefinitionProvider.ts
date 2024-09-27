// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { GlobalResources, INTEGRATION_PHASES, IResourceProvider, ResourceContext } from '../common';
import { mergeCodeBuildOptions } from './CodeBuildFactoryProvider';

export interface RuntimeVersionOptions {
  readonly java?: string;

  readonly php?: string;

  readonly ruby?: string;

  readonly golang?: string;

  readonly python?: string;

  readonly nodejs?: string;

  readonly dotnet?: string;
}

export interface BuildOptions {
  readonly runTimeVersions?: RuntimeVersionOptions;

  readonly codeBuildDefaults?: pipelines.CodeBuildOptions;
}

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
    const { applicationQualifier, buildSpec, buildOptions } = context.blueprintProps;

    const defaultBuildSpec = codebuild.BuildSpec.fromObject({
      version: '0.2',
      env: {
        variables: {
          CDK_QUALIFIER: applicationQualifier,
        },
      },
      ...(buildOptions?.runTimeVersions
        ? { phases: { install: { 'runtime-versions': buildOptions.runTimeVersions } } }
        : {}),
    });

    if (buildSpec) {
      return new BaseCIDefinition(
        codebuild.mergeBuildSpecs(defaultBuildSpec, buildSpec),
        buildOptions?.codeBuildDefaults ?? {},
      );
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
      buildOptions?.codeBuildDefaults ?? {},
    );
  }
}

export class BaseCIDefinition implements ICIDefinition {
  private buildSpec: codebuild.BuildSpec;
  private buildOptions: pipelines.CodeBuildOptions;

  constructor(buildSpec: codebuild.BuildSpec, buildOptions: pipelines.CodeBuildOptions) {
    this.buildSpec = buildSpec;
    this.buildOptions = buildOptions;
  }

  provideBuildSpec(): codebuild.BuildSpec {
    return this.buildSpec;
  }

  provideCodeBuildDefaults(): pipelines.CodeBuildOptions {
    return this.buildOptions;
  }

  append(partialBuildSpec: codebuild.BuildSpec): void {
    this.buildSpec = this.buildSpec ? codebuild.mergeBuildSpecs(this.buildSpec, partialBuildSpec) : partialBuildSpec;
  }

  additionalPolicyStatements(policyStatements: iam.PolicyStatement[]): void {
    this.buildOptions = mergeCodeBuildOptions(this.buildOptions, { rolePolicy: policyStatements });
  }

  appendCodeBuildOptions(codeBuildOptions: pipelines.CodeBuildOptions): void {
    this.buildOptions = mergeCodeBuildOptions(this.buildOptions, codeBuildOptions);
  }
}
