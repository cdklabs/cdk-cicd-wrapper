// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The Repo 2 CD pipeline's shape fingerprint, shared by the synth (`DeploymentPipeline`, which bakes it
// into the pipeline) and the CLI (`cdk-cicd pipeline plan|fingerprint`, which recomputes it from the
// checked-out deploy.config at run time). One implementation, so the two can never drift apart.

import { createHash } from 'crypto';
import { RegionInfo } from 'aws-cdk-lib/region-info';
import { specializeDefaultSynthesizerRoleArn } from '../../config/default-synthesizer-role-arn';
import { ResolvedDeploymentConfig, SynthesizerType } from '../../config/types';

/** The concrete account and Regions a deployment target resolves to in its pipeline. */
export interface DeploymentTargetEnvironment {
  /** Concrete target account. */
  readonly account: string;
  /** Concrete target Regions, in declaration order. */
  readonly regions: string[];
}

/** A private ECR image reference split into the parts used for login, IAM and digest lookups. */
export interface EcrRepositoryReference {
  /** `<account>.dkr.ecr.<region>.<suffix>`. */
  readonly registryHost: string;
  /** Registry account. */
  readonly account: string;
  /** Registry partition. */
  readonly partition: string;
  /** Registry Region. */
  readonly region: string;
  /** Repository name, including any nested path. */
  readonly repositoryName: string;
  /** The tag or `sha256:` digest, when the reference carries one. */
  readonly tagOrDigest?: string;
}

/**
 * Parse a private ECR image reference. Returns undefined for anything that is not a private ECR image.
 * Nested repository paths and an optional tag/digest are preserved; the registry suffix must match its
 * Region's partition.
 */
export function parseEcrRepository(image: string): EcrRepositoryReference | undefined {
  const firstSlash = image.indexOf('/');
  if (firstSlash < 1) return undefined;

  const registryHost = image.slice(0, firstSlash);
  const registry = /^([0-9]{12})\.dkr\.ecr(?:-fips)?\.([a-z0-9-]+)\.(.+)$/.exec(registryHost);
  if (registry === null) return undefined;
  const regionInfo = RegionInfo.get(registry[2]);
  const expectedSuffix = regionInfo.domainSuffix;
  const partition = regionInfo.partition;
  if (expectedSuffix === undefined || partition === undefined) {
    throw new Error(
      `cdk-cicd: ECR image '${image}' uses region '${registry[2]}', whose partition/domain suffix is ` +
        'not known to this aws-cdk-lib version. Upgrade the wrapper/CDK before using this image.',
    );
  }
  if (registry[3] !== expectedSuffix) {
    throw new Error(
      `cdk-cicd: ECR image '${image}' has registry suffix '${registry[3]}', but region '${registry[2]}' ` +
        `belongs to partition '${partition}' and requires '${expectedSuffix}'.`,
    );
  }

  const imagePath = image.slice(firstSlash + 1);
  const digestSeparator = imagePath.indexOf('@');
  const lastSlash = imagePath.lastIndexOf('/');
  const tagSeparator = imagePath.lastIndexOf(':');
  const repositoryName =
    digestSeparator >= 0
      ? imagePath.slice(0, digestSeparator)
      : tagSeparator > lastSlash
        ? imagePath.slice(0, tagSeparator)
        : imagePath;
  if (repositoryName.length === 0) return undefined;
  const tagOrDigest =
    digestSeparator >= 0
      ? imagePath.slice(digestSeparator + 1)
      : tagSeparator > lastSlash
        ? imagePath.slice(tagSeparator + 1)
        : undefined;

  return {
    registryHost,
    account: registry[1],
    partition,
    region: registry[2],
    repositoryName,
    tagOrDigest,
  };
}

