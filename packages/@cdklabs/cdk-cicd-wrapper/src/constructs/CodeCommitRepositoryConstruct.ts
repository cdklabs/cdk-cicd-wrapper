// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  ApprovalRuleTemplate,
  ApprovalRuleTemplateRepositoryAssociation,
} from '@cloudcomponents/cdk-pull-request-approval-rule';
import { PullRequestCheck } from '@cloudcomponents/cdk-pull-request-check';
import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codegurureviewer from 'aws-cdk-lib/aws-codegurureviewer';
import * as pipelines from 'aws-cdk-lib/pipelines';
import * as nag from 'cdk-nag';
import { Construct } from 'constructs';
import { CodeCommitRepositoryAspects } from './CodeCommitRepositoryAspects';
import { RepositoryConfig } from '../common';

/**
 * Configuration options for enabling pull request checks.
 */
export interface PRCheckConfig {
  /**
   * Whether to enable Amazon CodeGuru Reviewer for the repository.
   * @default false
   */
  readonly codeGuruReviewer: boolean;

  /**
   * The AWS CodeBuild build spec to use for pull request checks.
   */
  readonly buildSpec: codebuild.BuildSpec;

  /**
   * Additional options for the AWS CodeBuild project used for pull request checks.
   */
  readonly codeBuildOptions: pipelines.CodeBuildOptions;
}

/**
 * Properties for creating a new CodeCommit repository construct.
 */
export interface CodeCommitRepositoryConstructProps extends RepositoryConfig {
  /**
   * The name of the application.
   */
  readonly applicationName: string;

  /**
   * A qualifier for the application name.
   */
  readonly applicationQualifier: string;

  /**
   * Optional configuration for enabling pull request checks.
   */
  readonly pr?: PRCheckConfig;
}

/**
 * A construct for creating a new AWS CodeCommit repository with optional pull request checks.
 */
export class CodeCommitRepositoryConstruct extends Construct {
  /**
   * The pipeline input for the repository.
   */
  readonly pipelineInput: pipelines.IFileSetProducer;

  constructor(scope: Construct, id: string, props: CodeCommitRepositoryConstructProps) {
    super(scope, id);

    const repository = new codecommit.Repository(this, 'Repository', {
      repositoryName: props.name,
      description: props.description,
    });

    this.pipelineInput = pipelines.CodePipelineSource.codeCommit(repository, props.branch);

    if (props.pr) {
      this.enablePrRequest(props.applicationName, repository, props.pr);
    }
  }

  /**
   * Enables pull request checks for the repository.
   * @param applicationName The name of the application.
   * @param repository The CodeCommit repository.
   * @param pr The configuration options for enabling pull request checks.
   */
  private enablePrRequest(applicationName: string, repository: codecommit.Repository, pr: PRCheckConfig) {
    // CODEGURU REVIEW RESOURCES
    if (pr.codeGuruReviewer) {
      new codegurureviewer.CfnRepositoryAssociation(this, 'RepositoryAssociation', {
        name: repository.repositoryName,
        type: 'CodeCommit',
      });
    }

    // The Lambda Runtimes has been updated by the CodeCommitRepositoryAspects,
    // with this method the false warnings have been suppressed
    suppressDeprecationWarning(() => {
      const approvalRuleTemplateName = new ApprovalRuleTemplate(this, 'ApprovalRuleTemplate', {
        approvalRuleTemplateName: `${applicationName}-Require-1-Approver`,
        template: {
          approvers: {
            numberOfApprovalsNeeded: 1,
          },
        },
      }).approvalRuleTemplateName;

      new ApprovalRuleTemplateRepositoryAssociation(this, 'ApprovalRuleTemplateRepositoryAssociation', {
        approvalRuleTemplateName,
        repository,
      });

      const defaultBuildSpec = pr.codeBuildOptions.partialBuildSpec;

      new PullRequestCheck(this, 'PullRequestCheck', {
        repository,
        buildSpec: defaultBuildSpec ? codebuild.mergeBuildSpecs(defaultBuildSpec, pr.buildSpec) : pr.buildSpec,
        vpc: pr.codeBuildOptions.vpc,
        privileged: pr.codeBuildOptions.buildEnvironment?.privileged,
        buildImage: pr.codeBuildOptions.buildEnvironment?.buildImage,
      });

      cdk.Aspects.of(cdk.Stack.of(this)).add(new CodeCommitRepositoryAspects());

      nag.NagSuppressions.addResourceSuppressions(
        this,
        [
          {
            id: 'AwsSolutions-L1',
            reason: 'Suppress AwsSolutions-L1 - Outdated Lambda for PullRequestChecker',
          },
          {
            id: 'AwsSolutions-CB4',
            reason: 'Encryption not needed for CodeBuild pull request verification',
          },
          {
            id: 'AwsSolutions-CB3',
            reason:
              'Suppress AwsSolutions-CB3 - Privileged mode is required to build Lambda functions written in JS/TS',
          },
        ],
        true,
      );

      nag.NagSuppressions.addResourceSuppressionsByPath(
        cdk.Stack.of(this),
        `${cdk.Stack.of(this).stackName}/CodeCommit/PullRequestCheck`,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Suppress AwsSolutions-IAM5 on the PR check lambda function Resource.',
          },
          {
            id: 'AwsSolutions-IAM4',
            reason: 'Suppress AwsSolutions-IAM4 on the PR check lambda function Resource.',
          },
        ],
        true,
      );
    });
  }
}

/**
 * Suppresses deprecation warnings temporarily while executing the provided block.
 * @param block The block of code to execute.
 */
function suppressDeprecationWarning(block: () => void) {
  const originalJsiiSettings = process.env.JSII_DEPRECATED;

  process.env.JSII_DEPRECATED = 'quiet';
  try {
    block();
  } finally {
    process.env.JSII_DEPRECATED = originalJsiiSettings;
  }
}
