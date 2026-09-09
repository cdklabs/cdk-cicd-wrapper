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

import { Arn, AspectPriority, Aspects, DefaultStackSynthesizer, Stack, Stage, Token } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { CodeBuildStep } from 'aws-cdk-lib/pipelines';
import { RegionInfo } from 'aws-cdk-lib/region-info';
import { NagSuppressions } from 'cdk-nag';
import { AwsCredentials, GitHubActionRole, GitHubWorkflow, JsonPatch } from 'cdk-pipelines-github';
import { Construct } from 'constructs';
import { assertValidCiImageReference, ciImageRegistryHost, isPrivateEcrRegistryHost } from '../../config/build-image';
import {
  resolveDefaultSynthesizerQualifier,
  specializeDefaultSynthesizerRoleArn,
} from '../../config/default-synthesizer-role-arn';
import { RepositorySourceType } from '../../config/repository';
import {
  CodeArtifactConfig,
  NpmRegistryConfig,
  ProxyConfig,
  RegionOrder,
  ResolvedCicdConfig,
  SynthesizerType,
} from '../../config/types';
import { AccessLogsForBucketAspect } from '../../support/AccessLogsForBucketAspect';
import { SupportResources } from '../../support/SupportResources';
import {
  CdkPipelinesStageContext,
  IStageProvider,
  ssmWarmingCommands,
  ssmWarmingReadStatements,
  targetLookupStatements,
} from '../cdkpipelines/CdkPipelinesEngine';
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
 * `GitHubActionRole` the workflow assumes over OIDC, a Synth job, and one job (with a GitHub Environment)
 * per deployment stage. GitHub owns the environment protection rules, so approval-gated stages are accepted
 * only when config explicitly acknowledges that required reviewers are configured on those environments.
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
    assertSupportedSynthesizer(config);
    assertNoDeployRoleExternalIds(config);
    assertEnvironmentProtectionConfigured(config);
    const stack = Stack.of(this);
    assertConcretePipelineEnvironment(stack);
    assertConcreteDeploymentEnvironments(stack, config);
    const partition = assertSupportedWorkflowPartition(stack, config, options.publishAssetsAuthRegion);
    assertSupportedComplianceLogging(stack, config);
    const buildContainerCredentials = resolveBuildContainerCredentials(config);
    const complianceLogBucket =
      config.complianceLogBucketName !== undefined
        ? new SupportResources(this, 'Support', {
            complianceLogBucketName: config.complianceLogBucketName,
            createComplianceLogBucket: config.createComplianceLogBucket,
          }).complianceLogBucket
        : undefined;
    const roleName = options.roleName ?? `${config.application ?? 'cdk-cicd'}-github-role`;
    const publishAssetsAuthRegion = options.publishAssetsAuthRegion ?? stack.region;

    // A literal ARN, not `this.gitHubActionRole.role.roleArn` (a CDK token): the workflow file is plain
    // text written at synth time, so only a value known BEFORE synth ends up correctly in it.
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
    hardenGitHubOidcAudience(this.gitHubActionRole);
    for (const statement of targetLookupStatements(stack, config, partition)) {
      this.gitHubActionRole.role.addToPrincipalPolicy(statement);
    }
    const qualifier = resolveDefaultSynthesizerQualifier(this, config.qualifier);
    const forcedDeployRoles = new Set<string>();
    for (const stage of config.stages) {
      const configuredDeployRole = stage.deployment?.deployRole?.trim();
      const deployRole =
        configuredDeployRole === undefined || configuredDeployRole.length === 0
          ? DefaultStackSynthesizer.DEFAULT_DEPLOY_ROLE_ARN
          : configuredDeployRole;

      const account = stage.env.account ?? stack.account;
      const regions = stage.env.regions.length > 0 ? stage.env.regions : [stack.region];
      for (const region of regions) {
        const specializedRole = specializeDefaultSynthesizerRoleArn(deployRole, {
          qualifier,
          account,
          region,
          partition,
        });
        assertStableGitHubDeployRoleArn(specializedRole, stage.name);
        if (configuredDeployRole !== undefined && configuredDeployRole.length > 0) {
          forcedDeployRoles.add(specializedRole);
        }
      }
    }
    if (forcedDeployRoles.size > 0) {
      this.gitHubActionRole.role.addToPrincipalPolicy(
        new iam.PolicyStatement({ actions: ['sts:AssumeRole'], resources: [...forcedDeployRoles] }),
      );
    }
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
    // login, then the configured CI steps and `npm run cdk synth`) -- GitHub Actions runs this as a
    // plain job step rather than a CodeBuild project, but the commands themselves are engine-agnostic.
    // The step runs with `CDK_CICD_MODE=pipeline` (set on the step env below), so `cdk.json`'s single
    // `cdk-cicd exec` entry renders the pipeline -- keeping self-mutation producing the workflow the
    // "commit the updated workflow file" check compares. Without the mode it synthesizes only app stacks.
    const privateNpm = config.npmRegistry !== undefined || config.codeArtifact !== undefined;
    const installCommands = [
      ...(privateNpm ? npmConfigSetupCommands() : []),
      ...(config.proxy ? proxyInstallCommands(stack, config.proxy) : []),
      ...(config.warmAccountsFromSsm ? ssmWarmingCommands(config.qualifier) : []),
      ...(config.npmRegistry ? npmRegistryLoginCommands(config.npmRegistry) : []),
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
      postBuildSteps: privateNpm
        ? [
            {
              name: 'Clean up npm credentials',
              if: 'always()',
              run: npmConfigCleanupCommand(),
            },
          ]
        : undefined,
      // cdk-pipelines-github renders buildContainer only on the Build-Synth job, so this is the
      // faithful GitHub Actions equivalent of the CI-only CodeBuild image override.
      buildContainer:
        config.ci.image !== undefined
          ? {
              image: config.ci.image,
              ...(buildContainerCredentials !== undefined ? { credentials: buildContainerCredentials } : {}),
            }
          : undefined,
      synth: new CodeBuildStep('Synth', {
        installCommands: [],
        // With no ci.steps, run the default CI (its own `npm ci` first); with ci.steps, those steps ARE
        // the build phase verbatim -- the engine injects nothing, not even `npm ci`. Then `npm run cdk
        // synth`, which runs `cdk.json`'s single `cdk-cicd exec` entry; `CDK_CICD_MODE=pipeline` makes it
        // render THIS pipeline so self-mutation keeps producing the workflow the "commit the updated
        // workflow file" check compares. A plain `cdk synth` without the mode renders only the app stacks.
        commands: [...(ciSteps.length > 0 ? ciSteps : defaultCiCommands()), 'npm run cdk synth'],
        env: {
          CDK_CICD_MODE: 'pipeline',
          CDK_AWS_PARTITION: partition,
          ...(config.qualifier ? { CDK_QUALIFIER: config.qualifier } : {}),
        },
        primaryOutputDirectory: 'cdk.out',
      }),
    });

    // `cdk-pipelines-github` does not authenticate Build-Synth on its own. Always assume the OIDC role
    // immediately after checkout so the CDK CLI has a concrete account/region during self-mutation and
    // uncached context lookups can assume the target bootstrap lookup roles.
    const credentialStep = AwsCredentials.fromOpenIdConnect({
      gitHubActionRoleArn,
      roleSessionName: 'cdk-cicd-github-actions',
    }).credentialSteps(publishAssetsAuthRegion)[0];
    const patches: JsonPatch[] = [JsonPatch.add('/jobs/Build-Synth/steps/1', credentialStep)];
    const insertAt = 2;
    // The warming scan reads SSM under the qualifier; grant it on the OIDC role the Synth job assumes.
    // Reuse the shared helper so the grant is scoped to `parameter/<qualifier>/*` (a resolvable
    // qualifier is guaranteed: resolveCicdConfig rejects warmAccountsFromSsm without one).
    if (config.warmAccountsFromSsm) {
      for (const statement of ssmWarmingReadStatements(stack, config.qualifier)) {
        this.gitHubActionRole.role.addToPrincipalPolicy(statement);
      }
    }
    if (config.codeArtifact !== undefined) {
      for (const statement of codeArtifactReadStatements(stack, config.codeArtifact)) {
        this.gitHubActionRole.role.addToPrincipalPolicy(statement);
      }
    }
    if (config.proxy !== undefined) {
      for (const statement of secretReadStatements(config.proxy.proxySecretArn, config.proxy.encryptionKeyArn)) {
        this.gitHubActionRole.role.addToPrincipalPolicy(statement);
      }
    }
    if (config.npmRegistry !== undefined) {
      for (const statement of secretReadStatements(
        config.npmRegistry.basicAuthSecretArn,
        config.npmRegistry.encryptionKeyArn,
      )) {
        this.gitHubActionRole.role.addToPrincipalPolicy(statement);
      }
    }
    if (installCommands.length > 0) {
      patches.push(
        JsonPatch.add(`/jobs/Build-Synth/steps/${insertAt}`, { name: 'Login', run: installCommands.join('\n') }),
      );
    }
    if (patches.length > 0) {
      this.pipeline.workflowFile.patch(...patches);
    }

    // One job per (stage x region), each tied to its own GitHub Environment. For manualApproval stages,
    // validation above requires an explicit acknowledgement that required reviewers are configured on
    // these generated environment names. Sequential regions are separate waves; parallel regions share
    // a GitHub wave and therefore have no dependency edge between their deployment jobs.
    // Unlike `CdkPipelinesEngine`, the account always resolves to a concrete value (defaulting to the
    // pipeline's own account): the deploy job is a static YAML step, with no CloudFormation-side
    // mechanism to defer an unresolved account the way an AWS-hosted CodePipeline deploy action can.
    for (const stage of config.stages) {
      const account = stage.env.account ?? stack.account;
      const regions = stage.env.regions.length > 0 ? stage.env.regions : [stack.region];
      const appStageFor = (region: string): { readonly appStage: Stage; readonly stageId: string } => {
        const stageId = regions.length > 1 ? `${stage.name}-${region}` : stage.name;
        const appStage = new Stage(this, stageId, { env: { account, region } });
        if (config.complianceLogBucketName !== undefined && complianceLogBucket !== undefined) {
          // Aspects do not cross Stage boundaries. Attach directly so the application templates,
          // rather than only this workflow-support stack, receive server-access logging.
          Aspects.of(appStage).add(
            new AccessLogsForBucketAspect({
              complianceLogBucketName: config.complianceLogBucketName,
              complianceLogBucketAccount: stack.account,
              complianceLogBucketRegion: stack.region,
              complianceLogBucket,
            }),
            { priority: AspectPriority.MUTATING },
          );
        }
        const context: CdkPipelinesStageContext = { stageName: stage.name, env: { account, region } };
        props.stages.stacks(appStage, context);
        return { appStage, stageId };
      };

      if (stage.env.regionOrder === RegionOrder.PARALLEL && regions.length > 1) {
        const wave = this.pipeline.addGitHubWave(stage.name);
        for (const region of regions) {
          const { appStage, stageId } = appStageFor(region);
          wave.addStageWithGitHubOptions(appStage, { gitHubEnvironment: { name: stageId } });
        }
        continue;
      }

      for (const region of regions) {
        const { appStage, stageId } = appStageFor(region);
        this.pipeline.addStageWithGitHubOptions(appStage, { gitHubEnvironment: { name: stageId } });
      }
    }

    // cdk-pipelines-github resolves deployment placeholders from the ambient CDK_AWS_PARTITION
    // process variable and otherwise hard-codes "aws". Build eagerly under the validated partition,
    // then restore the caller's process environment so local synths and tests remain isolated.
    buildWorkflowForPartition(this.pipeline, partition);
  }
}

