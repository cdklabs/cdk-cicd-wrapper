// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// defineCICD: the one-file Level-1 authoring API. It takes the flexible shape a user writes in
// cicd.config.ts and normalizes it to the union-free ResolvedCicdConfig the CLI consumes.
//
// defineCICD (and its input interfaces) are TS-ONLY on purpose: the input uses unions -- a stage may
// be a bare name or an object, an env may name one region or many -- which jsii cannot express. Only
// the RESOLVED output (./types.ts) is jsii-modeled. This is also why defineCICD is a free function:
// jsii silently omits free functions, and the TS authoring path (cicd.config.ts loaded via ts-node in
// the CLI, in-process) never crosses the jsii boundary. A Python/Java authoring equivalent is a
// separate, later concern (design open-question O1); for now `Repository` + the enums + the resolved
// structs are the jsii surface, and this function serves the TS path.

import { aws_codebuild as codebuild } from 'aws-cdk-lib';
import { BuildImage } from './build-image';
import { normalizeDefaultSynthesizerQualifier } from './default-synthesizer-role-arn';
import { Repository } from './repository';
import {
  CiConfig,
  CodeArtifactConfig,
  CodeBuildImageCredentials,
  CodePipelineRoleNames,
  DeployModel,
  DeploymentConfig,
  EngineType,
  GitHubActionsConfig,
  NpmRegistryConfig,
  PipelineRoleNames,
  PluginRef,
  ProxyConfig,
  RegionOrder,
  ResolvedCicdConfig,
  ResolvedDeploymentConfig,
  ResolvedDeploymentTarget,
  ResolvedStage,
  StageEnvironment,
  SynthesizerType,
  VpcConfig,
} from './types';

/** Stage names that default to no manual approval (inner-loop / research stages). */
const AUTO_APPROVE_STAGES = new Set(['dev', 'res']);

/** A stage's target environment, as written. Either `region` (one) or `regions` (many). */
export interface StageEnvInput {
  readonly account?: string;
  readonly region?: string;
  readonly regions?: string[];
  readonly regionOrder?: RegionOrder;
}

/** A stage, as written: a full object (bare-name string form is handled at the array level). */
export interface StageInput {
  readonly name: string;
  readonly env?: StageEnvInput;
  readonly manualApproval?: boolean;
  readonly deployment?: DeploymentConfig;
}

/** CI config as written. `synthStages` may be the string `'all'` or an explicit list. */
export interface CiConfigInput {
  readonly steps?: { [key: string]: string };
  readonly synthStages?: string[] | 'all';
  readonly image?: string;
  /** Secrets Manager credentials for an authenticated external-registry CodeBuild image. */
  readonly codeBuildImageCredentials?: CodeBuildImageCredentials;
  /** Escape hatch: a CodeBuild spec fragment merged into the CI build project. See `CiConfig.partialBuildSpec`. */
  readonly partialBuildSpec?: codebuild.BuildSpec;
}

/** Proxy config as written: `noProxy`/`proxyTestUrl` are optional, defaulted by `normalizeProxy`. */
export interface ProxyConfigInput {
  readonly proxySecretArn: string;
  readonly encryptionKeyArn?: string;
  readonly noProxy?: string[];
  readonly proxyTestUrl?: string;
}

