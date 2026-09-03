// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// resolveSynthesizer in isolation -- deliberately NOT importing register.ts, so App is unpatched and
// we bind the synthesizer explicitly. Proves the forced-role env vars (m3-forced-roles) thread into
// the synthesized stack's roles, read from the environment (never from cicd.config).

import { App, Stack } from 'aws-cdk-lib';
import { SynthesizerType } from '../../src/config/types';
import {
  CFN_EXEC_ROLE_FLAG,
  DEPLOY_ROLE_EXTERNAL_ID_FLAG,
  DEPLOY_ROLE_FLAG,
  resolveSynthesizer,
} from '../../src/runtime/inject';

const DEPLOY_ARN = 'arn:aws:iam::111111111111:role/ForcedDeploy';
const CFN_ARN = 'arn:aws:iam::111111111111:role/ForcedCfnExec';

/** Synthesize a stack whose synthesizer is resolveSynthesizer() under the given role env, return its roles. */
function synthWithRoleEnv(
  env: { deploy?: string; cfn?: string; externalId?: string },
  config: Record<string, unknown> = {},
): {
  assumeRoleArn?: string;
  cfnRoleArn?: string;
  assumeRoleExternalId?: string;
  stackNames: string[];
} {
  const prev = {
    d: process.env[DEPLOY_ROLE_FLAG],
    c: process.env[CFN_EXEC_ROLE_FLAG],
    e: process.env[DEPLOY_ROLE_EXTERNAL_ID_FLAG],
  };
  const set = (key: string, value?: string) =>
    value === undefined ? delete process.env[key] : (process.env[key] = value);
  set(DEPLOY_ROLE_FLAG, env.deploy);
  set(CFN_EXEC_ROLE_FLAG, env.cfn);
  set(DEPLOY_ROLE_EXTERNAL_ID_FLAG, env.externalId);
  try {
    const app = new App();
    const stack = new Stack(app, 'S', {
      synthesizer: resolveSynthesizer(config),
      env: { account: '111111111111', region: 'us-west-2' },
    });
    const assembly = app.synth();
    const artifact = assembly.getStackArtifact(stack.artifactId);
    return {
      assumeRoleArn: artifact.assumeRoleArn,
      cfnRoleArn: artifact.cloudFormationExecutionRoleArn,
      assumeRoleExternalId: artifact.assumeRoleExternalId,
      stackNames: assembly.stacks.map((candidate) => candidate.stackName),
    };
  } finally {
    set(DEPLOY_ROLE_FLAG, prev.d);
    set(CFN_EXEC_ROLE_FLAG, prev.c);
    set(DEPLOY_ROLE_EXTERNAL_ID_FLAG, prev.e);
  }
}