/** The installed alpha synthesizer does not support either CDK Pipelines implementation. */
function assertSupportedSynthesizer(config: ResolvedCicdConfig): void {
  if ((config.synthesizer?.type ?? SynthesizerType.DEFAULT) === SynthesizerType.APP_STAGING) {
    throw new Error(
      'cdk-cicd: GITHUB_ACTIONS cannot use SynthesizerType.APP_STAGING: the installed ' +
        '@aws-cdk/app-staging-synthesizer-alpha does not support CDK Pipelines, and Stage replay would ' +
        'create an invalid cross-Stage dependency on DefaultStagingStack. Use SynthesizerType.DEFAULT ' +
        'for generated pipelines; APP_STAGING remains available for direct local CDK deployment.',
    );
  }
}

/** Workflow YAML needs literal account/region values; CloudFormation tokens cannot be deferred into it. */
function assertConcretePipelineEnvironment(stack: Stack): void {
  if (Token.isUnresolved(stack.account) || Token.isUnresolved(stack.region)) {
    throw new Error(
      'cdk-cicd: GITHUB_ACTIONS requires a concrete pipeline stack account and region because the ' +
        'workflow renders a literal OIDC role ARN.',
    );
  }
  if (RegionInfo.get(stack.region).partition === undefined || RegionInfo.get(stack.region).domainSuffix === undefined) {
    throw new Error(
      `cdk-cicd: GITHUB_ACTIONS pipeline region '${stack.region}' is not known to this aws-cdk-lib ` +
        'version. Upgrade the wrapper/CDK before rendering a workflow for that Region.',
    );
  }
}

