// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The GitHub Actions engine (Blueprint `GitHubPipelinePlugin`/`GitHubPipelineProvider`/`GitHubRepositoryProvider`,
// migrated). It renders a `.github/workflows/deploy.yml` (via `cdk-pipelines-github`'s `GitHubWorkflow`)
// instead of an AWS-hosted pipeline -- Autopilot's only other engines (`CodePipelineEngine`/`CdkPipelinesEngine`)
// both provision a real CodePipeline/CodeBuild footprint; this one deploys nothing of its own except the
// OIDC role the workflow assumes. It mechanically mirrors `CdkPipelinesEngine`, not the flat engine: GitHub
// Actions needs every stage built as a `cdk.Stage` inside one synth (the same CDK Pipelines constraint), so
// it takes the same `stages: IStageProvider` the CDK Pipelines engine does, and `cdk-cicd exec` assembles it
// the same way (replaying the plain `bin` once per configured stage -- see runtime/pipeline-assembler).
//
// Unlike Blueprint, the OIDC role's ARN is never read off the constructed `iam.Role` (a CDK token): the workflow
// file is a plain-text YAML `cdk-pipelines-github` writes to disk at synth time, NOT a CloudFormation
// template, so it cannot resolve a token -- only a literal string ends up in the file as-is. `roleName` is
// therefore always literal (explicit or a derived default). The partition is looked up from the stack's
// (literal) region via `RegionInfo`, not `stack.partition` -- that getter returns the SAME kind of
// unresolved `Aws.PARTITION` token unless the (opt-in, not assumed here) `ENABLE_PARTITION_LITERALS`
// feature flag is set, which would silently break this same literal-ARN requirement.

import { Arn, Stack, Stage, Token } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { CodeBuildStep } from 'aws-cdk-lib/pipelines';
import { RegionInfo } from 'aws-cdk-lib/region-info';
import { NagSuppressions } from 'cdk-nag';
import { AwsCredentials, GitHubActionRole, GitHubWorkflow, JsonPatch } from 'cdk-pipelines-github';
import { Construct } from 'constructs';
import { RepositorySourceType } from '../../config/repository';
import { ProxyConfig, ResolvedCicdConfig } from '../../config/types';
import { CdkPipelinesStageContext, IStageProvider } from '../cdkpipelines/CdkPipelinesEngine';
import { defaultCiCommands } from '../ci-commands';

/** Props for the GitHub Actions engine. */
export interface GitHubActionsEngineProps {
  /** The resolved pipeline configuration (`defineCICD`); `repository` must be `Repository.github(...)`. */
  readonly config: ResolvedCicdConfig;
  /** Builds the app's stacks per stage -- the same `IStageProvider` `CdkPipelinesEngine` takes. */
  readonly stages: IStageProvider;
  /**
   * Falls back to `githubActions.workflowName` when set; otherwise `cdk-pipelines-github` defaults the
   * workflow to "deploy". Named `pipelineName`, not `workflowName`, to keep this prop uniform with
   * `CdkPipelinesEngineProps` -- there is no separate AWS-side "pipeline" resource to name here.
   */
  readonly pipelineName?: string;
}

/**
 * A GitHub Actions workflow rendered from an Autopilot config + a stage factory. Reproduces the Blueprint shape: a
 * `GitHubActionRole` the workflow assumes over OIDC, a Synth job, and one job (with a GitHub Environment,
 * so an environment protection rule set up on GitHub's side gates it) per deployment stage. Manual-approval
 * config is NOT translated into a CDK step here -- as in Blueprint, GitHub Environments are the gate; every stage
 * gets its own environment regardless of `manualApproval`, and gating is configured in the GitHub UI.
 */
export class GitHubActionsEngine extends Construct {
  public readonly pipeline: GitHubWorkflow;
  public readonly gitHubActionRole: GitHubActionRole;