describe('m3-forced-roles: resolveSynthesizer', () => {
  test('with no role env, the default bootstrap deploy role is used (not the forced one)', () => {
    const { assumeRoleArn } = synthWithRoleEnv({});
    expect(assumeRoleArn).not.toContain('ForcedDeploy');
  });

  test('CDK_CICD_DEPLOY_ROLE_ARN becomes the stack assume (deploy) role', () => {
    expect(synthWithRoleEnv({ deploy: DEPLOY_ARN }).assumeRoleArn).toBe(DEPLOY_ARN);
  });

  test('CDK_CICD_CFN_EXEC_ROLE_ARN becomes the CloudFormation execution role', () => {
    expect(synthWithRoleEnv({ cfn: CFN_ARN }).cfnRoleArn).toBe(CFN_ARN);
  });

  test('CDK_CICD_DEPLOY_ROLE_EXTERNAL_ID becomes the deploy-role assume externalId', () => {
    const { assumeRoleArn, assumeRoleExternalId } = synthWithRoleEnv({ deploy: DEPLOY_ARN, externalId: 'ext-123' });
    expect(assumeRoleArn).toBe(DEPLOY_ARN);
    expect(assumeRoleExternalId).toBe('ext-123');
  });

  test('no externalId env means no assumeRoleExternalId on the artifact', () => {
    expect(synthWithRoleEnv({ deploy: DEPLOY_ARN }).assumeRoleExternalId).toBeUndefined();
  });

  test('both forced roles thread through together', () => {
    const { assumeRoleArn, cfnRoleArn } = synthWithRoleEnv({ deploy: DEPLOY_ARN, cfn: CFN_ARN });
    expect(assumeRoleArn).toBe(DEPLOY_ARN);
    expect(cfnRoleArn).toBe(CFN_ARN);
  });

  test('the configured qualifier controls the default bootstrap role names', () => {
    const { assumeRoleArn, cfnRoleArn } = synthWithRoleEnv({}, { qualifier: 'shop123' });
    expect(assumeRoleArn).toContain('cdk-shop123-deploy-role-');
    expect(cfnRoleArn).toContain('cdk-shop123-cfn-exec-role-');
  });

  test('APP_STAGING keeps app identity separate from the bootstrap qualifier', () => {
    const result = synthWithRoleEnv(
      {},
      {
        application: 'payments-platform',
        qualifier: 'shop123',
        synthesizer: { type: SynthesizerType.APP_STAGING },
      },
    );
    expect(result.assumeRoleArn).toContain('cdk-shop123-deploy-role-');
    expect(result.cfnRoleArn).toContain('cdk-shop123-cfn-exec-role-');
    expect(result.stackNames).toContain('StagingStack-payments-platform');
  });

  test('APP_STAGING accepts an explicit appId override', () => {
    const result = synthWithRoleEnv(
      {},
      {
        application: 'payments-platform',
        qualifier: 'shop123',
        synthesizer: { type: SynthesizerType.APP_STAGING, appId: 'payments-v2' },
      },
    );
    expect(result.stackNames).toContain('StagingStack-payments-v2');
  });

  test('APP_STAGING threads forced deploy and CloudFormation roles through DeploymentIdentities', () => {
    const result = synthWithRoleEnv(
      { deploy: DEPLOY_ARN, cfn: CFN_ARN },
      {
        application: 'payments',
        qualifier: 'shop123',
        synthesizer: { type: SynthesizerType.APP_STAGING },
      },
    );
    expect(result.assumeRoleArn).toBe(DEPLOY_ARN);
    expect(result.cfnRoleArn).toBe(CFN_ARN);
  });

  test('APP_STAGING fails fast when no application identity is available', () => {
    expect(() => resolveSynthesizer({ synthesizer: { type: SynthesizerType.APP_STAGING } })).toThrow(
      /requires an application-unique id/,
    );
  });

  test('APP_STAGING fails fast for forced deploy-role ExternalIds unsupported by the alpha API', () => {
    const previousDeploy = process.env[DEPLOY_ROLE_FLAG];
    const previousExternalId = process.env[DEPLOY_ROLE_EXTERNAL_ID_FLAG];
    process.env[DEPLOY_ROLE_FLAG] = DEPLOY_ARN;
    process.env[DEPLOY_ROLE_EXTERNAL_ID_FLAG] = 'external-123';
    try {
      expect(() =>
        resolveSynthesizer({
          application: 'payments',
          qualifier: 'shop123',
          synthesizer: { type: SynthesizerType.APP_STAGING },
        }),
      ).toThrow(/cannot use a forced deploy-role ExternalId/);
    } finally {
      if (previousDeploy === undefined) delete process.env[DEPLOY_ROLE_FLAG];
      else process.env[DEPLOY_ROLE_FLAG] = previousDeploy;
      if (previousExternalId === undefined) delete process.env[DEPLOY_ROLE_EXTERNAL_ID_FLAG];
      else process.env[DEPLOY_ROLE_EXTERNAL_ID_FLAG] = previousExternalId;
    }
  });

  test('an unknown synthesizer type fails explicitly', () => {
    expect(() => resolveSynthesizer({ synthesizer: { type: 'future' } })).toThrow(
      /unsupported synthesizer type 'future'/,
    );
  });
});