/** GitHub workflow YAML cannot defer target account/Region tokens to CloudFormation. */
function assertConcreteDeploymentEnvironments(stack: Stack, config: ResolvedCicdConfig): void {
  for (const stage of config.stages) {
    const account = stage.env.account ?? stack.account;
    const regions = stage.env.regions.length > 0 ? stage.env.regions : [stack.region];
    if (
      account.length === 0 ||
      Token.isUnresolved(account) ||
      regions.some((region) => region.length === 0 || Token.isUnresolved(region))
    ) {
      throw new Error(
        `cdk-cicd: GITHUB_ACTIONS stage '${stage.name}' requires concrete account and region values ` +
          'because the generated workflow contains literal deployment jobs and IAM role ARNs.',
      );
    }
  }
}

/**
 * The installed GitHub engine has no OIDC audience option and its deployment renderer reads
 * CDK_AWS_PARTITION from process state. Restrict it to the commercial partition, validate every
 * participating Region, and then build under that exact partition below.
 */
function assertSupportedWorkflowPartition(
  stack: Stack,
  config: ResolvedCicdConfig,
  configuredAuthRegion?: string,
): string {
  const pipelinePartition = partitionForRegion(stack.region, 'GITHUB_ACTIONS pipeline');
  if (pipelinePartition !== 'aws') {
    throw new Error(
      `cdk-cicd: GITHUB_ACTIONS does not support pipeline partition '${pipelinePartition}' with the ` +
        'installed cdk-pipelines-github release: its OIDC helper cannot configure a partition-specific ' +
        "audience. Use the CDK_PIPELINES or CODEPIPELINE engine outside the commercial 'aws' partition.",
    );
  }

  for (const stage of config.stages) {
    const regions = stage.env.regions.length > 0 ? stage.env.regions : [stack.region];
    for (const region of regions) {
      const targetPartition = partitionForRegion(region, `GITHUB_ACTIONS stage '${stage.name}'`);
      if (targetPartition !== pipelinePartition) {
        throw new Error(
          `cdk-cicd: GITHUB_ACTIONS cannot mix AWS partitions: pipeline region '${stack.region}' is in ` +
            `'${pipelinePartition}', but stage '${stage.name}' region '${region}' is in '${targetPartition}'.`,
        );
      }
    }
  }

  if (config.codeArtifact?.region !== undefined) {
    const codeArtifactPartition = partitionForRegion(config.codeArtifact.region, 'GITHUB_ACTIONS CodeArtifact');
    if (codeArtifactPartition !== pipelinePartition) {
      throw new Error(
        `cdk-cicd: GITHUB_ACTIONS cannot use CodeArtifact region '${config.codeArtifact.region}' in partition ` +
          `'${codeArtifactPartition}' from pipeline partition '${pipelinePartition}'.`,
      );
    }
  }

  const authRegion = configuredAuthRegion ?? stack.region;
  const authPartition = partitionForRegion(authRegion, 'GITHUB_ACTIONS publishAssetsAuthRegion');
  if (authPartition !== pipelinePartition) {
    throw new Error(
      `cdk-cicd: GITHUB_ACTIONS publishAssetsAuthRegion '${authRegion}' is in partition ` +
        `'${authPartition}', but the pipeline is in '${pipelinePartition}'.`,
    );
  }

  return pipelinePartition;
}

