// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { NagSuppressions } from 'cdk-nag';
import { Construct, IConstruct } from 'constructs';
import { CodeGuruSecurityStep } from './CodeGuruSecurityStep';
import { CodeGuruSeverityThreshold } from '../common';

/**
 * Props for the CDKPipeline construct.
 */
export interface CDKPipelineProps extends PipelineProps {
  /**
   * The qualifier for the application.
   */
  readonly applicationQualifier: string;
  /**
   * The name of the pipeline.
   */
  readonly pipelineName: string;
  /**
   * Additional IAM policies to be attached to the pipeline role.
   */
  readonly rolePolicies?: iam.PolicyStatement[];
}

/**
 * Props for configuring a VPC.
 */
export interface VpcProps {
  /**
   * The VPC to be used.
   */
  readonly vpc: ec2.IVpc;
  /**
   * Proxy configuration.
   */
  readonly proxy?: ProxyProps;
}

/**
 * Props for configuring a proxy.
 */
export interface ProxyProps {
  /**
   * A list of URLs or IP addresses that should bypass the proxy.
   */
  readonly noProxy: string[];
  /**
   * The ARN of the secret containing the proxy credentials.
   */
  readonly proxySecretArn: string;
  /**
   * A URL to test the proxy configuration.
   */
  readonly proxyTestUrl: string;
}

export interface PipelineOptions {
  /**
   * Whether the pipeline should allow self-mutation.
   */
  readonly selfMutation?: boolean;

  /**
   * Publish assets in multiple CodeBuild projects
   *
   * If set to false, use one Project per type to publish all assets.
   *
   * Publishing in parallel improves concurrency and may reduce publishing
   * latency, but may also increase overall provisioning time of the CodeBuild
   * projects.
   *
   * Experiment and see what value works best for you.
   *
   * @default true
   */
  readonly publishAssetsInParallel?: boolean;
  /**
   * A list of credentials used to authenticate to Docker registries.
   *
   * Specify any credentials necessary within the pipeline to build, synth, update, or publish assets.
   *
   * @default []
   */
  readonly dockerCredentials?: pipelines.DockerCredential[];

  /**
   * Deploy every stack by creating a change set and executing it
   *
   * When enabled, creates a "Prepare" and "Execute" action for each stack. Disable
   * to deploy the stack in one pipeline action.
   *
   * @default true
   */
  readonly useChangeSets?: boolean;

  /**
   * The pipeline type to use.
   *
   * @default - The default pipeline type is V1.
   * @see https://docs.aws.amazon.com/cdk/api/latest/docs/aws-cdk-lib.pipelines-readme.html#pipeline-types
   */
  readonly pipelineType: codepipeline.PipelineType;
}

/**
 * Props for configuring the pipeline.
 */
export interface PipelineProps {
  /**
   * The source repository for the pipeline.
   */
  readonly repositoryInput: pipelines.IFileSetProducer;
  /**
   * The branch to be used from the source repository.
   */
  readonly branch: string;
  /**
   * Whether Docker should be enabled for synth.
   * @default false
   */
  readonly isDockerEnabledForSynth?: boolean;
  /**
   * The Docker image to be used for the build project.
   */
  readonly buildImage?: codebuild.IBuildImage;
  /**
   * The severity threshold for CodeGuru security scans.
   */
  readonly codeGuruScanThreshold?: CodeGuruSeverityThreshold;
  /**
   * VPC configuration for the pipeline.
   */
  readonly vpcProps?: VpcProps;
  /**
   * Pipeline variables to be passed as environment variables.
   */
  readonly pipelineVariables?: { [key: string]: string };
  /**
   * The primary output directory for the synth step.
   */
  readonly primaryOutputDirectory: string;
  /**
   * The CI commands to be executed as part of the Synth step.
   */
  readonly ciBuildSpec: codebuild.BuildSpec;
  /**
   * Additional install commands to be executed before the synth step.
   */
  readonly installCommands?: string[];
  /**
   * Default options for CodeBuild projects in the pipeline.
   */
  readonly codeBuildDefaults: pipelines.CodeBuildOptions;