function deploymentRepositoryIdentity(repository: ResolvedDeploymentConfig['repository']): unknown {
  if (repository === undefined) return null;
  const base = {
    type: repository.repositoryType,
    name: repository.name,
  };
  switch (repository.repositoryType) {
    case 'codecommit':
      return {
        ...base,
        branch: repository.branch ?? 'main',
        existing: repository.existing ?? false,
      };
    case 'github':
    case 'codestar_connection':
      return {
        ...base,
        branch: repository.branch ?? 'main',
        connectionArn: repository.connectionArn ?? null,
      };
    case 's3':
      return base;
    default:
      return {
        ...base,
        branch: repository.branch ?? null,
        connectionArn: repository.connectionArn ?? null,
        existing: repository.existing ?? null,
      };
  }
}

/**
 * Hash every deploy.config field that changes the synthesized CD pipeline: action topology, stage
 * conditions, IAM, registry login, and the deployer image's bootstrap/app-staging identity. Image
 * tags/digests and stage configuration remain runtime inputs, handled by the per-target fingerprint.
 *
 * `targetEnvironments` holds each target's concrete account and Regions (an omitted target account or
 * Region resolves to the pipeline's own); `qualifier` is the bootstrap qualifier the pipeline resolved.
 */
export function deploymentPipelineShapeFingerprint(
  config: ResolvedDeploymentConfig,
  targetEnvironments: { [stage: string]: DeploymentTargetEnvironment },
  partition: string,
  qualifier: string,
): string {
  const synthesizer = config.synthesizer ?? { type: SynthesizerType.DEFAULT };
  const ecrRepositoryIdentity = (image: string | undefined) => {
    const repository = image === undefined ? undefined : parseEcrRepository(image);
    return repository === undefined
      ? null
      : {
          registryHost: repository.registryHost,
          account: repository.account,
          region: repository.region,
          repositoryName: repository.repositoryName,
        };
  };
  const roleIdentity = (roleArn: string | undefined, stage: string): string | string[] | null => {
    const normalizedRoleArn = roleArn?.trim();
    if (normalizedRoleArn === undefined || normalizedRoleArn.length === 0) return normalizedRoleArn ?? null;
    const environment = targetEnvironments[stage];
    if (environment === undefined) return [];
    return environment.regions.map((region) =>
      specializeDefaultSynthesizerRoleArn(normalizedRoleArn, {
        qualifier,
        account: environment.account,
        region,
        partition,
      }),
    );
  };
  const shape = {
    application: config.application ?? null,
    qualifier,
    repository: deploymentRepositoryIdentity(config.repository),
    synthesizer: {
      type: synthesizer.type,
      appId: synthesizer.appId ?? null,
    },
    crossAccountEcrRepositoryPolicyConfigured: config.crossAccountEcrRepositoryPolicyConfigured ?? false,
    codeArtifact:
      config.codeArtifact === undefined
        ? null
        : {
            domain: config.codeArtifact.domain,
            repository: config.codeArtifact.repository,
            account: config.codeArtifact.account ?? null,
            region: config.codeArtifact.region ?? null,
            npmScope: config.codeArtifact.npmScope ?? null,
          },
    npmRegistry:
      config.npmRegistry === undefined
        ? null
        : {
            url: config.npmRegistry.url,
            basicAuthSecretArn: config.npmRegistry.basicAuthSecretArn,
            encryptionKeyArn: config.npmRegistry.encryptionKeyArn ?? null,
            scope: config.npmRegistry.scope ?? null,
          },
    targets: config.targets.map((target) => ({
      stage: target.stage,
      manualApproval: target.manualApproval,
      account: target.env.account ?? null,
      regions: target.env.regions,
      regionOrder: target.env.regionOrder,
      deployRole: roleIdentity(target.deployment?.deployRole, target.stage),
      cfnExecutionRole: roleIdentity(target.deployment?.cfnExecutionRole, target.stage),
      externalId: target.deployment?.externalId ?? null,
      ecrRepository: ecrRepositoryIdentity(target.image ?? config.image),
      // Only present when on, so existing pipelines keep their recorded shape fingerprint.
      ...(target.autoDeploy === true ? { autoDeploy: true } : {}),
      ...(target.alwaysApprove === true ? { alwaysApprove: true } : {}),
    })),
  };
  return createHash('sha256')
    .update(JSON.stringify({ schema: 'container-deployment-pipeline-shape-v4', ...shape }))
    .digest('hex');
}
