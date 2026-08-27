// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The Blueprint-compatible CD engine: builds the pipeline with **CDK Pipelines** (`aws-cdk-lib/pipelines`), the
// same construct Blueprint's PipelineBlueprint used. It produces a pipeline that looks like Blueprint's -- a self-
// mutating CodePipeline with a Synth step, an Assets stage, and one wave per deployment stage (with
// optional pre-approval) -- so a team migrating from Blueprint gets a familiar shape.
//
// It sits ALONGSIDE the flat CodePipelineEngine (raw aws-codepipeline), not instead of it: the flat
// engine is the lightweight default; this one is the opt-in for Blueprint parity. Because CDK Pipelines needs
// the application's stacks IN the pipeline's own synth (it wraps them as `cdk.Stage`s and self-mutates),
// this engine cannot be zero-touch like the flat one -- the caller supplies a `stages` factory that
// builds the app's stacks for a given stage, exactly as Blueprint's `.addStack(...)` did. So it is used from an
// explicit `bin/` (the documented opt-in path), not the `deploy-ci` zero-touch flow.

import { Arn, ArnFormat, AspectPriority, Aspects, Environment, Stack, Stage } from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { Repository, RepositorySourceType } from '../../config/repository';
import { CodeArtifactConfig, PipelineRoleNames, ProxyConfig, ResolvedCicdConfig } from '../../config/types';
import { AccessLogsForBucketAspect } from '../../support/AccessLogsForBucketAspect';
import { SupportResources } from '../../support/SupportResources';
import { resolveVpcNetworking } from '../../support/Vpc';

/** Context passed to the stage factory for one deployment stage. */
export interface CdkPipelinesStageContext {
  /** The stage name from the config (e.g. `DEVFRA`). */
  readonly stageName: string;
  /** The stage's target environment (account + primary region). */
  readonly env: Environment;
}

/**
 * Builds the application's stacks for one deployment stage into the given `cdk.Stage`. This is the Blueprint
 * `IStackProvider` equivalent: CDK Pipelines deploys whatever stacks the provider adds to the stage. A
 * behavioural interface (not a bare function) so it crosses the jsii boundary like Blueprint's providers did.
 */
export interface IStageProvider {
  /** Add the app's stacks for `context.stageName` into `stage`. */
  stacks(stage: Stage, context: CdkPipelinesStageContext): void;
}

/** Props for the CDK Pipelines (Blueprint-compatible) engine. */
export interface CdkPipelinesEngineProps {
  /** The resolved pipeline configuration (`defineCICD`). */
  readonly config: ResolvedCicdConfig;
  /** Builds the app's stacks per stage (the Blueprint-compat opt-in — CDK Pipelines needs the stacks in-synth). */
  readonly stages: IStageProvider;
  /** Pipeline name; defaults to `<application>-pipeline`. */
  readonly pipelineName?: string;
}

/** Map a resolved `Repository` to the CDK Pipelines source the Synth step reads from. */
function sourceFor(scope: Construct, repository: Repository): pipelines.CodePipelineSource {
  switch (repository.repositoryType) {
    case RepositorySourceType.CODECOMMIT:
      return pipelines.CodePipelineSource.codeCommit(
        codecommit.Repository.fromRepositoryName(scope, 'SourceRepo', repository.name),
        repository.branch,
      );
    case RepositorySourceType.GITHUB:
    case RepositorySourceType.CODESTAR_CONNECTION:
      // Both need a CodeStar (CodeConnections) connection ARN to read the git provider.
      if (repository.connectionArn === undefined) {
        throw new Error(
          `cdk-cicd: a CodeStar connection ARN is required for a ${repository.repositoryType} source -- ` +
            'use Repository.codestarConnection(name, connectionArn)',
        );
      }
      return pipelines.CodePipelineSource.connection(repository.name, repository.branch, {
        connectionArn: repository.connectionArn,
      });
    case RepositorySourceType.S3: {
      // `name` is `bucket/key`; a bucket-only name defaults the key to source.zip (matches the flat engine).
      const slash = repository.name.indexOf('/');
      const bucketName = slash >= 0 ? repository.name.slice(0, slash) : repository.name;
      const objectKey = slash >= 0 ? repository.name.slice(slash + 1) : 'source.zip';
      return pipelines.CodePipelineSource.s3(s3.Bucket.fromBucketName(scope, 'SourceBucket', bucketName), objectKey);
    }
    default:
      throw new Error(
        `cdk-cicd: unsupported repository type for the CDK Pipelines engine: ${repository.repositoryType}`,
      );
  }
}

