// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { ApprovalRuleTemplate, ApprovalRuleTemplateRepositoryAssociation } from '@cloudcomponents/cdk-pull-request-approval-rule';
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

export interface PRCheckConfig {
  readonly codeGuruReviewer: boolean;
  readonly buildSpec: codebuild.BuildSpec;
  readonly codeBuildOptions: pipelines.CodeBuildOptions;
}

export interface CodeCommitRepositoryConstructProps extends RepositoryConfig {
  readonly applicationName: string;
  readonly applicationQualifier: string;
  readonly pr?: PRCheckConfig;
}

export class CodeCommitRepositoryConstruct extends Construct {
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

      cdk.Aspects.of(cdk.Stack.of(this)).add(
        new CodeCommitRepositoryAspects(),
      );

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
            reason: 'Suppress AwsSolutions-CB3 - Privileged mode is required to build Lambda functions written in JS/TS',
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
        ],
        true,
      );
    });
  }
}

function suppressDeprecationWarning(block: () => void) {
  const originalJsiiSettings = process.env.JSII_DEPRECATED;

  process.env.JSII_DEPRECATED = 'quiet';
  try {
    block();
  } finally {
    process.env.JSII_DEPRECATED = originalJsiiSettings;
  }
}

