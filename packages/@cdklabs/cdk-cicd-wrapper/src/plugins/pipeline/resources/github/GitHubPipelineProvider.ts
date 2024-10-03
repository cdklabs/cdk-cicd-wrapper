// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { CodeBuildStep, CodeBuildOptions } from 'aws-cdk-lib/pipelines';
import { GitHubWorkflow, AwsCredentialsProvider, GitHubWorkflowProps, JsonPatch } from 'cdk-pipelines-github';
import { IResourceProvider, ResourceContext, GlobalResources } from '../../../..';

export interface GithubPipelineProviderProps {
  awsCreds: AwsCredentialsProvider;
  additionalProperties?: Omit<GitHubWorkflowProps, 'synth'>;
}

export class GitHubPipelineProvider implements IResourceProvider {
  readonly awsCreds: AwsCredentialsProvider;
  readonly additionalProperties?: Omit<GitHubWorkflowProps, 'synth'>;

  constructor(props: GithubPipelineProviderProps) {
    this.awsCreds = props.awsCreds;
    this.additionalProperties = props.additionalProperties;
  }

  provide(context: ResourceContext) {
    const { pipelineStack, blueprintProps } = context;
    const ciDefinition = context.get(GlobalResources.CI_DEFINITION);

    const buildSpec = ciDefinition.provideBuildSpec() as codebuild.BuildSpec;
    const codeBuildDefaults: CodeBuildOptions = ciDefinition.provideCodeBuildDefaults();

    const commands: string[] = [];
    const env: Record<string, string> = {};
    if (buildSpec.isImmediate) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const buildSpecData = JSON.parse(JSON.stringify((buildSpec as any).spec));

      Object.entries(buildSpecData.env?.variables ?? {}).forEach(([key, value]) => {
        env[key] = value as string;
      });

      ['install', 'pre_build', 'build', 'post_build'].forEach((phase) => {
        if (buildSpecData.phases && buildSpecData.phases[phase]) {
          (buildSpecData.phases[phase].commands ?? []).forEach((command: string) => {
            commands.push(command as string);
          });
        }
      });
    }

    const pipeline = new WrapperGitHubWorkflow(pipelineStack, `${context.blueprintProps.applicationName}GitPipeline`, {
      ...this.additionalProperties,
      awsCreds: this.awsCreds,
      synth: new CodeBuildStep('Synth', {
        installCommands: [],
        commands: [...commands],
        env: {
          CDK_QUALIFIER: blueprintProps.applicationQualifier,
          AWS_REGION: cdk.Stack.of(pipelineStack).region,
          ...env,
        },
        primaryOutputDirectory: blueprintProps.primaryOutputDirectory,
      }),
    });

    const deployWorkflow = pipeline.workflowFile;

    if (codeBuildDefaults.rolePolicy) {
      // authenticate for Synth as additional policies are added to the GitHubRole
      deployWorkflow.patch(
        JsonPatch.add(
          '/jobs/Build-Synth/steps/1',
          this.awsCreds.credentialSteps(this.additionalProperties?.publishAssetsAuthRegion ?? 'us-west-2')[0],
        ),
      );
    }

    return pipeline;
  }
}

export class WrapperGitHubWorkflow extends GitHubWorkflow {
  addStage(stage: cdk.Stage, options?: cdk.pipelines.AddStageOpts): cdk.pipelines.StageDeployment {
    // ensure no recursive calls
    if (options && Object(options).gitHubEnvironment) {
      return super.addStage(stage, options);
    }

    return super.addStageWithGitHubOptions(stage, {
      gitHubEnvironment: {
        name: ResourceContext.instance().stage,
      },
      ...options,
    });
  }
}