  /**
   * Default options for the synth CodeBuild project.
   */
  readonly synthCodeBuildDefaults?: pipelines.CodeBuildOptions;

  /**
   * Additional Pipeline options.
   */
  readonly options?: PipelineOptions;
}

// ensure that VPC is detached from codebuild project on VPC deletion
class CodeBuildAspect implements cdk.IAspect {
  /**
   * Visits the constructs in the pipeline and detaches the VPC from the CodeBuild project on VPC deletion.
   * @param node The construct being visited.
   */
  public visit(node: IConstruct): void {
    if (node instanceof codebuild.Project) {
      (node.node.defaultChild as codebuild.CfnProject).addPropertyOverride('VpcConfig', {
        VpcId: { Ref: 'AWS::NoValue' },
      });
    }
  }
}

export interface AddStageOpts extends pipelines.AddStageOpts {
  /**
   * Whether to enable transition to this stage.
   *
   * @default true
   */
  readonly transitionToEnabled?: boolean;
  /**
   * The reason for disabling transition to this stage. Only applicable
   * if `transitionToEnabled` is set to `false`.
   *
   * @default 'Transition disabled'
   */
  readonly transitionDisabledReason?: string;
  /**
   * The method to use when a stage allows entry.
   *
   * @default - No conditions are applied before stage entry
   */
  readonly beforeEntry?: codepipeline.Conditions;
  /**
   * The method to use when a stage has not completed successfully.
   *
   * @default - No failure conditions are applied
   */
  readonly onFailure?: codepipeline.FailureConditions;
  /**
   * The method to use when a stage has succeeded.
   *
   * @default - No success conditions are applied
   */
  readonly onSuccess?: codepipeline.Conditions;
}

/**
 * A construct for creating a CDK pipeline.
 */
export class CDKPipeline extends pipelines.CodePipeline {
  /**
   * Default install commands for the pipeline.
   */
  static readonly installCommands: string[] = ['pip3 install awscli --upgrade --quiet'];

  private readonly codeGuruScanThreshold?: CodeGuruSeverityThreshold;
  private readonly applicationQualifier: string;
  private readonly pipelineName: string;

  private pipelineType: codepipeline.PipelineType;
  private proxyPipeline?: codepipeline.Pipeline;
  readonly stages: Record<string, pipelines.AddStageOpts> = {};

  /**
   * Creates a new instance of the CDKPipeline construct.
   * @param scope The parent construct.
   * @param id The ID of the construct.
   * @param props The props for configuring the pipeline.
   */
  constructor(scope: Construct, id: string, props: CDKPipelineProps) {
    super(scope, id, {
      pipelineName: props.pipelineName,
      crossAccountKeys: true,
      enableKeyRotation: true,
      dockerEnabledForSynth: props.isDockerEnabledForSynth,
      pipelineType: codepipeline.PipelineType.V1,
      synth: new pipelines.CodeBuildStep('Synth', {
        input: props.repositoryInput,
        installCommands: props.installCommands,
        commands: [],
        partialBuildSpec: props.ciBuildSpec,
        env: {
          CDK_QUALIFIER: props.applicationQualifier,
          AWS_REGION: cdk.Stack.of(scope).region,
          ...props.pipelineVariables,
        },
        primaryOutputDirectory: props.primaryOutputDirectory,
      }),
      synthCodeBuildDefaults: props.synthCodeBuildDefaults,
      codeBuildDefaults: props.codeBuildDefaults,
      ...(props.options ?? {}),
    });

    this.codeGuruScanThreshold = props.codeGuruScanThreshold;
    this.applicationQualifier = props.applicationQualifier;
    this.pipelineName = props.pipelineName;
    this.pipelineType = props.options?.pipelineType ?? codepipeline.PipelineType.V1;

    if (!props.vpcProps) {
      cdk.Aspects.of(this).add(new CodeBuildAspect());
    }
  }