/**
 * A CDK Pipelines pipeline rendered from an Autopilot config + a stage factory. Reproduces the Blueprint shape:
 * Source -> Synth (self-mutating) -> Assets -> one wave per stage (with a pre-approval when the stage is
 * gated). Cross-account keys are on (Blueprint default) so multi-account stages work.
 */
export class CdkPipelinesEngine extends Construct {
  public readonly pipeline: pipelines.CodePipeline;

  constructor(scope: Construct, id: string, props: CdkPipelinesEngineProps) {
    super(scope, id);
    const config = props.config;
    const name = props.pipelineName ?? `${config.application ?? 'cdk-cicd'}-pipeline`;
    const region = Stack.of(this).region;

    // The Synth step: install (proxy exports, then CodeArtifact login for private/pre-release deps)
    // then `cdk synth`, which re-runs the caller's bin -- the same app that built this pipeline -- so
    // self-mutation works. The proxy's exports run FIRST: NO_PROXY is what lets the AWS-API-bound
    // `codeartifact login` skip the proxy while `npm ci` against public npm goes through it.
    const installCommands = [
      ...(config.proxy ? proxyInstallCommands(config.proxy) : []),
      ...(config.codeArtifact
        ? [
            `aws codeartifact login --tool npm --domain ${config.codeArtifact.domain} ` +
              `--domain-owner ${config.codeArtifact.account ?? Stack.of(this).account} ` +
              `--repository ${config.codeArtifact.repository} --region ${config.codeArtifact.region ?? region}` +
              (config.codeArtifact.npmScope ? ` --namespace ${config.codeArtifact.npmScope}` : ''),
          ]
        : []),
    ];
    const ciSteps = Object.values(config.ci.steps);
    // Blueprint `VPCProvider`, applied by CDK Pipelines itself to EVERY CodeBuild project it creates (synth,
    // self-mutation, asset publishing) -- the uniform application Blueprint had.
    const vpcNetworking = resolveVpcNetworking(this, config.vpc, config.proxy !== undefined);

    this.pipeline = new pipelines.CodePipeline(this, 'Pipeline', {
      pipelineName: name,
      crossAccountKeys: true,
      enableKeyRotation: true,
      // Blueprint `codeBuildEnvSettings` (privileged mode, compute type, environment variables --
      // `CodeBuildFactoryProvider` parity) + `vpc` above, both applied by CDK Pipelines itself to EVERY
      // CodeBuild project it creates (synth, self-mutation, asset publishing) -- the uniform application
      // Blueprint had.
      codeBuildDefaults:
        config.codeBuildEnvSettings !== undefined || vpcNetworking !== undefined
          ? {
              buildEnvironment: config.codeBuildEnvSettings,
              vpc: vpcNetworking?.vpc,
              securityGroups: vpcNetworking?.securityGroups,
              subnetSelection: vpcNetworking?.subnetSelection,
            }
          : undefined,
      synth: new pipelines.CodeBuildStep('Synth', {
        input: sourceFor(this, config.repository),
        installCommands,
        // Run the default CI check, any configured extra steps, then synth the app.
        commands: ['npm ci', 'npx cdk-cicd check', ...ciSteps, 'npx cdk synth'],
        env: {
          ...(config.qualifier ? { CDK_QUALIFIER: config.qualifier } : {}),
          AWS_REGION: region,
          ...(config.proxy ? proxyEnvVariables(Stack.of(this), config.proxy) : {}),
        },
        // The proxy credentials/ports live in Secrets Manager, not in plain env vars.
        partialBuildSpec: config.proxy
          ? codebuild.BuildSpec.fromObject({ env: { 'secrets-manager': proxySecretsManagerVars(config.proxy) } })
          : undefined,
        // Grant the synth build the CodeArtifact/proxy-secret read permissions its
        // `codeartifact login`/`export`s need (the CodeBuildStep role has only logs/artifacts by
        // default) -- else they fail AccessDenied.
        rolePolicyStatements: [
          ...(config.codeArtifact ? codeArtifactReadStatements(Stack.of(this), config.codeArtifact) : []),
          ...(config.proxy ? proxySecretReadStatements(Stack.of(this), config.proxy) : []),
        ],
      }),
    });

    // One wave per (stage x region), in config order, wrapping the app stacks the provider builds. A gated
    // stage gets a manual-approval step ahead of its FIRST region -- the fail-closed promotion gate Blueprint had.
    // A multi-region stage becomes one wave per region (Blueprint deployed each region), not a single dropped one.
    for (const stage of config.stages) {
      const regions = stage.env.regions.length > 0 ? stage.env.regions : [region];
      regions.forEach((stageRegion, i) => {
        const env: Environment = { account: stage.env.account, region: stageRegion };
        const stageId = regions.length > 1 ? `${stage.name}-${stageRegion}` : stage.name;
        const appStage = new Stage(this, stageId, { env });
        props.stages.stacks(appStage, { stageName: stage.name, env });
        this.pipeline.addStage(appStage, {
          pre:
            stage.manualApproval && i === 0 ? [new pipelines.ManualApprovalStep(`Approve-${stage.name}`)] : undefined,
        });
      });
    }

    // Force the pipeline's construction now (CDK Pipelines builds it lazily at synth) so its generated
    // roles/buckets exist to annotate below, before the AwsSolutionsChecks aspect visits at synth time.
    this.pipeline.buildPipeline();
    this.suppressGeneratedPipelineNag();

    // Parity with Blueprint's PipelineRoleNameEnforcementPlugin: force deterministic RoleNames on the
    // pipeline's own roles so external cross-account trust policies / SCPs / permission boundaries that
    // reference fixed names keep working. The assembler owns the pipeline stack, so this must live here --
    // a consumer's replayed bin has no handle on these roles. Omitted names keep CDK's generated value.
    if (config.pipelineRoleNames !== undefined) {
      this.enforceRoleNames(config.pipelineRoleNames);
    }

    // Compliance/access-log bucket, at parity with the flat CodePipelineEngine: provision it when a name
    // is configured, and attach the per-region name-substituting access-logs aspect so secondary-region
    // stacks log to the region-substituted bucket name (Blueprint's AccessLogsForBucketPlugin behavior).
    if (config.complianceLogBucketName !== undefined) {
      const support = new SupportResources(this, 'Support', {
        complianceLogBucketName: config.complianceLogBucketName,
      });
      // Force-read the lazy getter so the bucket is provisioned by merely configuring the name (Blueprint's
      // ComplianceBucketProvider was default-on, not behind a separate opt-in).
      void support.complianceLogBucket;
      // MUTATING priority so the aspect sets each bucket's L1 loggingConfiguration BEFORE the readonly
      // AwsSolutionsChecks (added in pipeline-assembler) visits -- otherwise AwsSolutions-S1 false-fails
      // because nag sees the bucket before the logging config is applied. No S1 suppression is added.
      Aspects.of(this).add(
        new AccessLogsForBucketAspect({
          complianceLogBucketName: config.complianceLogBucketName,
          mainRegion: region,
        }),
        { priority: AspectPriority.MUTATING },
      );
    }
  }

