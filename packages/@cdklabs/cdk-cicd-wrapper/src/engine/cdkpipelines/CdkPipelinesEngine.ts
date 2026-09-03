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

import { AspectPriority, Aspects, Environment, Stack, Stage, Token } from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { RegionInfo } from 'aws-cdk-lib/region-info';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import {
  assertValidCiImageReference,
  ciImageRegistryHost,
  isPrivateEcrRegistryHost,
  isPublicEcrRegistryHost,
} from '../../config/build-image';
import { resolveDefaultSynthesizerQualifier } from '../../config/default-synthesizer-role-arn';
import { Repository, RepositorySourceType } from '../../config/repository';
import {
  CodeArtifactConfig,
  CodeBuildImageCredentials,
  NpmRegistryConfig,
  PipelineRoleNames,
  ProxyConfig,
  RegionOrder,
  ResolvedCicdConfig,
  SynthesizerType,
} from '../../config/types';
import { AccessLogsForBucketAspect } from '../../support/AccessLogsForBucketAspect';
import { SupportResources } from '../../support/SupportResources';
import { resolveVpcNetworking } from '../../support/Vpc';
import { defaultCiCommands } from '../ci-commands';
import { resolveCodeCommitRepository } from '../codepipeline/source';

const PRIVATE_NPM_CONFIG_PATH = '/tmp/cdk-cicd-npmrc';

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
      return pipelines.CodePipelineSource.codeCommit(resolveCodeCommitRepository(scope, repository), repository.branch);
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

/** Fail closed until the installed CDK Pipelines deployment path can forward deploy-role ExternalIds. */
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
      `cdk-cicd: CDK_PIPELINES cannot honor deploy-role ExternalIds for stage(s): ` +
        `${unsupportedStages.join(', ')}. Remove the ExternalId or use the CODEPIPELINE engine.`,
    );
  }
}

/** The installed alpha synthesizer explicitly excludes CDK Pipelines and replay would cross Stage boundaries. */
function assertSupportedSynthesizer(config: ResolvedCicdConfig): void {
  if ((config.synthesizer?.type ?? SynthesizerType.DEFAULT) === SynthesizerType.APP_STAGING) {
    throw new Error(
      'cdk-cicd: CDK_PIPELINES cannot use SynthesizerType.APP_STAGING: the installed ' +
        '@aws-cdk/app-staging-synthesizer-alpha does not support CDK Pipelines, and Stage replay would ' +
        'create an invalid cross-Stage dependency on DefaultStagingStack. Use SynthesizerType.DEFAULT ' +
        'for generated pipelines; APP_STAGING remains available for direct local CDK deployment.',
    );
  }
}

/**
 * CDK Pipelines can deploy across accounts and Regions, but a single pipeline cannot cross AWS
 * partitions. Resolve every participating Region through the installed RegionInfo table so unknown
 * or mixed partitions fail before placeholder ARNs are stamped with the pipeline partition.
 */
