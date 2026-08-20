// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// resolveSynthesizer in isolation -- deliberately NOT importing register.ts, so App is unpatched and
// we bind the synthesizer explicitly. Proves the forced-role env vars (m3-forced-roles) thread into
// the synthesized stack's roles, read from the environment (never from cicd.config).

import { App, Stack } from 'aws-cdk-lib';
import { CFN_EXEC_ROLE_FLAG, DEPLOY_ROLE_FLAG, resolveSynthesizer } from '../../../src/v3/runtime/inject';

const DEPLOY_ARN = 'arn:aws:iam::111111111111:role/ForcedDeploy';
const CFN_ARN = 'arn:aws:iam::111111111111:role/ForcedCfnExec';

/** Synthesize a stack whose synthesizer is resolveSynthesizer() under the given role env, return its roles. */
function synthWithRoleEnv(env: { deploy?: string; cfn?: string }): { assumeRoleArn?: string; cfnRoleArn?: string } {
  const prev = { d: process.env[DEPLOY_ROLE_FLAG], c: process.env[CFN_EXEC_ROLE_FLAG] };
  const set = (key: string, value?: string) => (value === undefined ? delete process.env[key] : (process.env[key] = value));
  set(DEPLOY_ROLE_FLAG, env.deploy);
  set(CFN_EXEC_ROLE_FLAG, env.cfn);
  try {
    const app = new App();
    const stack = new Stack(app, 'S', {
      synthesizer: resolveSynthesizer({}),
      env: { account: '111111111111', region: 'us-west-2' },
    });
    const artifact = app.synth().getStackArtifact(stack.artifactId);
    return { assumeRoleArn: artifact.assumeRoleArn, cfnRoleArn: artifact.cloudFormationExecutionRoleArn };
  } finally {
    set(DEPLOY_ROLE_FLAG, prev.d);
    set(CFN_EXEC_ROLE_FLAG, prev.c);
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

  test('both forced roles thread through together', () => {
    const { assumeRoleArn, cfnRoleArn } = synthWithRoleEnv({ deploy: DEPLOY_ARN, cfn: CFN_ARN });
    expect(assumeRoleArn).toBe(DEPLOY_ARN);
    expect(cfnRoleArn).toBe(CFN_ARN);
  });
});