  /**
   * Force `RoleName` on the pipeline's own IAM roles (Blueprint `PipelineRoleNameEnforcementPlugin`
   * parity). Matches on `iam.CfnRole` under this engine's construct scope rather than a hard-coded leaf
   * id: the CodePipeline role is the pipeline construct's own role, and the file/docker asset-publishing
   * roles live under the CDK Pipelines-generated `Assets` scope. The asset roles are distinguished by
   * their node path segment (`FileRole` / `DockerRole`), which is stable across the aws-cdk-lib/pipelines
   * versions the wrapper supports; run against the real synthesized tree in tests to pin them.
   */
  private enforceRoleNames(names: PipelineRoleNames): void {
    const setRoleName = (role: iam.CfnRole | undefined, roleName?: string): void => {
      if (role !== undefined && roleName !== undefined && roleName.length > 0) {
        role.roleName = roleName;
      }
    };

    // The CodePipeline pipeline role: the role directly on the underlying Pipeline construct.
    const pipelineRole = this.pipeline.pipeline.role.node.defaultChild as iam.CfnRole | undefined;
    setRoleName(pipelineRole, names.pipeline);

    // The asset-publishing roles: CfnRoles whose node path carries the CDK Pipelines asset-role segment.
    for (const cfnRole of this.node.findAll().filter((c): c is iam.CfnRole => c instanceof iam.CfnRole)) {
      const path = cfnRole.node.path;
      if (/FileRole/.test(path)) {
        setRoleName(cfnRole, names.assetsFile);
      } else if (/DockerRole/.test(path)) {
        setRoleName(cfnRole, names.assetsDocker);
      }
    }
  }