function assertSingleKnownPartition(stack: Stack, config: ResolvedCicdConfig, engine: string): string {
  const pipelinePartition = partitionForRegion(stack.region, `${engine} pipeline`);

  for (const stage of config.stages) {
    const regions = stage.env.regions.length > 0 ? stage.env.regions : [stack.region];
    for (const region of regions) {
      const targetPartition = partitionForRegion(region, `${engine} stage '${stage.name}'`);
      if (targetPartition !== pipelinePartition) {
        throw new Error(
          `cdk-cicd: ${engine} cannot mix AWS partitions: pipeline region '${stack.region}' is in ` +
            `'${pipelinePartition}', but stage '${stage.name}' region '${region}' is in '${targetPartition}'.`,
        );
      }
    }
  }

  if (config.codeArtifact?.region !== undefined) {
    const codeArtifactPartition = partitionForRegion(config.codeArtifact.region, `${engine} CodeArtifact`);
    if (codeArtifactPartition !== pipelinePartition) {
      throw new Error(
        `cdk-cicd: ${engine} cannot use CodeArtifact region '${config.codeArtifact.region}' in partition ` +
          `'${codeArtifactPartition}' from pipeline partition '${pipelinePartition}'.`,
      );
    }
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
 * This engine provisions one destination bucket with the pipeline stack. Fail closed instead of
 * inventing per-Region bucket names: S3 server access logging requires each source and destination
 * bucket to be in the same account and Region.
 */
function assertSupportedComplianceLogging(stack: Stack, config: ResolvedCicdConfig): void {
  if (config.complianceLogBucketName === undefined) return;
  if (Token.isUnresolved(stack.account) || Token.isUnresolved(stack.region)) {
    throw new Error(
      'cdk-cicd: compliance logging requires a concrete pipeline stack account and region so the ' +
        'S3 same-account/same-region requirement can be verified.',
    );
  }

  for (const stage of config.stages) {
    const account = stage.env.account ?? stack.account;
    const regions = stage.env.regions.length > 0 ? stage.env.regions : [stack.region];
    if (
      Token.isUnresolved(account) ||
      account !== stack.account ||
      regions.some((stageRegion) => Token.isUnresolved(stageRegion) || stageRegion !== stack.region)
    ) {
      throw new Error(
        `cdk-cicd: compliance logging cannot target stage '${stage.name}' from the pipeline bucket ` +
          `'${config.complianceLogBucketName}' in ${stack.account}/${stack.region}. S3 server access-log ` +
          'source and destination buckets must be in the same account and region; configure only ' +
          'co-located stages or omit complianceLogBucketName.',
      );
    }
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
    assertSupportedSynthesizer(config);
    assertNoDeployRoleExternalIds(config);
    const name = props.pipelineName ?? `${config.application ?? 'cdk-cicd'}-pipeline`;
    const stack = Stack.of(this);
    const region = stack.region;
    const partition = assertSingleKnownPartition(stack, config, 'CDK_PIPELINES');
    const privateNpm = config.npmRegistry !== undefined || config.codeArtifact !== undefined;
    assertSupportedComplianceLogging(stack, config);
    const complianceLogBucket =
      config.complianceLogBucketName !== undefined
        ? new SupportResources(this, 'Support', {
            complianceLogBucketName: config.complianceLogBucketName,
            createComplianceLogBucket: config.createComplianceLogBucket,
          }).complianceLogBucket
        : undefined;

    // The Synth step: install proxy/account-warming prerequisites, then configure private npm and run
    // CI plus `npm run cdk synth`, with `CDK_CICD_MODE=pipeline` on the step env (below) so
    // `cdk.json`'s single `cdk-cicd exec` entry renders THIS pipeline -- so CDK Pipelines self-mutation,
    // which reruns this step and redeploys the pipeline stack from the fresh assembly, still sees itself.
    // Without the mode set, that same entry synthesizes only the application stacks. The proxy's exports
    // run FIRST: NO_PROXY is what lets the AWS-API-bound `codeartifact login` skip the proxy while
    // `npm ci` against public npm goes through it.
    const installCommands = [
      ...(config.proxy ? proxyInstallCommands(config.proxy) : []),
      ...(config.warmAccountsFromSsm ? ssmWarmingCommands(config.qualifier) : []),
    ];
    const privateNpmCommands = [
      ...(privateNpm ? npmConfigSetupCommands() : []),
      ...(config.npmRegistry ? npmRegistryLoginCommands(config.npmRegistry) : []),
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
    const synthCommands = [
      ...privateNpmCommands,
      ...(ciSteps.length > 0 ? ciSteps : defaultCiCommands()),
      'npm run cdk synth',
    ];
    const synthPartialBuildSpec = mergeSynthPartialBuildSpec(
      config.ci.partialBuildSpec,
      config.proxy,
      config.npmRegistry,
      privateNpm,
    );
    if (config.ci.image === undefined && config.ci.codeBuildImageCredentials !== undefined) {
      throw new Error('cdk-cicd: ci.codeBuildImageCredentials requires ci.image.');
    }
    const synthBuildImage =
      config.ci.image !== undefined
        ? resolveSynthBuildImage(this, config.ci.image, partition, config.ci.codeBuildImageCredentials)
        : undefined;
    const lookupStatements = targetLookupStatements(stack, config, partition);
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
        // With no ci.steps, run the default CI (its own `npm ci` first); with ci.steps, those steps ARE
        // the build phase verbatim -- the engine injects nothing, not even `npm ci`. Then `npm run cdk
        // synth`, which runs `cdk.json`'s single `cdk-cicd exec` entry. `CDK_CICD_MODE=pipeline` (below)
        // makes that entry render THIS pipeline, so CDK Pipelines self-mutation re-renders itself; a plain
        // `cdk synth` without the mode set renders only the application stacks.
        commands: synthCommands,
        env: {
          // Render the pipeline (not the app stacks) from the single cdk.json entry during self-mutation.
          CDK_CICD_MODE: 'pipeline',
          ...(config.qualifier ? { CDK_QUALIFIER: config.qualifier } : {}),
          AWS_REGION: region,
          ...(privateNpm ? { NPM_CONFIG_USERCONFIG: PRIVATE_NPM_CONFIG_PATH } : {}),
          ...(config.proxy ? proxyEnvVariables(Stack.of(this), config.proxy) : {}),
        },
        // Only the Synth project receives ci.image. The pipeline-wide defaults continue to govern
        // self-mutation and asset-publishing projects.
        buildEnvironment: synthBuildImage !== undefined ? { buildImage: synthBuildImage } : undefined,
        // Proxy credentials/ports and the npm bearer token are resolved by CodeBuild at container
        // start. Merge them with the caller's CI partial buildspec instead of replacing either side.
        partialBuildSpec: synthPartialBuildSpec,
        // Grant the synth build the CodeArtifact/proxy-secret read permissions its
        // `codeartifact login`/`export`s need (the CodeBuildStep role has only logs/artifacts by
        // default) -- else they fail AccessDenied.
        rolePolicyStatements: [
          ...(config.codeArtifact ? codeArtifactReadStatements(Stack.of(this), config.codeArtifact) : []),
          ...(config.proxy ? proxySecretReadStatements(config.proxy) : []),
          ...(config.npmRegistry
            ? secretReadStatements(config.npmRegistry.basicAuthSecretArn, config.npmRegistry.encryptionKeyArn)
            : []),
          ...codeBuildImageCredentialKeyDecryptStatements(config.ci.codeBuildImageCredentials),
          ...(config.warmAccountsFromSsm ? ssmWarmingReadStatements(Stack.of(this), config.qualifier) : []),
          ...lookupStatements,
        ],
      }),
    });

    // Sequential multi-region stages retain one wave per region. Parallel stages put every regional
    // deployment in one wave so CDK Pipelines schedules them together. A gated stage is approved once,
    // before either the first sequential region or the shared parallel wave.
    for (const stage of config.stages) {
      const regions = stage.env.regions.length > 0 ? stage.env.regions : [region];
      const appStageFor = (stageRegion: string): Stage => {
        const env: Environment = {
          account:
            config.complianceLogBucketName !== undefined ? (stage.env.account ?? stack.account) : stage.env.account,
          region: stageRegion,
        };
        const stageId = regions.length > 1 ? `${stage.name}-${stageRegion}` : stage.name;
        const appStage = new Stage(this, stageId, { env });
        if (config.complianceLogBucketName !== undefined && complianceLogBucket !== undefined) {
          // CDK aspects do not cross Stage boundaries. Attach directly to every application Stage so
          // its stacks receive logging, while the engine-level aspect below handles pipeline resources.
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
        props.stages.stacks(appStage, { stageName: stage.name, env });
        return appStage;
      };

      if (stage.env.regionOrder === RegionOrder.PARALLEL && regions.length > 1) {
        const wave = this.pipeline.addWave(stage.name, {
          pre: stage.manualApproval ? [new pipelines.ManualApprovalStep(`Approve-${stage.name}`)] : undefined,
        });
        for (const stageRegion of regions) {
          wave.addStage(appStageFor(stageRegion));
        }
        continue;
      }

      regions.forEach((stageRegion, i) => {
        this.pipeline.addStage(appStageFor(stageRegion), {
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

    // Attach separately to pipeline resources. Application stacks sit below cdk.Stage boundaries and
    // receive their own aspect in appStageFor() above.
    if (config.complianceLogBucketName !== undefined && complianceLogBucket !== undefined) {
      // MUTATING priority so the aspect sets each source bucket's L1 loggingConfiguration BEFORE the
      // readonly AwsSolutionsChecks visits. The destination bucket alone carries the required S1
      // suppression because S3 server access logs must not be delivered back into the same bucket.
      Aspects.of(this).add(
        new AccessLogsForBucketAspect({
          complianceLogBucketName: config.complianceLogBucketName,
          complianceLogBucketAccount: stack.account,
          complianceLogBucketRegion: stack.region,
          complianceLogBucket,
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

interface ParsedEcrImage {
  readonly account: string;
  readonly region: string;
  readonly partition: string;
  readonly repositoryName: string;
  readonly tagOrDigest?: string;
}

/**
 * Resolve the string convenience config to the CDK image type CodeBuild expects:
 * managed CodeBuild IDs use CODEBUILD credentials, private ECR images carry a repository object so
 * CDK grants the Synth role pull access, and all other registries are treated as anonymous/public
 * Docker registries, optionally with a Secrets Manager credential that CDK grants to the Synth role.
 */
function resolveSynthBuildImage(
  scope: Construct,
  image: string,
  pipelinePartition: string,
  credentials?: CodeBuildImageCredentials,
): codebuild.IBuildImage {
  assertValidCiImageReference(image);
  if (image.startsWith('aws/codebuild/')) {
    assertNoCodeBuildRegistryCredentials(image, credentials, 'managed CodeBuild');
    return codebuild.LinuxBuildImage.fromCodeBuildImageId(image);
  }

  if (isPublicEcrRegistryHost(ciImageRegistryHost(image))) {
    assertNoCodeBuildRegistryCredentials(image, credentials, 'public ECR');
  }

  const parsedEcr = parsePrivateEcrImage(image);
  if (parsedEcr !== undefined) {
    assertNoCodeBuildRegistryCredentials(image, credentials, 'private ECR');
    const stack = Stack.of(scope);
    if (Token.isUnresolved(stack.account) || Token.isUnresolved(stack.region)) {
      throw new Error(
        `cdk-cicd: private ECR ci.image '${image}' requires a concrete pipeline stack account and region.`,
      );
    }
    if (parsedEcr.partition !== pipelinePartition) {
      throw new Error(
        `cdk-cicd: private ECR ci.image '${image}' is in partition '${parsedEcr.partition}', but the ` +
          `pipeline is in '${pipelinePartition}'.`,
      );
    }
    if (parsedEcr.account !== stack.account || parsedEcr.region !== stack.region) {
      throw new Error(
        `cdk-cicd: private ECR ci.image '${image}' must be in the pipeline stack account and region ` +
          `(${stack.account}/${stack.region}); cross-account and cross-region CodeBuild images are not supported.`,
      );
    }
    const repository = ecr.Repository.fromRepositoryArn(
      scope,
      'CiImageRepository',
      `arn:${parsedEcr.partition}:ecr:${parsedEcr.region}:${parsedEcr.account}:repository/${parsedEcr.repositoryName}`,
    );
    return codebuild.LinuxBuildImage.fromEcrRepository(repository, parsedEcr.tagOrDigest);
  }

  const secret =
    credentials !== undefined
      ? importCodeBuildRegistrySecret(scope, 'CiImageRegistryCredentials', credentials)
      : undefined;
  return codebuild.LinuxBuildImage.fromDockerRegistry(
    image,
    secret !== undefined ? { secretsManagerCredentials: secret } : undefined,
  );
}

function parsePrivateEcrImage(image: string): ParsedEcrImage | undefined {
  const firstSlash = image.indexOf('/');
  if (firstSlash < 1) return undefined;
  const normalizedRegistryHost = ciImageRegistryHost(image)!;
  const repositoryAndVersion = image.slice(firstSlash + 1);
  if (!isPrivateEcrRegistryHost(normalizedRegistryHost)) return undefined;

  if (/^\d{12}\.dkr(?:\.ecr-fips|-ecr-fips)\./.test(normalizedRegistryHost)) {
    throw new Error(
      `cdk-cicd: private ECR ci.image '${image}' uses a FIPS registry endpoint. The installed ` +
        'aws-cdk-lib CodeBuild image binding accepts an ECR repository and renders its canonical registry ' +
        'URI, so it cannot preserve a requested FIPS endpoint.',
    );
  }
  if (/^\d{12}\.dkr-ecr\.[a-z0-9-]+\.on\.aws$/.test(normalizedRegistryHost)) {
    throw new Error(
      `cdk-cicd: private ECR ci.image '${image}' uses a dual-stack registry endpoint. The installed ` +
        'aws-cdk-lib CodeBuild image binding renders the canonical dkr.ecr endpoint, and the installed ' +
        'CodeBuild contract does not expose a dual-stack build-image option.',
    );
  }

  const match = normalizedRegistryHost.match(/^(\d{12})\.dkr\.ecr\.([a-z0-9-]+)\.(.+)$/);
  if (match === null) {
    throw new Error(
      `cdk-cicd: private ECR ci.image '${image}' does not use a supported canonical registry endpoint ` +
        "('<account>.dkr.ecr.<region>.<AWS domain suffix>').",
    );
  }

  const [, account, region, registrySuffix] = match;
  const regionInfo = RegionInfo.get(region);
  const expectedSuffix = regionInfo.domainSuffix;
  const partition = regionInfo.partition;
  if (expectedSuffix === undefined || partition === undefined) {
    throw new Error(
      `cdk-cicd: private ECR ci.image '${image}' uses region '${region}', whose partition/domain ` +
        'suffix is not known to this aws-cdk-lib version. Upgrade the wrapper/CDK before using this image.',
    );
  }
  if (registrySuffix !== expectedSuffix) {
    throw new Error(
      `cdk-cicd: private ECR ci.image '${image}' has registry suffix '${registrySuffix}', but region ` +
        `'${region}' belongs to partition '${partition}' and requires '${expectedSuffix}'.`,
    );
  }
  if (repositoryAndVersion.length === 0) {
    throw new Error(`cdk-cicd: private ECR ci.image '${image}' is missing a repository name.`);
  }

  const digestSeparator = repositoryAndVersion.indexOf('@');
  if (digestSeparator >= 0) {
    const repositoryName = repositoryAndVersion.slice(0, digestSeparator);
    const tagOrDigest = repositoryAndVersion.slice(digestSeparator + 1);
    if (repositoryName.length === 0 || !/^sha256:[0-9a-fA-F]{64}$/.test(tagOrDigest)) {
      throw new Error(`cdk-cicd: private ECR ci.image '${image}' must use a non-empty repository and a sha256 digest.`);
    }
    return {
      account,
      region,
      partition,
      repositoryName,
      tagOrDigest,
    };
  }

  const tagSeparator = repositoryAndVersion.lastIndexOf(':');
  const finalSlash = repositoryAndVersion.lastIndexOf('/');
  if (tagSeparator > finalSlash) {
    const repositoryName = repositoryAndVersion.slice(0, tagSeparator);
    const tagOrDigest = repositoryAndVersion.slice(tagSeparator + 1);
    if (repositoryName.length === 0 || tagOrDigest.length === 0) {
      throw new Error(`cdk-cicd: private ECR ci.image '${image}' has an empty repository name or tag.`);
    }
    return {
      account,
      region,
      partition,
      repositoryName,
      tagOrDigest,
    };
  }

  return { account, region, partition, repositoryName: repositoryAndVersion };
}

function assertNoCodeBuildRegistryCredentials(
  image: string,
  credentials: CodeBuildImageCredentials | undefined,
  imageKind: string,
): void {
  if (credentials === undefined) return;
  throw new Error(
    `cdk-cicd: ci.codeBuildImageCredentials cannot be used with ${imageKind} ci.image '${image}'; ` +
      'only authenticated external registries use Secrets Manager registry credentials.',
  );
}

function importCodeBuildRegistrySecret(
  scope: Construct,
  id: string,
  credentials: CodeBuildImageCredentials,
): secretsmanager.ISecret {
  if (credentials.secretArn.trim().length === 0) {
    throw new Error('cdk-cicd: ci.codeBuildImageCredentials.secretArn must not be empty.');
  }
  if (credentials.encryptionKeyArn !== undefined && credentials.encryptionKeyArn.trim().length === 0) {
    throw new Error('cdk-cicd: ci.codeBuildImageCredentials.encryptionKeyArn must not be empty.');
  }
  const encryptionKey =
    credentials.encryptionKeyArn !== undefined
      ? kms.Key.fromKeyArn(scope, `${id}EncryptionKey`, credentials.encryptionKeyArn)
      : undefined;
  return secretsmanager.Secret.fromSecretAttributes(scope, id, {
    secretCompleteArn: credentials.secretArn,
    ...(encryptionKey !== undefined ? { encryptionKey } : {}),
  });
}

/**
 * `fromDockerRegistry` grants the imported secret read. aws-cdk-lib 2.195.0 cannot add the
 * `ViaServicePrincipal` statement to an imported CMK's resource policy, so place the exact decrypt
 * grant on the generated Synth role through `CodeBuildStep.rolePolicyStatements`.
 */
function codeBuildImageCredentialKeyDecryptStatements(
  credentials: CodeBuildImageCredentials | undefined,
): iam.PolicyStatement[] {
  return credentials?.encryptionKeyArn !== undefined
    ? [new iam.PolicyStatement({ actions: ['kms:Decrypt'], resources: [credentials.encryptionKeyArn] })]
    : [];
}

/**
 * Let Synth resolve uncached CDK context in every target environment. The lookup role performs the
 * actual read; the bootstrap version parameter is also listed explicitly to match the CLI's bootstrap
 * validation contract.
 */
export function targetLookupStatements(
  stack: Stack,
  config: ResolvedCicdConfig,
  validatedPartition?: string,
): iam.PolicyStatement[] {
  const partition = validatedPartition ?? assertSingleKnownPartition(stack, config, 'self-mutating pipeline');
  const qualifier = resolveDefaultSynthesizerQualifier(stack, config.qualifier);
  const roleArns = new Set<string>();
  const versionParameters = new Set<string>();

  for (const stage of config.stages) {
    const account = stage.env.account ?? stack.account;
    const regions = stage.env.regions.length > 0 ? stage.env.regions : [stack.region];
    for (const region of regions) {
      roleArns.add(`arn:${partition}:iam::${account}:role/cdk-${qualifier}-lookup-role-${account}-${region}`);
      versionParameters.add(`arn:${partition}:ssm:${region}:${account}:parameter/cdk-bootstrap/${qualifier}/version`);
    }
  }

  const statements: iam.PolicyStatement[] = [];
  if (roleArns.size > 0) {
    statements.push(new iam.PolicyStatement({ actions: ['sts:AssumeRole'], resources: [...roleArns] }));
  }
  if (versionParameters.size > 0) {
    statements.push(new iam.PolicyStatement({ actions: ['ssm:GetParameter'], resources: [...versionParameters] }));
  }
  return statements;
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
  const domainSuffix = Token.isUnresolved(stack.region)
    ? stack.urlSuffix
    : (RegionInfo.get(stack.region).domainSuffix ?? stack.urlSuffix);
  const noProxy = proxy.noProxy.length > 0 ? proxy.noProxy : [`${stack.region}.${domainSuffix}`];
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

/**
 * Create the credential-bearing npm config outside the source workspace before either registry login.
 */
function npmConfigSetupCommands(): string[] {
  return [
    `export NPM_CONFIG_USERCONFIG="${PRIVATE_NPM_CONFIG_PATH}"`,
    'rm -f "$NPM_CONFIG_USERCONFIG"',
    'umask 077 && touch "$NPM_CONFIG_USERCONFIG"',
  ];
}

/** Remove the temporary credential file after CodeBuild's build phase. */
function npmConfigCleanupCommands(): string[] {
  return ['rm -f "$NPM_CONFIG_USERCONFIG"'];
}

/**
 * Write a generic npm-compatible registry to the temporary config. CodeBuild injects the token from
 * Secrets Manager as `NPM_AUTH_TOKEN`; a following CodeArtifact login can append its scoped entries.
 */
function npmRegistryLoginCommands(npm: NpmRegistryConfig): string[] {
  const host = npm.url.replace(/^https?:\/\//, '');
  const scope = npm.scope !== undefined && npm.scope.length > 0 ? npm.scope : undefined;
  const scopePrefix = scope !== undefined ? `${scope.startsWith('@') ? scope : `@${scope}`}:` : '';
  return [
    `echo "${scopePrefix}registry=${npm.url}" > "$NPM_CONFIG_USERCONFIG"`,
    `echo "//${host}:_authToken=$NPM_AUTH_TOKEN" >> "$NPM_CONFIG_USERCONFIG"`,
  ];
}

/** Merge caller CI buildspec additions with wrapper-owned secret bindings for the Synth project. */
function mergeSynthPartialBuildSpec(
  partialBuildSpec: codebuild.BuildSpec | undefined,
  proxy: ProxyConfig | undefined,
  npmRegistry: NpmRegistryConfig | undefined,
  privateNpm: boolean,
): codebuild.BuildSpec | undefined {
  if (proxy === undefined && npmRegistry === undefined && !privateNpm) return partialBuildSpec;

  const wrapperBuildSpec = codebuild.BuildSpec.fromObject({
    ...(proxy !== undefined || npmRegistry !== undefined
      ? {
          env: {
            'secrets-manager': {
              ...(proxy !== undefined ? proxySecretsManagerVars(proxy) : {}),
              ...(npmRegistry !== undefined ? { NPM_AUTH_TOKEN: npmRegistry.basicAuthSecretArn } : {}),
            },
          },
        }
      : {}),
    ...(privateNpm
      ? {
          phases: {
            build: {
              // Setup/login and CI all run in CodeBuild's build phase. Its `finally` commands execute
              // even after a failed command, so credentials cannot be stranded by a failed synth.
              finally: npmConfigCleanupCommands(),
            },
          },
        }
      : {}),
  });
  return partialBuildSpec !== undefined
    ? codebuild.mergeBuildSpecs(partialBuildSpec, wrapperBuildSpec)
    : wrapperBuildSpec;
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

/**
 * Before `cdk synth`, scan SSM Parameter Store under the qualifier and export an `ACCOUNT_<STAGE>`
 * env var for EVERY parameter whose name contains `Account` (`/<qualifier>/AccountDev` ->
 * `ACCOUNT_DEV`). Dynamic -- it does NOT hardcode a stage list; whatever `Account*` params the
 * bootstrap wrote become env vars. The qualifier is the config's when set, else the build's own
 * `$CDK_QUALIFIER` (which `CdkPipelinesEngine` already puts on the synth step env).
 *
 * Emitted as POSIX `/bin/sh` (the CodeBuild default shell): the scan writes to a temp file and the
 * `while` reads from it via redirection, so the `export`s land in the SAME shell that then runs
 * `cdk synth` (a `... | while` pipe would export into a subshell and lose them). Fails loud --
 * `exit 1` -- if it finds zero `Account*` params, so a wrong qualifier is a hard error at synth
 * time rather than a silently-empty warm.
 */
export function ssmWarmingCommands(qualifier?: string): string[] {
  const qualifierExpr = qualifier !== undefined ? qualifier : '$CDK_QUALIFIER';
  return [
    `echo "Warming ACCOUNT_<STAGE> env vars from SSM parameters under /${qualifierExpr}/"`,
    '_warm_tmp="$(mktemp)"',
    `aws ssm get-parameters-by-path --path "/${qualifierExpr}/" --query "Parameters[].[Name, Value]" --output text > "$_warm_tmp"`,
    '_warm_found=0',
    // `|| [ -n "$_warm_name" ]` processes a final row that has no trailing newline (POSIX `read`
    // returns non-zero on EOF-without-newline but still populates the vars), so the last Account*
    // param is never silently dropped.
    'while IFS="$(printf \'\\t\')" read -r _warm_name _warm_value || [ -n "$_warm_name" ]; do',
    '  [ -z "$_warm_name" ] && continue',
    '  case "$_warm_name" in',
    '    *Account*)',
    "      _warm_stage=\"$(printf '%s' \"${_warm_name##*Account}\" | tr '[:lower:]' '[:upper:]' | tr -cd '[:alnum:]_')\"",
    // Skip a param whose suffix is not a valid shell identifier (empty, or leading digit) instead of
    // letting `export` fail silently -- warn so a misnamed parameter is visible, not lost.
    '      case "$_warm_stage" in',
    "        ''|[0-9]*)",
    '          echo "cdk-cicd: warmAccountsFromSsm skipping \\"${_warm_name}\\" -- yields no valid ACCOUNT_<STAGE> identifier" >&2',
    '          continue ;;',
    '      esac',
    '      export "ACCOUNT_${_warm_stage}=${_warm_value}"',
    '      echo "ACCOUNT_${_warm_stage} set"',
    '      _warm_found=1',
    '      ;;',
    '  esac',
    'done < "$_warm_tmp"',
    'rm -f "$_warm_tmp"',
    `if [ "$_warm_found" -eq 0 ]; then echo "cdk-cicd: warmAccountsFromSsm found no *Account* parameters under /${qualifierExpr}/ -- is the qualifier correct and the account bootstrapped?" >&2; exit 1; fi`,
  ];
}

/** The read grant the SSM warming scan needs: `ssm:GetParametersByPath` on the qualifier's parameter path. */
export function ssmWarmingReadStatements(stack: Stack, qualifier?: string): iam.PolicyStatement[] {
  // The grant must be scoped to a literal `parameter/<qualifier>/*`. A resolvable qualifier is required
  // when warming is enabled (enforced in resolveCicdConfig) -- guard here too so this helper can never
  // emit an over-broad `parameter/*/*` grant.
  if (qualifier === undefined) {
    throw new Error('cdk-cicd: ssmWarmingReadStatements needs a qualifier to scope the ssm:GetParametersByPath grant.');
  }
  return [
    new iam.PolicyStatement({
      actions: ['ssm:GetParametersByPath'],
      resources: [`arn:${stack.partition}:ssm:${stack.region}:${stack.account}:parameter/${qualifier}/*`],
    }),
  ];
}

/** Secret read plus an exact CMK decrypt grant when the config identifies one. */
function secretReadStatements(secretArn: string, encryptionKeyArn?: string): iam.PolicyStatement[] {
  const statements = [new iam.PolicyStatement({ actions: ['secretsmanager:GetSecretValue'], resources: [secretArn] })];
  if (encryptionKeyArn !== undefined && encryptionKeyArn.trim().length > 0) {
    statements.push(new iam.PolicyStatement({ actions: ['kms:Decrypt'], resources: [encryptionKeyArn] }));
  }
  return statements;
}

function proxySecretReadStatements(proxy: ProxyConfig): iam.PolicyStatement[] {
  return secretReadStatements(proxy.proxySecretArn, proxy.encryptionKeyArn);
}

// NOTE: the old `cdkPipelinesApp(config, factory)` explicit-factory entry has been RETIRED. The single
// entry is now `cdk-cicd exec bin/app.ts` for both engines (engine chosen in cicd.config): for
// CDK_PIPELINES it replays the plain bin per stage via runtime/pipeline-assembler, so no factory or
// pipeline-specific bin is needed. `CdkPipelinesEngine` (above) remains the construct that renders the
// pipeline; the assembler drives it with a replay-based IStageProvider.
