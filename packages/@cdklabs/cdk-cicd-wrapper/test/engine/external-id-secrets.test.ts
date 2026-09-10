// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { defineCICD, defineDeployment } from '../../src/config/define';
import { Repository } from '../../src/config/repository';
import { RegionOrder } from '../../src/config/types';
import {
  deployRoleExternalIdSecretArnsForStages,
  secretArnFromDeployRoleExternalId,
} from '../../src/engine/external-id-secrets';

const DEPLOY_ROLE = 'arn:aws:iam::111111111111:role/deployer';
const VALID_SECRET_ARN = 'arn:aws:secretsmanager:us-west-2:111111111111:secret:deploy-external-AbCdEf';

function stagesWith(externalId: string) {
  return [
    {
      name: 'dev',
      env: { regions: [], regionOrder: RegionOrder.SEQUENTIAL },
      manualApproval: false,
      deployment: { deployRole: DEPLOY_ROLE, externalId },
    },
  ];
}

describe('deploy-role externalId Secrets Manager references', () => {
  test.each([
    VALID_SECRET_ARN,
    'arn:aws-cn:secretsmanager:cn-north-1:111111111111:secret:deploy-external-AbCdEf',
    'arn:aws-us-gov:secretsmanager:us-gov-west-1:111111111111:secret:deploy-external-AbCdEf',
  ])('accepts a complete literal Secret Manager ARN in a supported partition: %s', (secretArn) => {
    expect(secretArnFromDeployRoleExternalId(`resolve:secretsmanager:${secretArn}`, 'deployRoleExternalId')).toBe(
      secretArn,
    );
  });

  test.each([
    'resolve:secretsmanager:',
    'resolve:secretsmanager:*',
    'resolve:secretsmanager:arn:aws:secretsmanager:*:111111111111:secret:deploy-external',
    'resolve:secretsmanager:arn:aws:secretsmanager:us-west-2:*:secret:deploy-external',
    'resolve:secretsmanager:arn:aws:secretsmanager:us-west-2:111111111111:secret:*',
    'resolve:secretsmanager:not-an-arn',
    'resolve:secretsmanager:arn:aws:ssm:us-west-2:111111111111:parameter/deploy-external',
  ])('rejects unsafe secret reference %s during pipeline configuration normalization', (externalId) => {
    expect(() =>
      defineCICD({
        repository: Repository.s3('source-bucket/source.zip'),
        deployRoleExternalId: externalId,
        stages: [{ name: 'dev', deployment: { deployRole: DEPLOY_ROLE } }],
      }),
    ).toThrow(/deployRoleExternalId.*complete literal Secrets Manager secret ARN/);
  });

  test('identifies the stage field that contains an unsafe secret reference', () => {
    expect(() =>
      defineCICD({
        repository: Repository.s3('source-bucket/source.zip'),
        stages: [
          {
            name: 'prod',
            deployment: { deployRole: DEPLOY_ROLE, externalId: 'resolve:secretsmanager:*' },
          },
        ],
      }),
    ).toThrow(/stage 'prod' deployment\.externalId.*complete literal Secrets Manager secret ARN/);
  });

  test('identifies the Repo 2 target field that contains an unsafe secret reference', () => {
    expect(() =>
      defineDeployment({
        image: '111111111111.dkr.ecr.us-west-2.amazonaws.com/deployer:stable',
        targets: [
          {
            stage: 'prod',
            deployment: { deployRole: DEPLOY_ROLE, externalId: 'resolve:secretsmanager:*' },
          },
        ],
      }),
    ).toThrow(/target 'prod' deployment\.externalId.*complete literal Secrets Manager secret ARN/);
  });

  test('defensively rejects an unsafe reference before it can become an IAM policy resource', () => {
    expect(() => deployRoleExternalIdSecretArnsForStages(stagesWith('resolve:secretsmanager:*'), undefined)).toThrow(
      /stage 'dev' deploy-role externalId.*complete literal Secrets Manager secret ARN/,
    );
  });

  test('collects valid references as exact IAM policy resources', () => {
    expect(
      deployRoleExternalIdSecretArnsForStages(stagesWith(`resolve:secretsmanager:${VALID_SECRET_ARN}`), undefined),
    ).toEqual([VALID_SECRET_ARN]);
  });
});