  /**
   * Suppress the cdk-nag findings on the infrastructure **CDK Pipelines generates for itself** -- the
   * pipeline/synth/self-mutation/assets roles' unavoidable wildcards and the internal artifact and
   * cross-region replication buckets. This engine runs `AwsSolutionsChecks` (as Blueprint did) so the
   * user's app stacks are still judged on their own merits; only the wrapper-owned pipeline plumbing is
   * exempted here, with evidence, mirroring Blueprint's `CDKPipeline` suppressions.
   */
  private suppressGeneratedPipelineNag(): void {
    // The pipeline construct is entirely wrapper-generated plumbing; its roles read/write the pipeline's
    // own KMS-encrypted artifact bucket and source object, actions CDK issues with wildcards it cannot
    // resource-scope. The app stages are siblings under this engine (not under `pipeline`), so this stays
    // off them.
    NagSuppressions.addResourceSuppressions(
      this.pipeline,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            "CDK Pipelines' own pipeline/synth/self-mutation/assets roles: S3 multipart + KMS envelope grants on the pipeline's own artifact store and the CDK bootstrap-role assumes it needs to deploy -- wildcards CDK generates for its plumbing, scoped to the pipeline's own resources. Includes the wrapper's own condition-scoped sts:GetServiceBearerToken on the synth role (the CodeArtifact token endpoint is not resource-scopable), and, when a VPC is configured, the CodeBuild-managed network-interface permissions CDK adds to every VPC-attached project's role.",
        },
      ],
      true,
    );

    const pipeline = this.pipeline.pipeline;
    // The internal artifact store: transient build outputs, already KMS-encrypted/SSL-enforced/public-access
    // blocked. Access logging would provision a second bucket just to record the pipeline's own reads.
    NagSuppressions.addResourceSuppressions(pipeline.artifactBucket, [
      {
        id: 'AwsSolutions-S1',
        reason: "The pipeline's internal artifact store, not a data bucket; already KMS-encrypted and non-public.",
      },
    ]);

    // A stage in a region other than the pipeline's gets a CDK-generated cross-region *support stack* (a
    // separate stack) holding a replication bucket + its KMS key. Suppress the same S1/IAM5 there.
    for (const support of Object.values(pipeline.crossRegionSupport)) {
      NagSuppressions.addResourceSuppressions(support.replicationBucket, [
        {
          id: 'AwsSolutions-S1',
          reason:
            "CDK Pipelines' cross-region artifact replication bucket; internal store, KMS-encrypted and non-public.",
        },
      ]);
      NagSuppressions.addStackSuppressions(support.stack, [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            "CDK-generated KMS key policy for the cross-region replication bucket; wildcards are on the pipeline's own key.",
        },
      ]);
    }
  }
}