  constructor(scope: Construct, id: string, props: GitHubActionsEngineProps) {
    super(scope, id);
    const config = props.config;
    if (config.repository.repositoryType !== RepositorySourceType.GITHUB) {
      throw new Error(
        `cdk-cicd: the GitHub Actions engine requires 'Repository.github(...)' as the repository -- got ` +
          `'${config.repository.repositoryType}'.`,
      );
    }
    const options = config.githubActions ?? {};
    const stack = Stack.of(this);
    const roleName = options.roleName ?? `${config.application ?? 'cdk-cicd'}-github-role`;
    const publishAssetsAuthRegion = options.publishAssetsAuthRegion ?? 'us-west-2';

    // A literal ARN, not `this.gitHubActionRole.role.roleArn` (a CDK token): the workflow file is plain
    // text written at synth time, so only a value known BEFORE synth ends up correctly in it.
    const partition = Token.isUnresolved(stack.region) ? 'aws' : (RegionInfo.get(stack.region).partition ?? 'aws');
    const gitHubActionRoleArn = Arn.format({
      partition,
      service: 'iam',
      region: '',
      account: stack.account,
      resource: 'role',
      resourceName: roleName,
    });

    this.gitHubActionRole = new GitHubActionRole(this, 'GitHubActionRole', {
      roleName,
      repos:
        options.subjectClaims === undefined || options.subjectClaims.length === 0
          ? [config.repository.name]
          : undefined,
      subjectClaims: options.subjectClaims,
      thumbprints: options.thumbprints,
      ...(options.openIdConnectProviderArn
        ? {
            provider: iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
              this,
              'OpenIdProvider',
              options.openIdConnectProviderArn,
            ),
          }
        : {}),
    });
    NagSuppressions.addResourceSuppressions(
      this.gitHubActionRole,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'Wildcard required for the GitHubActionRole trust/permission policy (cdk-pipelines-github generated), mirroring Blueprint.',
        },
      ],
      true,
    );

    // Same install/synth shape as `CdkPipelinesEngine`'s Synth step (proxy exports, then CodeArtifact
    // login, then the configured CI steps and `cdk-cicd pipeline-app`) -- GitHub Actions runs this as a
    // plain job step rather than a CodeBuild project, but the commands themselves are engine-agnostic.
    // `pipeline-app` renders the pipeline (replaying the bin per stage); `cdk.json`'s own `cdk-cicd exec`
    // app command synthesizes only the application stacks now, so self-mutation invokes `pipeline-app`
    // explicitly to keep producing the workflow the "commit the updated workflow file" check compares.
    const installCommands = [
      ...(config.proxy ? proxyInstallCommands(config.proxy) : []),
      ...(config.codeArtifact
        ? [
            `aws codeartifact login --tool npm --domain ${config.codeArtifact.domain} ` +
              `--domain-owner ${config.codeArtifact.account ?? stack.account} ` +
              `--repository ${config.codeArtifact.repository} --region ${config.codeArtifact.region ?? stack.region}` +
              (config.codeArtifact.npmScope ? ` --namespace ${config.codeArtifact.npmScope}` : ''),
          ]
        : []),
    ];
    const ciSteps = Object.values(config.ci.steps);

    this.pipeline = new GitHubWorkflow(this, 'Workflow', {
      awsCreds: AwsCredentials.fromOpenIdConnect({ gitHubActionRoleArn, roleSessionName: 'cdk-cicd-github-actions' }),
      publishAssetsAuthRegion,
      workflowPath: options.workflowPath,
      workflowName: options.workflowName ?? props.pipelineName,
      workflowTriggers: options.workflowTriggers,
      synth: new CodeBuildStep('Synth', {
        installCommands: [],
        // With no ci.steps, run the default CI (its own `npm ci` first); with ci.steps, those steps ARE
        // the build phase verbatim -- the engine injects nothing, not even `npm ci`. Then `npm run cdk
        // synth`, which runs `cdk.json`'s single `cdk-cicd exec` entry; `CDK_CICD_MODE=pipeline` makes it
        // render THIS pipeline so self-mutation keeps producing the workflow the "commit the updated
        // workflow file" check compares. A plain `cdk synth` without the mode renders only the app stacks.
        commands: [...(ciSteps.length > 0 ? ciSteps : defaultCiCommands()), 'npm run cdk synth'],
        env: { CDK_CICD_MODE: 'pipeline', ...(config.qualifier ? { CDK_QUALIFIER: config.qualifier } : {}) },
        primaryOutputDirectory: 'cdk.out',
      }),
    });

    // The Synth job needs AWS credentials of its own only when it talks to an AWS API before `cdk synth`
    // (a private CodeArtifact login, or a proxy secret read) -- unlike the per-stage deploy/asset-publish
    // jobs, `cdk-pipelines-github` does not inject them into the Synth job automatically (see the Synth
    // job's own comment in `pipeline.js`: "does not use the GitHub Action Role on its own"). Patched in
    // right after the checkout step (index 1), ahead of the install/build commands that need it -- same
    // fixed job/step addressing Blueprint used (the synth step is always named 'Synth', so the job is always
    // `Build-Synth`, and checkout is always the first step `cdk-pipelines-github` emits).
    // Inserted in order, each patch computed against the array as it will look once the ones before it
    // have applied -- so the credential step (when present) always lands ahead of the login step.
    const patches: JsonPatch[] = [];
    let insertAt = 1;
    if (config.codeArtifact !== undefined || config.proxy !== undefined) {
      const credentialStep = AwsCredentials.fromOpenIdConnect({
        gitHubActionRoleArn,
        roleSessionName: 'cdk-cicd-github-actions',
      }).credentialSteps(publishAssetsAuthRegion)[0];
      patches.push(JsonPatch.add(`/jobs/Build-Synth/steps/${insertAt}`, credentialStep));
      insertAt += 1;
    }
    if (installCommands.length > 0) {
      patches.push(
        JsonPatch.add(`/jobs/Build-Synth/steps/${insertAt}`, { name: 'Login', run: installCommands.join('\n') }),
      );
    }
    if (patches.length > 0) {
      this.pipeline.workflowFile.patch(...patches);
    }

    // One job per (stage x region), in config order, each gated by its own GitHub Environment (a manual
    // approval, if any, is a protection rule configured on that environment in GitHub -- not a CDK step).
    // Unlike `CdkPipelinesEngine`, the account always resolves to a concrete value (defaulting to the
    // pipeline's own account): the deploy job is a static YAML step, with no CloudFormation-side
    // mechanism to defer an unresolved account the way an AWS-hosted CodePipeline deploy action can.
    for (const stage of config.stages) {
      const account = stage.env.account ?? stack.account;
      const regions = stage.env.regions.length > 0 ? stage.env.regions : [stack.region];
      for (const region of regions) {
        const stageId = regions.length > 1 ? `${stage.name}-${region}` : stage.name;
        const appStage = new Stage(this, stageId, { env: { account, region } });
        const context: CdkPipelinesStageContext = { stageName: stage.name, env: { account, region } };
        props.stages.stacks(appStage, context);
        this.pipeline.addStageWithGitHubOptions(appStage, { gitHubEnvironment: { name: stageId } });
      }
    }
  }
}

/** Export the proxy for every later shell command, then prove the tunnel works before install runs. */
function proxyInstallCommands(proxy: ProxyConfig): string[] {
  return [
    'export HTTP_PROXY="http://$PROXY_USERNAME:$PROXY_PASSWORD@$PROXY_DOMAIN:$HTTP_PROXY_PORT"',
    'export HTTPS_PROXY="https://$PROXY_USERNAME:$PROXY_PASSWORD@$PROXY_DOMAIN:$HTTPS_PROXY_PORT"',
    'echo "--- Proxy Test ---"',
    `curl -Is --connect-timeout 5 ${proxy.proxyTestUrl} | grep "HTTP/"`,
  ];
}