/** What a user passes to `defineCICD`. Deliberately permissive; normalized to `ResolvedCicdConfig`. */
export interface CicdConfigProps {
  readonly application?: string;
  /** Explicit bootstrap qualifier. Surrounding whitespace is trimmed; the result must match `[A-Za-z0-9_-]{1,10}`. */
  readonly qualifier?: string;
  /**
   * CloudFormation stack name for the engine-owned self-mutating pipeline stack. See
   * `ResolvedCicdConfig.pipelineStackName`. Defaults to `${application}-pipeline`; set it to pin a
   * pre-1.x (Blueprint) pipeline stack name for an in-place migration.
   */
  readonly pipelineStackName?: string;
  readonly repository: Repository;
  /** Each stage is either a bare name (`'dev'`) or a full object. */
  readonly stages: Array<string | StageInput>;
  /**
   * Application synthesizer. `APP_STAGING` remains available for direct/local deployment and Repo 1
   * image synthesis, but wrapper-generated deployment pipelines require `DEFAULT`. Direct use supports
   * custom deployment and CloudFormation execution roles, but not a deploy-role ExternalId.
   */
  readonly synthesizer?: { readonly type?: SynthesizerType; readonly appId?: string };
  readonly engine?: EngineType;
  /** GitHub Actions engine configuration. Only read when `engine` is `EngineType.GITHUB_ACTIONS`. */
  readonly githubActions?: GitHubActionsConfig;
  /** Forced role names for the CDK Pipelines engine. See `ResolvedCicdConfig.pipelineRoleNames`. */
  readonly pipelineRoleNames?: PipelineRoleNames;
  /** Forced role names for the flat CodePipeline engine. See `ResolvedCicdConfig.codePipelineRoleNames`. */
  readonly codePipelineRoleNames?: CodePipelineRoleNames;
  /** Pipeline-level default deploy-role ExternalId. See `ResolvedCicdConfig.deployRoleExternalId`. */
  readonly deployRoleExternalId?: string;
  readonly ci?: CiConfigInput;
  readonly codeArtifact?: CodeArtifactConfig;
  /** Generic private npm registry the builds authenticate against. See `ResolvedCicdConfig.npmRegistry`. */
  readonly npmRegistry?: NpmRegistryConfig;
  /** HTTP(S) proxy every build project routes through. See `ResolvedCicdConfig.proxy`. */
  readonly proxy?: ProxyConfigInput;
  /**
   * Dynamically export `ACCOUNT_<STAGE>` env vars in a self-mutating engine's synth step by scanning
   * SSM Parameter Store under the qualifier. Off by default. See
   * `ResolvedCicdConfig.warmAccountsFromSsm`.
   */
  readonly warmAccountsFromSsm?: boolean;
  /** VPC every CodeBuild project runs in. See `ResolvedCicdConfig.vpc`. */
  readonly vpc?: VpcConfig;
  /** Compliance/access-log destination bucket name. See `ResolvedCicdConfig.complianceLogBucketName`. */
  readonly complianceLogBucketName?: string;
  /**
   * Create and manage `complianceLogBucketName`. Set to `false` to reference a pre-existing,
   * owner-managed Blueprint compliance bucket.
   *
   * @default true
   */
  readonly createComplianceLogBucket?: boolean;
  /**
   * CodeBuild environment overrides (privileged mode, compute type, environment variables) applied to
   * every CodeBuild project. See `ResolvedCicdConfig.codeBuildEnvSettings`.
   */
  readonly codeBuildEnvSettings?: codebuild.BuildEnvironment;
  /** How the deployed assembly is produced. Defaults to `DeployModel.ASSEMBLY_PROMOTION`. */
  readonly deployModel?: DeployModel;
  /** Let a Lambda execute and await CloudFormation instead of paying build compute to wait. Off by default. */
  readonly asyncDeploy?: boolean;
  /**
   * Deploy with CloudFormation express mode (`cdk deploy --express`): CloudFormation reports completion
   * without waiting for resource stabilization -- faster, but rollback is disabled (a failed deploy is
   * left in a failed state). Not recommended for production (AWS guidance); targets fast iterative
   * deployments. Off by default.
   */
  readonly express?: boolean;
  /** Container mode (Repo 1): build & push a deployer image to ECR instead of deploying. See `BuildImage`. */
  readonly deployerImage?: BuildImage;
  /**
   * Security plugins (hardening Aspects) to apply tree-wide (issue #241). Omitted -> the default-on
   * set; `[]` -> opt out of all; a non-empty list COMPLETELY overrides the defaults. A non-built-in
   * name is a custom plugin and must be registered in `bin/` via `CdkCicd.addPlugin`.
   */
  readonly plugins?: PluginRef[];
}

