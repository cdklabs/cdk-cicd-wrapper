// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as pipelines from 'aws-cdk-lib/pipelines';
import * as nag from 'cdk-nag';
import { GitHubActionRole } from 'cdk-pipelines-github';
import { Construct } from 'constructs';
import { GlobalResources, IResourceProvider, ResourceContext } from '../../../../common';

export interface GitHubRepositoryOptions {
  readonly name?: string;

  /**
   * A list of subject claims allowed to access the IAM role.
   * See https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect
   * A subject claim can include `*` and `?` wildcards according to the `StringLike`
   * condition operator.
   *
   * For example, `['repo:owner/repo1:ref:refs/heads/branch1', 'repo:owner/repo1:environment:prod']`
   */
  readonly subjectClaims?: string[];

  readonly roleName: string;

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
}

export class GitHubRepositoryProvider implements IResourceProvider {
  constructor(private config: GitHubRepositoryOptions) {}

  /**
   * Provides a repository stack based on the configuration.
   * @param context The resource context.
   * @returns The repository stack.
   */
  provide(context: ResourceContext): any {
    if (!this.config.name && (!this.config.subjectClaims || this.config.subjectClaims.length === 0)) {
      throw new Error('Either name or subjectClaims must be provided.');
    }

    const codeBuildDefaults: pipelines.CodeBuildOptions = context
      .get(GlobalResources.CI_DEFINITION)
      .provideCodeBuildDefaults();

    return new GitHubRepositoryStack(context.scope, `${context.blueprintProps.applicationName}GitHubRepositoryStack`, {
      repos: this.config.name ? [this.config.name] : undefined,
      subjectClaims: this.config.subjectClaims,
      thumbprints: this.config.thumbprints,
      roleName: this.config.roleName,
      openIdConnectProviderArn: this.config.openIdConnectProviderArn,
      rolePolicy: codeBuildDefaults.rolePolicy,
    });
  }
}

interface Props extends cdk.StackProps {
  /**
   * A list of GitHub repositories you want to be able to access the IAM role.
   * Each entry should be your GitHub username and repository passed in as a
   * single string.
   * An entry `owner/repo` is equivalent to the subjectClaim `repo:owner/repo:*`.
   *
   * For example, `['owner/repo1', 'owner/repo2'].
   */
  readonly repos?: string[];
  /**
   * A list of subject claims allowed to access the IAM role.
   * See https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect
   * A subject claim can include `*` and `?` wildcards according to the `StringLike`
   * condition operator.
   *
   * For example, `['repo:owner/repo1:ref:refs/heads/branch1', 'repo:owner/repo1:environment:prod']`
   */
  readonly subjectClaims?: string[];
  /**
   * The name of the Oidc role.
   *
   * @default 'GitHubActionRole'
   */
  readonly roleName?: string;

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

  readonly rolePolicy?: iam.PolicyStatement[];
}

export class GitHubRepositoryStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const role = new GitHubActionRole(this, 'GitHubActionRole', {
      ...props,
      ...(props.openIdConnectProviderArn
        ? {
            provider: iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
              this,
              'OpenIdProvider',
              props.openIdConnectProviderArn,
            ),
          }
        : {}),
    });

    if (props.rolePolicy) {
      const policy = new iam.Policy(this, 'GitHubActionAdditionalGrants', {
        statements: props.rolePolicy,
        roles: [role.role],
      });

      nag.NagSuppressions.addResourceSuppressions(
        policy,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Wildcard is required for GitHubActionRole',
          },
        ],
        true,
      );
    }

    nag.NagSuppressions.addResourceSuppressions(
      role,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Wildcard is required for GitHubActionRole',
        },
      ],
      true,
    );
  }
}