function partitionForRegion(region: string, context: string): string {
  if (region.length === 0 || Token.isUnresolved(region)) {
    throw new Error(`cdk-cicd: ${context} requires a concrete Region so its AWS partition can be verified.`);
  }
  const partition = RegionInfo.get(region).partition;
  if (partition === undefined) {
    throw new Error(
      `cdk-cicd: ${context} region '${region}' is not known to this aws-cdk-lib version. ` +
        'Upgrade the wrapper/CDK before using that Region.',
    );
  }
  return partition;
}

/**
 * A single destination bucket is deployed with the workflow-support stack. S3 server access logging
 * cannot cross accounts or Regions, so reject any application Stage that could not use that bucket.
 */
function assertSupportedComplianceLogging(stack: Stack, config: ResolvedCicdConfig): void {
  if (config.complianceLogBucketName === undefined) return;

  for (const stage of config.stages) {
    const account = stage.env.account ?? stack.account;
    const regions = stage.env.regions.length > 0 ? stage.env.regions : [stack.region];
    if (
      Token.isUnresolved(account) ||
      account !== stack.account ||
      regions.some((region) => Token.isUnresolved(region) || region !== stack.region)
    ) {
      throw new Error(
        `cdk-cicd: compliance logging cannot target GitHub Actions stage '${stage.name}' from bucket ` +
          `'${config.complianceLogBucketName}' in ${stack.account}/${stack.region}. S3 server access-log ` +
          'source and destination buckets must be in the same account and region; configure only ' +
          'co-located stages or omit complianceLogBucketName.',
      );
    }
  }
}