/**
 * Normalize the permissive CI input. `synthStages` has THREE meanings, so it cannot collapse to one:
 * unset -> `[]`, which the engine reads as its efficiency default (one env); `'all'` -> the full stage
 * list (the documented "synth every stage" -- resolved here, since only here are the stage names known);
 * an explicit list -> that list. Collapsing `'all'` to `[]` -- as this once did -- silently synthesized
 * only the first stage, contradicting the field's own doc.
 */
function normalizeCi(ci: CiConfigInput | undefined, stageNames: string[]): CiConfig {
  if (ci?.codeBuildImageCredentials !== undefined && ci.image === undefined) {
    throw new Error('cdk-cicd: ci.codeBuildImageCredentials requires ci.image.');
  }
  return {
    steps: ci?.steps ?? {},
    synthStages: ci?.synthStages === undefined ? [] : ci.synthStages === 'all' ? [...stageNames] : ci.synthStages,
    image: ci?.image,
    codeBuildImageCredentials: ci?.codeBuildImageCredentials,
    partialBuildSpec: ci?.partialBuildSpec,
  };
}

/** Normalize the permissive proxy input, defaulting `noProxy`/`proxyTestUrl` like Blueprint's `defaultProxy` did. */
function normalizeProxy(proxy: ProxyConfigInput | undefined): ProxyConfig | undefined {
  if (proxy === undefined) return undefined;
  return {
    proxySecretArn: proxy.proxySecretArn,
    encryptionKeyArn: proxy.encryptionKeyArn,
    noProxy: proxy.noProxy ?? [],
    proxyTestUrl: proxy.proxyTestUrl ?? 'https://aws.amazon.com',
  };
}

/** Derive a ≤10-char, lowercase-alphanumeric bootstrap qualifier from an application name. */
function deriveQualifier(application: string): string {
  const sanitized = application.toLowerCase().replace(/[^a-z0-9]/g, '');
  return sanitized.slice(0, 10) || 'cdkcicd';
}

function normalizeStage(stage: string | StageInput): ResolvedStage {
  const input: StageInput = typeof stage === 'string' ? { name: stage } : stage;
  const env: StageEnvInput = input.env ?? {};

  const regions = env.regions ?? (env.region !== undefined ? [env.region] : []);

  const resolvedEnv: StageEnvironment = {
    account: env.account,
    regions,
    regionOrder: env.regionOrder ?? RegionOrder.SEQUENTIAL,
  };

  return {
    name: input.name,
    env: resolvedEnv,
    // Inner-loop stages deploy without a gate; everything else defaults to requiring approval.
    manualApproval: input.manualApproval ?? !AUTO_APPROVE_STAGES.has(input.name),
    deployment: input.deployment,
  };
}

/**
 * Normalize an already-parsed config object (e.g. from a `cicd.config.yaml`) into the resolved shape.
 * Shared with `defineCICD` so YAML and TS authoring get identical defaults.
 */
