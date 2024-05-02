// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { CodeGuruSeverityThreshold } from '../common';

/**
 * Props for the CodeGuruSecurityStep construct.
 *
 * @interface CodeGuruSecurityStepProps
 */
interface CodeGuruSecurityStepProps {
  /**
   * The name of the application.
   *
   * @type {string}
   */
  applicationName: string;
  /**
   * The qualifier for the application (e.g., dev, prod).
   *
   * @type {string}
   */
  applicationQualifier: string;
  /**
   * The output artifact from the source stage of the CodePipeline.
   *
   * @type {codepipeline.Artifact}
   */
  sourceOutput: codepipeline.Artifact;
  /**
   * The severity threshold for CodeGuru Security to fail the pipeline.
   *
   * @type {CodeGuruSeverityThreshold}
   */
  threshold: CodeGuruSeverityThreshold;
}

/**
 * A construct that creates a CodeBuild project and a CodePipeline action to run CodeGuru Security on the source code.
 *
 * @export
 * @class CodeGuruSecurityStep
 * @extends {Construct}
 */
export class CodeGuruSecurityStep extends Construct {
  /**
   * The CodePipeline action to run the CodeGuru Security scan.
   *
   * @public
   * @type {codepipeline_actions.CodeBuildAction}
   */
  public readonly action: codepipeline_actions.CodeBuildAction;

  /**
   * The Docker image used for the CodeBuild project.
   *
   * @private
   * @type {string}
   * @memberof CodeGuruSecurityStep
   */
  private readonly codeGuruScanImage =
    'public.ecr.aws/l6c8c5q3/codegurusecurity-actions-public@sha256:1077986a48ec419f3bc72a2a321773f59c259632f0f9fb72b1a2067b12fd4311';

  constructor(scope: Construct, id: string, props: CodeGuruSecurityStepProps) {
    super(scope, id);
    const stack = cdk.Stack.of(this);

    const scanName = props.applicationName.replace(/[\W_]+/g, '-');

    /**
     * IAM role for the CodeBuild project to access required AWS resources.
     *
     * @type {iam.Role}
     */
    const role = new iam.Role(this, `${props.applicationQualifier}CodeGuruSecurityCodebuildAccessRole`, {
      roleName: `codeguru-codebuild-${stack.account}-${stack.region}-${props.applicationQualifier}`,
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      maxSessionDuration: cdk.Duration.seconds(3600),
      inlinePolicies: {
        logRetentionOperation: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:PutObject',
                's3:GetObject',
                's3:GetObjectVersion',
                's3:GetBucketAcl',
                's3:GetBucketLocation',
              ],
              resources: [
                cdk.Arn.format({
                  partition: 'aws',
                  account: '',
                  region: '',
                  service: 's3',
                  resource: `codepipeline-${stack.region}-*`,
                }),
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'codebuild:CreateReportGroup',
                'codebuild:CreateReport',
                'codebuild:UpdateReport',
                'codebuild:BatchPutTestCases',
                'codebuild:BatchPutCodeCoverages',
              ],
              resources: [cdk.Arn.format({ service: 'codebuild', resource: 'report-group/CodeGuruSecurity-*' }, stack)],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'codebuild:CreateReportGroup',
                'codebuild:CreateReport',
                'codebuild:UpdateReport',
                'codebuild:BatchPutTestCases',
                'codebuild:BatchPutCodeCoverages',
              ],
              resources: [`arn:aws:codeguru-security:*:*:scans/${scanName}`],
            }),
          ],
        }),
      },
    });

    /**
     * The CodeBuild project to run the CodeGuru Security scan.
     *
     * @type {codebuild.PipelineProject}
     */
    const codeGuruReview = new codebuild.PipelineProject(this, `${props.applicationQualifier}CodeGuruSecurity`, {
      projectName: `${props.applicationQualifier}CodeGuruSecurity`,
      description: 'The build target to run codeguru security.',
      environment: {
        computeType: codebuild.ComputeType.SMALL,
        buildImage: codebuild.LinuxBuildImage.fromDockerRegistry(this.codeGuruScanImage),
      },
      queuedTimeout: cdk.Duration.minutes(30),
      timeout: cdk.Duration.minutes(10),
      role: role,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          build: {
            commands: [
              `SCAN_NAME=${scanName}`,
              `python /usr/app/codeguru/command.py --source_path . --aws_region ${stack.region} --output_file_prefix codeguru-security-results --scan_name "$SCAN_NAME" --fail_on_severity ${props.threshold}`,
              'cat codeguru-security-results.sarif.json',
            ],
          },
        },
      }),
    });

    this.action = new codepipeline_actions.CodeBuildAction({
      actionName: 'CodeGuruSecurity',
      project: codeGuruReview,
      input: props.sourceOutput,
    });

    NagSuppressions.addResourceSuppressions(
      role,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'This is managed policy recommended by the AWS CodeGuru team.',
        },
      ],
      true,
    );

    NagSuppressions.addResourceSuppressions(
      codeGuruReview,
      [
        {
          id: 'AwsSolutions-CB5',
          reason: 'This is an image provided by the AWS CodeGuru team.',
        },
      ],
      true,
    );
  }
}
