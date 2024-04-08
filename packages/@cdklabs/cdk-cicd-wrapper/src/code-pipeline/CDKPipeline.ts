// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { NagSuppressions } from 'cdk-nag';
import { Construct, IConstruct } from 'constructs';
import { CodeGuruSecurityStep } from './CodeGuruSecurityStep';
import { CodeGuruSeverityThreshold } from '../common';

export interface CDKPipelineProps extends PipelineProps {
  readonly applicationQualifier: string;
  readonly pipelineName: string;
  readonly rolePolicies?: iam.PolicyStatement[];
}

export interface VpcProps {
  readonly vpc: ec2.IVpc;
  readonly proxy?: ProxyProps;
}

export interface ProxyProps {
  readonly noProxy: string[];
  readonly proxySecretArn: string;
  readonly proxyTestUrl: string;
}

export interface PipelineProps {
  readonly repositoryInput: pipelines.IFileSetProducer;
  readonly branch: string;
  readonly isDockerEnabledForSynth?: boolean;
  readonly buildImage?: codebuild.IBuildImage;
  readonly codeGuruScanThreshold?: CodeGuruSeverityThreshold;
  readonly vpcProps?: VpcProps;
  readonly pipelineVariables?: { [key in string]: string };
  readonly primaryOutputDirectory: string;
  readonly pipelineCommands: string[];
  readonly installCommands?: string[];
  readonly codeBuildDefaults: pipelines.CodeBuildOptions;
}

// ensure that VPC is detached from codebuild project on VPC deletion
class CodeBuildAspect implements cdk.IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof codebuild.Project) {
      (node.node.defaultChild as codebuild.CfnProject).addPropertyOverride('VpcConfig', {
        VpcId: { Ref: 'AWS::NoValue' },
      });
    }
  }
}

export class CDKPipeline extends pipelines.CodePipeline {
  static readonly installCommands: string[] = ['pip3 install awscli --upgrade --quiet'];

  private readonly codeGuruScanThreshold?: CodeGuruSeverityThreshold;
  private readonly applicationQualifier: string;
  private readonly pipelineName: string;

  constructor(scope: Construct, id: string, props: CDKPipelineProps) {
    super(scope, id, {
      pipelineName: props.pipelineName,
      crossAccountKeys: true,
      enableKeyRotation: true,
      dockerEnabledForSynth: props.isDockerEnabledForSynth,
      synth: new pipelines.ShellStep('Synth', {
        input: props.repositoryInput,
        installCommands: props.installCommands,
        commands: props.pipelineCommands,
        env: {
          CDK_QUALIFIER: props.applicationQualifier,
          AWS_REGION: cdk.Stack.of(scope).region,
          ...props.pipelineVariables,
        },
        primaryOutputDirectory: props.primaryOutputDirectory,
      }),
      codeBuildDefaults: props.codeBuildDefaults,
    });

    this.codeGuruScanThreshold = props.codeGuruScanThreshold;
    this.applicationQualifier = props.applicationQualifier;
    this.pipelineName = props.pipelineName;

    if (!props.vpcProps) {
      cdk.Aspects.of(this).add(new CodeBuildAspect());
    }
  }

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
        `${cdk.Stack.of(this).stackName}/CdkPipeline/UpdatePipeline`,
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