export function resolveCicdConfig(props: CicdConfigProps): ResolvedCicdConfig {
  const application = props.application;
  const stages = props.stages.map(normalizeStage);
  const synthesizerType = props.synthesizer?.type ?? SynthesizerType.DEFAULT;
  const engine = props.engine ?? EngineType.CODEPIPELINE;
  const qualifier =
    props.qualifier !== undefined
      ? normalizeDefaultSynthesizerQualifier(props.qualifier)
      : application !== undefined
        ? deriveQualifier(application)
        : undefined;
  const warmAccountsFromSsm = props.warmAccountsFromSsm ?? false;
  const createComplianceLogBucket = props.createComplianceLogBucket ?? true;
  if (!createComplianceLogBucket && !props.complianceLogBucketName?.trim()) {
    throw new Error(
      'cdk-cicd: createComplianceLogBucket: false requires complianceLogBucketName for the existing bucket.',
    );
  }
  if (synthesizerType === SynthesizerType.APP_STAGING) {
    const stageWithExternalId = stages.find((stage) => {
      const deployRole = stage.deployment?.deployRole?.trim();
      const externalId = (stage.deployment?.externalId ?? props.deployRoleExternalId)?.trim();
      return deployRole !== undefined && deployRole.length > 0 && externalId !== undefined && externalId.length > 0;
    });
    if (stageWithExternalId !== undefined) {
      throw new Error(
        `cdk-cicd: SynthesizerType.APP_STAGING cannot use a deploy-role ExternalId ` +
          `(stage '${stageWithExternalId.name}'). The installed alpha deployment identities do not expose it.`,
      );
    }
  }
  // Account warming scans SSM under the qualifier and grants ssm:GetParametersByPath on
  // `parameter/<qualifier>/*`. Without a resolvable qualifier the grant could only widen to
  // `parameter/*/*` (every parameter in the account) -- so require a qualifier rather than emit an
  // over-broad grant, and fail at config time rather than at synth.
  if (warmAccountsFromSsm && qualifier === undefined) {
    throw new Error(
      'cdk-cicd: warmAccountsFromSsm requires a resolvable qualifier -- set `qualifier` or `application` ' +
        'in defineCICD so the SSM scan and its IAM grant can be scoped to `parameter/<qualifier>/*`.',
    );
  }
  return {
    application,
    qualifier,
    pipelineStackName: props.pipelineStackName,
    repository: props.repository,
    stages,
    synthesizer: {
      type: synthesizerType,
      appId: props.synthesizer?.appId,
    },
    engine,
    githubActions: props.githubActions,
    pipelineRoleNames: props.pipelineRoleNames,
    codePipelineRoleNames: props.codePipelineRoleNames,
    deployRoleExternalId: props.deployRoleExternalId,
    ci: normalizeCi(
      props.ci,
      stages.map((s) => s.name),
    ),
    codeArtifact: props.codeArtifact,
    npmRegistry: props.npmRegistry,
    proxy: normalizeProxy(props.proxy),
    warmAccountsFromSsm,
    vpc: props.vpc,
    complianceLogBucketName: props.complianceLogBucketName,
    createComplianceLogBucket,
    codeBuildEnvSettings: props.codeBuildEnvSettings,
    deployModel: props.deployModel ?? DeployModel.ASSEMBLY_PROMOTION,
    asyncDeploy: props.asyncDeploy ?? false,
    express: props.express ?? false,
    deployerImage: props.deployerImage,
    plugins: props.plugins,
  };
}

/**
 * The Level-1 entry point a user writes in `cicd.config.ts`:
 *
 * ```ts
 * export default defineCICD({
 *   application: 'my-app',
 *   repository: Repository.github('org/my-app'),
 *   stages: [{ name: 'dev', env: { account: '...', region: 'us-east-1' } }, 'prod'],
 * });
 * ```
 */
export const defineCICD = resolveCicdConfig;

/** A deployment target, as written in Repo 2's `deploy.config.ts`. `env` takes one region or many. */
export interface DeploymentTargetInput {
  readonly stage: string;
  readonly env?: StageEnvInput;
  readonly manualApproval?: boolean;
  readonly deployment?: DeploymentConfig;
  /** This target's deployer image (tag/digest), overriding the top-level `image` -- the per-stage version. */
  readonly image?: string;
  /**
   * Existing compliance/access-log destination bucket for this target, overriding the deployment-wide
   * default. The target must declare a concrete account and exactly one concrete Region.
   */
  readonly complianceLogBucketName?: string;
}