/**
 * GitHub pulls a job container before any workflow step can authenticate to private ECR. Recognize
 * canonical, FIPS, dual-stack, and malformed ECR-like hosts so none can fall through as an anonymous
 * external registry. Other external registry strings remain the public/anonymous path.
 */
function resolveBuildContainerCredentials(
  config: ResolvedCicdConfig,
): { readonly username: string; readonly password: string } | undefined {
  if (config.ci.codeBuildImageCredentials !== undefined) {
    throw new Error(
      'cdk-cicd: ci.codeBuildImageCredentials is supported only by the CodeBuild engines; ' +
        'GITHUB_ACTIONS uses githubActions.buildContainerCredentials.',
    );
  }

  const image = config.ci.image;
  const credentials = config.githubActions?.buildContainerCredentials;
  if (image === undefined) {
    if (credentials !== undefined) {
      throw new Error('cdk-cicd: githubActions.buildContainerCredentials requires ci.image.');
    }
    return undefined;
  }

  assertValidCiImageReference(image);
  if (image.startsWith('aws/codebuild/')) {
    throw new Error(
      `cdk-cicd: GITHUB_ACTIONS cannot use managed CodeBuild ci.image '${image}'; ` +
        'aws/codebuild/... is a CodeBuild image ID, not a pullable OCI job-container reference.',
    );
  }

  const registryHost = ciImageRegistryHost(image);
  if (isPrivateEcrRegistryHost(registryHost)) {
    throw new Error(
      `cdk-cicd: GITHUB_ACTIONS cannot use private ECR ci.image '${image}' because GitHub pulls the ` +
        'job container before the OIDC authentication step. GitHub container credentials do not ' +
        'implement the AWS ECR authorization-token exchange; use a public external image or a ' +
        'non-container runner.',
    );
  }

  if (credentials === undefined) return undefined;
  return {
    username: githubSecretExpression(credentials.usernameSecretName, 'usernameSecretName'),
    password: githubSecretExpression(credentials.passwordSecretName, 'passwordSecretName'),
  };
}