/** The CodeArtifact read permissions a `codeartifact login` + `npm ci` need (mirrors the flat engine). */
function codeArtifactReadStatements(stack: Stack, ca: CodeArtifactConfig): iam.PolicyStatement[] {
  const account = ca.account ?? stack.account;
  const region = ca.region ?? stack.region;
  return [
    new iam.PolicyStatement({
      actions: ['codeartifact:GetAuthorizationToken'],
      resources: [`arn:${stack.partition}:codeartifact:${region}:${account}:domain/${ca.domain}`],
    }),
    new iam.PolicyStatement({
      actions: ['codeartifact:GetRepositoryEndpoint', 'codeartifact:ReadFromRepository'],
      resources: [`arn:${stack.partition}:codeartifact:${region}:${account}:repository/${ca.domain}/${ca.repository}`],
    }),
    // The npm token is minted through STS on CodeArtifact's behalf; scoped to that service, not blanket.
    new iam.PolicyStatement({
      actions: ['sts:GetServiceBearerToken'],
      resources: ['*'],
      conditions: { StringEquals: { 'sts:AWSServiceName': 'codeartifact.amazonaws.com' } },
    }),
  ];
}

/**
 * Plain (non-secret) proxy env vars the Synth step needs (mirrors the flat engine). An empty
 * `noProxy` defaults to the pipeline's own region's AWS endpoint, so AWS API calls (like
 * `codeartifact login`) bypass the proxy while `npm ci` against public npm goes through it.
 */
function proxyEnvVariables(stack: Stack, proxy: ProxyConfig): Record<string, string> {
  const noProxy = proxy.noProxy.length > 0 ? proxy.noProxy : [`${stack.region}.amazonaws.com`];
  return {
    AWS_STS_REGIONAL_ENDPOINTS: 'regional',
    NO_PROXY: noProxy.join(','),
    PROXY_SECRET_ARN: proxy.proxySecretArn,
  };
}

/** The secret's fields, referenced by `<arn>:<jsonKey>` so CodeBuild resolves them at container start. */
function proxySecretsManagerVars(proxy: ProxyConfig): Record<string, string> {
  return {
    PROXY_USERNAME: `${proxy.proxySecretArn}:username`,
    PROXY_PASSWORD: `${proxy.proxySecretArn}:password`,
    HTTP_PROXY_PORT: `${proxy.proxySecretArn}:http_proxy_port`,
    HTTPS_PROXY_PORT: `${proxy.proxySecretArn}:https_proxy_port`,
    PROXY_DOMAIN: `${proxy.proxySecretArn}:proxy_domain`,
  };
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

/** The read grant the proxy secret needs, plus cross-account KMS decrypt when the secret lives elsewhere. */
function proxySecretReadStatements(stack: Stack, proxy: ProxyConfig): iam.PolicyStatement[] {
  const secretArn = Arn.split(proxy.proxySecretArn, ArnFormat.SLASH_RESOURCE_NAME);
  const statements = [
    new iam.PolicyStatement({ actions: ['secretsmanager:GetSecretValue'], resources: [proxy.proxySecretArn] }),
  ];
  if (secretArn.account !== undefined && secretArn.account !== stack.account) {
    statements.push(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt', 'kms:DescribeKey', 'kms:Encrypt', 'kms:GenerateDataKey*', 'kms:ReEncrypt*'],
        resources: [`arn:${stack.partition}:kms:${secretArn.region}:${secretArn.account}:key/*`],
      }),
    );
  }
  return statements;
}

// NOTE: the old `cdkPipelinesApp(config, factory)` explicit-factory entry has been RETIRED. The single
// entry is now `cdk-cicd exec bin/app.ts` for both engines (engine chosen in cicd.config): for
// CDK_PIPELINES it replays the plain bin per stage via runtime/pipeline-assembler, so no factory or
// pipeline-specific bin is needed. `CdkPipelinesEngine` (above) remains the construct that renders the
// pipeline; the assembler drives it with a replay-based IStageProvider.