/** What a user passes to `defineDeployment` (Repo 2). Deliberately permissive; normalized to resolved structs. */
export interface DeploymentProps {
  /** Application name used by the deployer image. */
  readonly application?: string;
  /**
   * Bootstrap qualifier used by the deployer image; derived from `application` when omitted.
   * Surrounding whitespace is trimmed; the result must match `[A-Za-z0-9_-]{1,10}`.
   */
  readonly qualifier?: string;
  /**
   * Synthesizer used by the deployer image; must match its `cicd.config`. `APP_STAGING` is supported
   * by direct `deploy --from-image`, not by the generated Repo 2 CodePipeline. Direct use supports
   * custom deployment and CloudFormation execution roles, but not a deploy-role ExternalId.
   */
  readonly synthesizer?: { readonly type?: SynthesizerType; readonly appId?: string };
  /** Default deployer image (an ECR/OCI reference, tag or digest); optional if every target pins its own `image`. */
  readonly image?: string;
  /**
   * Existing compliance/access-log destination bucket name used by targets that do not override it.
   * Repo 2 does not create this bucket. Every target using it must be in the bucket's same account and
   * Region, represented by a concrete account and exactly one concrete Region on that target.
   */
  readonly complianceLogBucketName?: string;
  /** The targets to run the image against, in order. */
  readonly targets: DeploymentTargetInput[];
  /**
   * The config-only source repository the CD pipeline watches (where this `deploy.config.ts` lives).
   * Omit for the local `cdk-cicd deploy --from-image` executor; set it to provision a CD CodePipeline
   * with `cdk-cicd deploy-ci` (source -> CodeBuild that runs the image against each target).
   */
  readonly repository?: Repository;
  /** Private CodeArtifact repo the CD build logs into before `npm ci` (for a pre-release wrapper CLI). */
  readonly codeArtifact?: CodeArtifactConfig;
  /** Generic private npm registry the CD build authenticates against before `npm ci`. */
  readonly npmRegistry?: NpmRegistryConfig;
  /**
   * Confirms that every cross-account ECR repository referenced by `image` or a target override has
   * an owner-side repository policy granting the generated Repo 2 CodeBuild role pull access.
   */
  readonly crossAccountEcrRepositoryPolicyConfigured?: boolean;
}

const AWS_ACCOUNT_ID = /^\d{12}$/;
const AWS_REGION = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+-\d+$/;
const S3_BUCKET_NAME = /^(?!\d{1,3}(?:\.\d{1,3}){3}$)(?!.*\.\.)[a-z0-9](?:[a-z0-9.-]{1,61}[a-z0-9])$/;

function normalizeComplianceBucketName(value: string | undefined, context: string): string | undefined {
  if (value === undefined) return undefined;
  const name = value.trim();
  if (name !== value || !S3_BUCKET_NAME.test(name)) {
    throw new Error(
      `cdk-cicd: ${context} complianceLogBucketName must be a valid 3-63 character S3 bucket name ` +
        'with no surrounding whitespace.',
    );
  }
  return name;
}

function normalizeTarget(
  target: DeploymentTargetInput,
  defaultComplianceLogBucketName?: string,
): ResolvedDeploymentTarget {
  const env: StageEnvInput = target.env ?? {};
  const regions = env.regions ?? (env.region !== undefined ? [env.region] : []);
  const complianceLogBucketName = normalizeComplianceBucketName(
    target.complianceLogBucketName ?? defaultComplianceLogBucketName,
    `target '${target.stage}'`,
  );

  let complianceLogBucketAccount: string | undefined;
  let complianceLogBucketRegion: string | undefined;
  if (complianceLogBucketName !== undefined) {
    if (env.account === undefined || !AWS_ACCOUNT_ID.test(env.account)) {
      throw new Error(
        `cdk-cicd: target '${target.stage}' compliance logging requires a concrete 12-digit env.account.`,
      );
    }
    if (regions.length !== 1 || !AWS_REGION.test(regions[0])) {
      throw new Error(
        `cdk-cicd: target '${target.stage}' compliance logging requires exactly one concrete AWS Region; ` +
          'S3 server access logs cannot cross Regions.',
      );
    }
    complianceLogBucketAccount = env.account;
    complianceLogBucketRegion = regions[0];
  }

  return {
    stage: target.stage,
    env: {
      account: env.account,
      regions,
      regionOrder: env.regionOrder ?? RegionOrder.SEQUENTIAL,
    },
    // Same gate default as stages: inner-loop targets deploy without approval, the rest require it.
    manualApproval: target.manualApproval ?? !AUTO_APPROVE_STAGES.has(target.stage),
    deployment: target.deployment,
    image: target.image,
    complianceLogBucketName,
    complianceLogBucketAccount,
    complianceLogBucketRegion,
  };
}