function githubSecretExpression(secretName: string, field: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(secretName) || /^GITHUB_/i.test(secretName)) {
    throw new Error(
      `cdk-cicd: githubActions.buildContainerCredentials.${field} '${secretName}' is not a valid GitHub ` +
        'secret name. Use letters, numbers, or underscores; do not start with a number or GITHUB_.',
    );
  }
  return `\${{ secrets.${secretName} }}`;
}

function buildWorkflowForPartition(pipeline: GitHubWorkflow, partition: string): void {
  const previousPartition = process.env.CDK_AWS_PARTITION;
  try {
    process.env.CDK_AWS_PARTITION = partition;
    pipeline.buildPipeline();
  } finally {
    if (previousPartition === undefined) {
      delete process.env.CDK_AWS_PARTITION;
    } else {
      process.env.CDK_AWS_PARTITION = previousPartition;
    }
  }
}

/**
 * The installed cdk-pipelines-github release scopes only the `sub` claim on its trust statement.
 * Add the audience condition directly to that generated Allow so an imported provider with additional
 * client IDs cannot use a non-STS audience to assume the workflow role.
 */
function hardenGitHubOidcAudience(gitHubActionRole: GitHubActionRole): void {
  const roleResource = gitHubActionRole.role.node.defaultChild;
  // cdk-pipelines-github can resolve a second aws-cdk-lib runtime. `instanceof iam.CfnRole` then
  // rejects its otherwise valid generated role; the CloudFormation capability we need is structural.
  if (roleResource === undefined || typeof (roleResource as iam.CfnRole).addPropertyOverride !== 'function') {
    throw new Error('cdk-cicd: could not locate the generated GitHub Actions IAM role trust policy.');
  }
  (roleResource as iam.CfnRole).addPropertyOverride(
    'AssumeRolePolicyDocument.Statement.0.Condition.StringEquals.token\\.actions\\.githubusercontent\\.com:aud',
    'sts.amazonaws.com',
  );
}

/** Fail closed until cdk-pipelines-github can forward caller-provided deploy-role ExternalIds. */
function assertNoDeployRoleExternalIds(config: ResolvedCicdConfig): void {
  const unsupportedStages = config.stages
    .filter((stage) => {
      const deployRole = stage.deployment?.deployRole?.trim();
      const externalId = (stage.deployment?.externalId ?? config.deployRoleExternalId)?.trim();
      return deployRole !== undefined && deployRole.length > 0 && externalId !== undefined && externalId.length > 0;
    })
    .map((stage) => stage.name);

  if (unsupportedStages.length > 0) {
    throw new Error(
      `cdk-cicd: GITHUB_ACTIONS cannot honor deploy-role ExternalIds for stage(s): ` +
        `${unsupportedStages.join(', ')}; the installed engine hardcodes a different ExternalId. ` +
        'Remove the ExternalId or use the CODEPIPELINE engine.',
    );
  }
}

/**
 * The installed cdk-pipelines-github credential provider derives a deployment role by replacing the
 * first literal `cfn-exec` in the manifest ARN with `deploy`. A custom role containing that text
 * would therefore be granted here but never assumed by the generated workflow.
 */
function assertStableGitHubDeployRoleArn(roleArn: string, stageName: string): void {
  const rolePathAndName = roleArn.match(/:role\/(.+)$/)?.[1];
  if (rolePathAndName?.includes('cfn-exec')) {
    throw new Error(
      `cdk-cicd: GITHUB_ACTIONS deployRole for stage '${stageName}' cannot contain literal ` +
        '`cfn-exec` in its role path or name: the installed cdk-pipelines-github release rewrites ' +
        'that text to `deploy` before assuming the role. Rename the role or use another engine.',
    );
  }
}

/**
 * A workflow can reference GitHub Environments but cannot configure their protection rules. Requiring
 * this acknowledgement prevents manualApproval from silently rendering an unprotected deployment job.
 */