  get pipeline(): codepipeline.Pipeline {
    if (!this.proxyPipeline && this.pipelineType === codepipeline.PipelineType.V2) {
      this.proxyPipeline = new Proxy(super.pipeline, {
        get: (target, prop, receiver) => {
          if (prop === 'addStage') {
            return (stageOptions: codepipeline.StageOptions) => {
              return super.pipeline.addStage({
                ...stageOptions,
                ...(this.stages[stageOptions.stageName] ?? {}),
              });
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      });
    } else if (!this.proxyPipeline) {
      this.proxyPipeline = super.pipeline;
    }

    return this.proxyPipeline!;
  }

  /**
   * Builds the pipeline by applying necessary configurations and suppressing certain CDK Nag rules.
   */
  public buildPipeline(): void {
    super.buildPipeline();

    if (this.codeGuruScanThreshold) {
      this.applyCodeGuruScan(this.codeGuruScanThreshold);
    }

    NagSuppressions.addResourceSuppressions(
      this.synthProject,
      [
        {
          id: 'AwsSolutions-CB3',
          reason: 'Suppress AwsSolutions-CB3 - Privileged mode is required to build Lambda functions written in JS/TS',
        },
      ],
      true,
    );

    NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Suppress AwsSolutions-IAM5 on the known Action wildcards.',
          appliesTo: [
            {
              regex:
                '/(.*)(Action::kms:ReEncrypt|Action::s3:Abort|Action::s3:GetObject|Action::s3:DeleteObject|Action::s3:List|Action::s3:GetBucket|Action::kms:GenerateDataKey(.*)|Action::ec2messages:GetEndpoint|Action::ec2messages(.*)|Action::ssmmessages(.*)|Action::ssmmessages:OpenDataChannel)(.*)$/g',
            },
          ],
        },
      ],
      true,
    );

    NagSuppressions.addResourceSuppressionsByPath(
      cdk.Stack.of(this),
      [
        `${cdk.Stack.of(this).stackName}/CdkPipeline/Pipeline`,
        ...(this.selfMutationEnabled ? [`${cdk.Stack.of(this).stackName}/CdkPipeline/UpdatePipeline`] : []),
      ],
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Suppress AwsSolutions-IAM5 on the self mutating pipeline.',
        },
      ],
      true,
    );

    // Assets stage is only included if there are assets which must be uploaded
    if (this.pipeline.stages.find((stage) => stage.stageName === 'Assets')) {
      NagSuppressions.addResourceSuppressionsByPath(
        cdk.Stack.of(this),
        [`${cdk.Stack.of(this).stackName}/CdkPipeline/Assets`],
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Suppress AwsSolutions-IAM5 on the self mutating pipeline.',
          },
        ],
        true,
      );
    }
  }

  addStageWithV2Options(stage: cdk.Stage, options: AddStageOpts): pipelines.StageDeployment {
    if (options) {
      this.stages[stage.stageName] = options;
    }
    return super.addStage(stage, options);
  }

  /**
   * Applies the CodeGuru security scan step to the pipeline based on the provided severity threshold.
   * @param threshold The severity threshold for CodeGuru security scans.
   */
  private applyCodeGuruScan(threshold: CodeGuruSeverityThreshold) {
    const getSourceOutput = () =>
      this.pipeline.stages
        .find((stage) => 'Source' === stage.stageName)
        ?.actions.at(0)
        ?.actionProperties.outputs?.at(0)!;
    const getBuildStage = () => this.pipeline.stages.find((stage) => 'Build' === stage.stageName)!;

    const codeGuruSecurityStep = new CodeGuruSecurityStep(this, 'CodeGuruReviewStep', {
      applicationName: this.pipelineName,
      applicationQualifier: this.applicationQualifier,
      sourceOutput: getSourceOutput(),
      threshold,
    });

    getBuildStage().addAction(codeGuruSecurityStep.action);
  }
}
