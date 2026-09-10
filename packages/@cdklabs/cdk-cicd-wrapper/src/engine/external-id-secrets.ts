// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { ResolvedCicdConfig } from '../config/types';

export const SECRET_REF_PREFIX = 'resolve:secretsmanager:';

// A literal Secrets Manager ARN is required because this value is emitted directly as an IAM Resource.
// The partition pattern supports standard and isolated AWS partitions without accepting wildcard characters.
const SECRET_MANAGER_ARN =
  /^arn:aws(?:-[a-z0-9-]+)?:secretsmanager:[a-z]{2}(?:-[a-z0-9]+)+-\d:\d{12}:secret:[A-Za-z0-9/_+=.@-]+$/;

/**
 * Return a literal Secrets Manager ARN from a deploy-role ExternalId reference, if present.
 *
 * A `resolve:secretsmanager:` reference crosses a privilege boundary: its suffix becomes an IAM
 * `secretsmanager:GetSecretValue` resource. Reject anything that cannot name exactly one secret.
 */
export function secretArnFromDeployRoleExternalId(value: string | undefined, field: string): string | undefined {
  const normalized = value?.trim();
  if (normalized === undefined || !normalized.startsWith(SECRET_REF_PREFIX)) return undefined;

  const secretArn = normalized.slice(SECRET_REF_PREFIX.length);
  if (!SECRET_MANAGER_ARN.test(secretArn)) {
    throw new Error(
      `cdk-cicd: ${field} must use resolve:secretsmanager:<complete literal Secrets Manager secret ARN>; ` +
        'wildcards, non-ARN identifiers, and other AWS services are not allowed.',
    );
  }
  return secretArn;
}

/**
 * Secrets Manager ARNs that must be readable while the application is synthesized. ExternalIds are
 * resolved only for stages that actually configure a deploy role; per-stage values override the
 * pipeline default, matching the CLI runtime contract.
 */
export function deployRoleExternalIdSecretArns(config: ResolvedCicdConfig): string[] {
  return deployRoleExternalIdSecretArnsForStages(config.stages, config.deployRoleExternalId);
}

/** Stage-scoped form used by engines that synthesize only a subset of the configured stages. */
export function deployRoleExternalIdSecretArnsForStages(
  stages: ReadonlyArray<ResolvedCicdConfig['stages'][number]>,
  pipelineExternalId?: string,
): string[] {
  const arns = new Set<string>();
  for (const stage of stages) {
    if (stage.deployment?.deployRole === undefined || stage.deployment.deployRole.trim().length === 0) {
      continue;
    }
    const externalId = stage.deployment.externalId ?? pipelineExternalId;
    const secretArn = secretArnFromDeployRoleExternalId(externalId, `stage '${stage.name}' deploy-role externalId`);
    if (secretArn !== undefined) {
      arns.add(secretArn);
    }
  }
  return [...arns];
}
