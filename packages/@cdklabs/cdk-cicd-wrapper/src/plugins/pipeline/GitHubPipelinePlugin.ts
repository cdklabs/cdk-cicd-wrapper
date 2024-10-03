// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import {
  AwsCredentials,
  ContainerOptions,
  JobStep,
  DockerCredential,
  Runner,
  JobSettings,
  DockerAssetJobSettings,
  WorkflowTriggers,
  ConcurrencyOptions,
} from 'cdk-pipelines-github';
import { GlobalResources, PluginBase, ResourceContext } from '../..';
import { GitHubPipelineProvider } from './resources/github/GitHubPipelineProvider';
import { GitHubRepositoryOptions, GitHubRepositoryProvider } from './resources/github/GitHubRepositoryProvider';

export interface GitHubPipelinePluginOptions {
  readonly repositoryName?: string;

  /**
   * A list of subject claims allowed to access the IAM role.
   * See https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect
   * A subject claim can include `*` and `?` wildcards according to the `StringLike`
   * condition operator.
   *
   * For example, `['repo:owner/repo1:ref:refs/heads/branch1', 'repo:owner/repo1:environment:prod']`
   */
  readonly subjectClaims?: string[];

  readonly openIdConnectProviderArn?: string;

  /**
   * Thumbprints of GitHub's certificates
   *
   * Every time GitHub rotates their certificates, this value will need to be updated.
   *
   * Default value is up-to-date to June 27, 2023 as per
   * https://github.blog/changelog/2023-06-27-github-actions-update-on-oidc-integration-with-aws/
   *
   * @default - Use built-in keys
   */
  readonly thumbprints?: string[];

  /**
   * File path for the GitHub workflow.
   *
   * @default ".github/workflows/deploy.yml"
   */
  readonly workflowPath?: string;
  /**
   * Name of the workflow.
   *
   * @default "deploy"
   */
  readonly workflowName?: string;
  /**
   * GitHub workflow triggers.
   *
   * @default - By default, workflow is triggered on push to the `main` branch
   * and can also be triggered manually (`workflow_dispatch`).
   */
  readonly workflowTriggers?: WorkflowTriggers;
  /**
   * GitHub workflow concurrency
   *
   * @default - no concurrency settings
   */
  readonly concurrency?: ConcurrencyOptions;
  /**
   * Version of the CDK CLI to use.
   * @default - automatic
   */
  readonly cdkCliVersion?: string;
  /**
   * Indicates if the repository already contains a synthesized `cdk.out` directory, in which
   * case we will simply checkout the repo in jobs that require `cdk.out`.
   *
   * @default false
   */
  readonly preSynthed?: boolean;

  /**
   * Build container options.
   *
   * @default - GitHub defaults
   */
  readonly buildContainer?: ContainerOptions;
  /**
   * GitHub workflow steps to execute before build.
   *
   * @default []
   */
  readonly preBuildSteps?: JobStep[];
  /**
   * GitHub workflow steps to execute after build.
   *
   * @default []
   */
  readonly postBuildSteps?: JobStep[];

  readonly roleName?: string;
  /**
   * The Docker Credentials to use to login. If you set this variable,
   * you will be logged in to docker when you upload Docker Assets.
   */
  readonly dockerCredentials?: DockerCredential[];
  /**
   * The type of runner to run the job on. The runner can be either a
   * GitHub-hosted runner or a self-hosted runner.
   *
   * @default Runner.UBUNTU_LATEST
   */
  readonly runner?: Runner;
  /**
   * Will assume the GitHubActionRole in this region when publishing assets.
   * This is NOT the region in which the assets are published.
   *
   * In most cases, you do not have to worry about this property, and can safely
   * ignore it.
   *
   * @default "us-west-2"
   */
  readonly publishAssetsAuthRegion?: string;
  /**
   * Job level settings that will be applied to all jobs in the workflow,
   * including synth and asset deploy jobs. Currently the only valid setting
   * is 'if'. You can use this to run jobs only in specific repositories.
   *
   * @see https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#example-only-run-job-for-specific-repository
   */
  readonly jobSettings?: JobSettings;
  /**
   * Job level settings applied to all docker asset publishing jobs in the workflow.
   *
   * @default - no additional settings
   */
  readonly dockerAssetJobSettings?: DockerAssetJobSettings;
}

export class GitHubPipelinePlugin extends PluginBase {
  readonly name = 'GitHubPipelinePlugin';
  readonly version = '1.0';

  constructor(private options: GitHubPipelinePluginOptions) {
    super();
  }

  create(context: ResourceContext): void {
    const roleName = this.options.roleName ?? `${context.blueprintProps.applicationName}-github-role`;

    const repositoryConfig: GitHubRepositoryOptions = {
      roleName,
      name: this.options.repositoryName,
      subjectClaims: this.options.subjectClaims,
      openIdConnectProviderArn: this.options.openIdConnectProviderArn,
      thumbprints: this.options.thumbprints,
    };

    context.blueprintProps.resourceProviders[GlobalResources.REPOSITORY] = new GitHubRepositoryProvider(
      repositoryConfig,
    );
    // need to enable this
    context.blueprintProps.resourceProviders[GlobalResources.PIPELINE] = new GitHubPipelineProvider({
      awsCreds: AwsCredentials.fromOpenIdConnect({
        gitHubActionRoleArn: `arn:aws:iam::${context.blueprintProps.deploymentDefinition.RES.env.account}:role/${roleName}`,
        roleSessionName: 'optional-role-session-name',
      }),
      additionalProperties: this.options,
    });

    // manual approvals are not supported, needs to be configured manually
    Object.values(context.blueprintProps.deploymentDefinition).forEach(
      (definition) => ((definition as any).manualApprovalRequired = false),
    );
  }
}