function assertEnvironmentProtectionConfigured(config: ResolvedCicdConfig): void {
  const gatedStages = config.stages.filter((stage) => stage.manualApproval).map((stage) => stage.name);
  if (gatedStages.length > 0 && config.githubActions?.environmentProtectionConfigured !== true) {
    throw new Error(
      `cdk-cicd: GITHUB_ACTIONS stage(s) ${gatedStages.join(', ')} require manual approval, but GitHub ` +
        'environment protection is not acknowledged. Configure required reviewers on every generated ' +
        'GitHub Environment, then set githubActions.environmentProtectionConfigured: true.',
    );
  }
}

/** Secret read plus an exact CMK decrypt grant when the config identifies one. */
function secretReadStatements(secretArn: string, encryptionKeyArn?: string): iam.PolicyStatement[] {
  const statements = [new iam.PolicyStatement({ actions: ['secretsmanager:GetSecretValue'], resources: [secretArn] })];
  if (encryptionKeyArn !== undefined && encryptionKeyArn.trim().length > 0) {
    statements.push(new iam.PolicyStatement({ actions: ['kms:Decrypt'], resources: [encryptionKeyArn] }));
  }
  return statements;
}

/** The CodeArtifact read permissions a `codeartifact login` + `npm ci` need. */
function codeArtifactReadStatements(stack: Stack, codeArtifact: CodeArtifactConfig): iam.PolicyStatement[] {
  const account = codeArtifact.account ?? stack.account;
  const region = codeArtifact.region ?? stack.region;
  return [
    new iam.PolicyStatement({
      actions: ['codeartifact:GetAuthorizationToken'],
      resources: [`arn:${stack.partition}:codeartifact:${region}:${account}:domain/${codeArtifact.domain}`],
    }),
    new iam.PolicyStatement({
      actions: ['codeartifact:GetRepositoryEndpoint', 'codeartifact:ReadFromRepository'],
      resources: [
        `arn:${stack.partition}:codeartifact:${region}:${account}:repository/${codeArtifact.domain}/${codeArtifact.repository}`,
      ],
    }),
    new iam.PolicyStatement({
      actions: ['sts:GetServiceBearerToken'],
      resources: ['*'],
      conditions: { StringEquals: { 'sts:AWSServiceName': 'codeartifact.amazonaws.com' } },
    }),
  ];
}

/**
 * Resolve proxy credentials after OIDC authentication, mask them, and persist the effective proxy
 * environment for every later Build-Synth step through GitHub's environment file.
 */
function proxyInstallCommands(stack: Stack, proxy: ProxyConfig): string[] {
  const secretRegion = secretsManagerRegion(proxy.proxySecretArn);
  const noProxy =
    proxy.noProxy.length > 0 ? proxy.noProxy : [`${stack.region}.${RegionInfo.get(stack.region).domainSuffix!}`];
  return [
    `PROXY_SECRET_JSON="$(aws secretsmanager get-secret-value --secret-id ${shellQuote(proxy.proxySecretArn)}` +
      `${secretRegion !== undefined ? ` --region ${shellQuote(secretRegion)}` : ''} ` +
      '--query SecretString --output text)"',
    'if [ -z "$PROXY_SECRET_JSON" ] || [ "$PROXY_SECRET_JSON" = "None" ]; then echo "cdk-cicd: proxy secret is empty" >&2; exit 1; fi',
    'PROXY_USERNAME="$(printf \'%s\' "$PROXY_SECRET_JSON" | jq -er \'.username\')"',
    'PROXY_PASSWORD="$(printf \'%s\' "$PROXY_SECRET_JSON" | jq -er \'.password\')"',
    'HTTP_PROXY_PORT="$(printf \'%s\' "$PROXY_SECRET_JSON" | jq -er \'.http_proxy_port\')"',
    'HTTPS_PROXY_PORT="$(printf \'%s\' "$PROXY_SECRET_JSON" | jq -er \'.https_proxy_port\')"',
    'PROXY_DOMAIN="$(printf \'%s\' "$PROXY_SECRET_JSON" | jq -er \'.proxy_domain\')"',
    'unset PROXY_SECRET_JSON',
    'echo "::add-mask::$PROXY_USERNAME"',
    'echo "::add-mask::$PROXY_PASSWORD"',
    'export HTTP_PROXY="http://$PROXY_USERNAME:$PROXY_PASSWORD@$PROXY_DOMAIN:$HTTP_PROXY_PORT"',
    'export HTTPS_PROXY="https://$PROXY_USERNAME:$PROXY_PASSWORD@$PROXY_DOMAIN:$HTTPS_PROXY_PORT"',
    `export NO_PROXY=${shellQuote(noProxy.join(','))}`,
    'export AWS_STS_REGIONAL_ENDPOINTS=regional',
    'echo "HTTP_PROXY=$HTTP_PROXY" >> "$GITHUB_ENV"',
    'echo "HTTPS_PROXY=$HTTPS_PROXY" >> "$GITHUB_ENV"',
    'echo "NO_PROXY=$NO_PROXY" >> "$GITHUB_ENV"',
    'echo "AWS_STS_REGIONAL_ENDPOINTS=$AWS_STS_REGIONAL_ENDPOINTS" >> "$GITHUB_ENV"',
    'echo "--- Proxy Test ---"',
    `curl -Is --connect-timeout 5 ${proxy.proxyTestUrl} | grep "HTTP/"`,
  ];
}

