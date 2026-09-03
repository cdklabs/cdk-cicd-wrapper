// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// resolveSynthesizer in isolation -- deliberately NOT importing register.ts, so App is unpatched and
// we bind the synthesizer explicitly. Proves the forced-role env vars (m3-forced-roles) thread into
// the synthesized stack's roles, read from the environment (never from cicd.config).

import { App, Stack } from 'aws-cdk-lib';
import { resolveDefaultSynthesizerQualifier } from '../../src/config/default-synthesizer-role-arn';
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
  supportAssumeRoleArn?: string;
  supportCfnRoleArn?: string;
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
    const supportArtifact = assembly.stacks.find((candidate) => candidate.stackName.startsWith('StagingStack-'));
    return {
      assumeRoleArn: artifact.assumeRoleArn,
      cfnRoleArn: artifact.cloudFormationExecutionRoleArn,
      assumeRoleExternalId: artifact.assumeRoleExternalId,
      supportAssumeRoleArn: supportArtifact?.assumeRoleArn,
      supportCfnRoleArn: supportArtifact?.cloudFormationExecutionRoleArn,
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
    const configuredQualifier = '  shop123  ';
    const expectedQualifier = resolveDefaultSynthesizerQualifier(new App(), configuredQualifier);
    const { assumeRoleArn, cfnRoleArn } = synthWithRoleEnv({}, { qualifier: configuredQualifier });
    expect(assumeRoleArn).toContain(`cdk-${expectedQualifier}-deploy-role-`);
    expect(cfnRoleArn).toContain(`cdk-${expectedQualifier}-cfn-exec-role-`);
  });

  test.each(['', '   ', 'invalid qualifier', 'invalid!', '12345678901'])(
    'rejects an invalid qualifier in manually constructed resolved config %j',
    (qualifier) => {
      expect(() => resolveSynthesizer({ qualifier })).toThrow(/explicit bootstrap qualifier.*\[A-Za-z0-9_-\]\{1,10\}/);
    },
  );

  test('APP_STAGING uses the alpha default qualifier when none is configured', () => {
    const result = synthWithRoleEnv(
      {},
      {
        application: 'payments-platform',
        synthesizer: { type: SynthesizerType.APP_STAGING },
      },
    );
    expect(result.assumeRoleArn).toContain('cdk-hnb659fds-deploy-role-');
    expect(result.cfnRoleArn).toContain('cdk-hnb659fds-cfn-exec-role-');
    expect(result.stackNames).toContain('StagingStack-payments-platform');
  });

  test('APP_STAGING accepts an explicit appId override', () => {
    const result = synthWithRoleEnv(
      {},
      {
        application: 'payments-platform',
        synthesizer: { type: SynthesizerType.APP_STAGING, appId: 'payments-v2' },
      },
    );
    expect(result.stackNames).toContain('StagingStack-payments-v2');
  });

  test.each([
    { name: 'deploy role', env: { deploy: DEPLOY_ARN } },
    { name: 'CloudFormation execution role', env: { cfn: CFN_ARN } },
    { name: 'both roles', env: { deploy: DEPLOY_ARN, cfn: CFN_ARN } },
  ] as Array<{ name: string; env: { deploy?: string; cfn?: string } }>)(
    'APP_STAGING threads a forced $name into application deployment identities',
    ({ env }) => {
      const result = synthWithRoleEnv(env, {
        application: 'payments',
        synthesizer: { type: SynthesizerType.APP_STAGING },
      });

      if (env.deploy !== undefined) expect(result.assumeRoleArn).toBe(DEPLOY_ARN);
      else expect(result.assumeRoleArn).toContain('cdk-hnb659fds-deploy-role-');
      if (env.cfn !== undefined) expect(result.cfnRoleArn).toBe(CFN_ARN);
      else expect(result.cfnRoleArn).toContain('cdk-hnb659fds-cfn-exec-role-');
      expect(result.supportAssumeRoleArn).toContain('cdk-hnb659fds-deploy-role-');
      expect(result.supportCfnRoleArn).toContain('cdk-hnb659fds-cfn-exec-role-');
      expect(result.supportAssumeRoleArn).not.toBe(DEPLOY_ARN);
      expect(result.supportCfnRoleArn).not.toBe(CFN_ARN);
    },
  );

  test('APP_STAGING fails fast when no application identity is available', () => {
    expect(() => resolveSynthesizer({ synthesizer: { type: SynthesizerType.APP_STAGING } })).toThrow(
      /requires an application-unique id/,
    );
  });

  test('APP_STAGING applies a custom bootstrap qualifier to its deployment identities', () => {
    const result = synthWithRoleEnv(
      {},
      {
        application: 'payments',
        qualifier: 'shop123',
        synthesizer: { type: SynthesizerType.APP_STAGING },
      },
    );
    expect(result.assumeRoleArn).toContain('cdk-shop123-deploy-role-');
    expect(result.cfnRoleArn).toContain('cdk-shop123-cfn-exec-role-');
    expect(result.stackNames).toContain('StagingStack-payments');
  });

  test('APP_STAGING fails fast for a forced deploy-role ExternalId', () => {
    expect(() =>
      synthWithRoleEnv(
        { deploy: DEPLOY_ARN, externalId: 'external-123' },
        {
          application: 'payments',
          synthesizer: { type: SynthesizerType.APP_STAGING },
        },
      ),
    ).toThrow(/cannot use a forced deploy-role ExternalId/);
  });

  test('an unknown synthesizer type fails explicitly', () => {
    expect(() => resolveSynthesizer({ synthesizer: { type: 'future' } })).toThrow(
      /unsupported synthesizer type 'future'/,
    );
  });
});
