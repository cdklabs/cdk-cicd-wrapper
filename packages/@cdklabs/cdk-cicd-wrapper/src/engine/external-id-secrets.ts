// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { ResolvedCicdConfig } from '../config/types';

const SECRET_REF_PREFIX = 'resolve:secretsmanager:';

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
    const externalId = (stage.deployment.externalId ?? pipelineExternalId)?.trim();
    if (externalId?.startsWith(SECRET_REF_PREFIX)) {
      const secretArn = externalId.slice(SECRET_REF_PREFIX.length).trim();
      if (secretArn.length === 0) {
        throw new Error(
          `cdk-cicd: stage '${stage.name}' has an empty resolve:secretsmanager: deploy-role externalId reference`,
        );
      }
      arns.add(secretArn);
    }
  }
  return [...arns];
}