/**
 * Resolve a generic npm-registry token only after the Synth job has assumed its OIDC role, mask it
 * before any later command can log it, and persist it solely in the runner's temporary npm config.
 */
function npmRegistryLoginCommands(npm: NpmRegistryConfig): string[] {
  const host = npm.url.replace(/^https?:\/\//, '');
  const scope = npm.scope !== undefined && npm.scope.length > 0 ? npm.scope : undefined;
  const scopePrefix = scope !== undefined ? `${scope.startsWith('@') ? scope : `@${scope}`}:` : '';
  const secretRegion = secretsManagerRegion(npm.basicAuthSecretArn);
  return [
    `NPM_AUTH_TOKEN="$(aws secretsmanager get-secret-value --secret-id ${shellQuote(npm.basicAuthSecretArn)}` +
      `${secretRegion !== undefined ? ` --region ${shellQuote(secretRegion)}` : ''} ` +
      '--query SecretString --output text)"',
    'if [ -z "$NPM_AUTH_TOKEN" ] || [ "$NPM_AUTH_TOKEN" = "None" ]; then echo "cdk-cicd: npm registry secret is empty" >&2; exit 1; fi',
    'echo "::add-mask::$NPM_AUTH_TOKEN"',
    `echo "${scopePrefix}registry=${npm.url}" > "$NPM_CONFIG_USERCONFIG"`,
    `echo "//${host}:_authToken=$NPM_AUTH_TOKEN" >> "$NPM_CONFIG_USERCONFIG"`,
    'unset NPM_AUTH_TOKEN',
  ];
}

/** Configure npm to use an owner-only credential file outside the checked-out source workspace. */
function npmConfigSetupCommands(): string[] {
  return [
    'export NPM_CONFIG_USERCONFIG="$RUNNER_TEMP/cdk-cicd-npmrc"',
    'rm -f "$NPM_CONFIG_USERCONFIG"',
    'umask 077 && touch "$NPM_CONFIG_USERCONFIG"',
    'echo "NPM_CONFIG_USERCONFIG=$NPM_CONFIG_USERCONFIG" >> "$GITHUB_ENV"',
  ];
}

/** Safe even if an earlier login command failed before exporting the path. */
function npmConfigCleanupCommand(): string {
  return 'if [ -n "${NPM_CONFIG_USERCONFIG:-}" ]; then rm -f "$NPM_CONFIG_USERCONFIG"; fi';
}

/** Use the secret ARN's region instead of assuming it matches the workflow's OIDC-auth region. */
function secretsManagerRegion(secretArn: string): string | undefined {
  const parts = secretArn.split(':');
  return parts.length > 5 && parts[0] === 'arn' && parts[2] === 'secretsmanager' ? parts[3] : undefined;
}

/** Quote a literal for the POSIX shell emitted into the workflow. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}