/**
 * The container-mode (Repo 2) entry point a user writes in `deploy.config.ts`:
 *
 * ```ts
 * export default defineDeployment({
 *   image: 'ACCT.dkr.ecr.eu-west-1.amazonaws.com/my-app-deployer:1.4.2',
 *   targets: [
 *     { stage: 'dev', env: { account: '...', region: 'eu-west-1' } },
 *     { stage: 'prod', env: { account: '...', regions: ['eu-west-1', 'us-east-1'] }, manualApproval: true },
 *   ],
 * });
 * ```
 *
 * TS-only for the same reason as `defineCICD`: jsii silently omits free functions, and this is loaded
 * in-process by the CLI (via ts-node) so it never crosses the jsii boundary. Only the resolved
 * `ResolvedDeploymentConfig` is jsii-modeled.
 */
export function defineDeployment(props: DeploymentProps): ResolvedDeploymentConfig {
  const synthesizerType = props.synthesizer?.type ?? SynthesizerType.DEFAULT;
  const qualifier =
    props.qualifier !== undefined
      ? normalizeDefaultSynthesizerQualifier(props.qualifier)
      : props.application !== undefined
        ? deriveQualifier(props.application)
        : undefined;
  const complianceLogBucketName = normalizeComplianceBucketName(props.complianceLogBucketName, 'deployment');
  if (synthesizerType === SynthesizerType.APP_STAGING) {
    const targetWithExternalId = props.targets.find((target) => {
      const deployRole = target.deployment?.deployRole?.trim();
      const externalId = target.deployment?.externalId?.trim();
      return deployRole !== undefined && deployRole.length > 0 && externalId !== undefined && externalId.length > 0;
    });
    if (targetWithExternalId !== undefined) {
      throw new Error(
        `cdk-cicd: SynthesizerType.APP_STAGING cannot use a deploy-role ExternalId ` +
          `(target '${targetWithExternalId.stage}'). The installed alpha deployment identities do not expose it.`,
      );
    }
  }
  const targets = props.targets.map((target) => normalizeTarget(target, complianceLogBucketName));
  const bucketCoordinates = new Map<string, string>();
  for (const target of targets) {
    if (target.complianceLogBucketName === undefined) continue;
    const coordinates = `${target.complianceLogBucketAccount}/${target.complianceLogBucketRegion}`;
    const previous = bucketCoordinates.get(target.complianceLogBucketName);
    if (previous !== undefined && previous !== coordinates) {
      throw new Error(
        `cdk-cicd: compliance bucket '${target.complianceLogBucketName}' is assigned to both ${previous} ` +
          `and ${coordinates}. An S3 bucket has one account and Region; use distinct bucket names.`,
      );
    }
    bucketCoordinates.set(target.complianceLogBucketName, coordinates);
  }
  return {
    application: props.application,
    qualifier,
    synthesizer: {
      type: synthesizerType,
      appId: props.synthesizer?.appId,
    },
    image: props.image,
    complianceLogBucketName,
    targets,
    repository: props.repository,
    codeArtifact: props.codeArtifact,
    npmRegistry: props.npmRegistry,
    crossAccountEcrRepositoryPolicyConfigured: props.crossAccountEcrRepositoryPolicyConfigured,
  };
}
