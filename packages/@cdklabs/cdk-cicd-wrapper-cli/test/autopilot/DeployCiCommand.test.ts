// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Unit tests for deploy-ci's pure argv/env builders. Provisioning a pipeline end to end (which spawns
// `npm run cdk deploy`, whose `cdk.json` app is `cdk-cicd exec`, which renders the pipeline because
// CDK_CICD_MODE=pipeline is inherited) is proven by the m4-verify real-AWS gate.

import { deployCiArgs, deployCiEnv } from '../../src/cmds/autopilot/DeployCiCommand';

describe('m4-approval-selfupdate: deployCiArgs', () => {
  test('deploys via `npm run cdk deploy --all` -- no `--app` override, no npx', () => {
    // The single cdk.json entry (`cdk-cicd exec`) renders the pipeline when CDK_CICD_MODE=pipeline is
    // set (see deployCiEnv); deploy-ci never overrides `--app`. `npm run cdk`, never npx.
    expect(deployCiArgs()).toEqual(['run', 'cdk', 'deploy', '--all', '--require-approval', 'never']);
  });

  test('the argv is identical for every engine -- the engine never changes the command', () => {
    // Convergence: the mode signal (env), not the argv, decides app-vs-pipeline, uniformly.
    expect(deployCiArgs('ci')).toEqual(deployCiArgs('cd'));
  });

  test('never emits `--app` or `npx`', () => {
    const args = deployCiArgs();
    expect(args).not.toContain('--app');
    expect(args.some((a) => a.includes('npx'))).toBe(false);
    expect(args.some((a) => a.includes('pipeline-app'))).toBe(false);
  });
});

describe('m4-approval-selfupdate: deployCiEnv', () => {
  test('signals pipeline mode so the single `cdk-cicd exec` entry renders the pipeline', () => {
    expect(deployCiEnv(false)).toEqual({ CDK_CICD_MODE: 'pipeline' });
  });

  test('--disposable is carried as an env flag (not an argv flag cdk would reject)', () => {
    expect(deployCiEnv(true)).toEqual({ CDK_CICD_MODE: 'pipeline', CDK_CICD_DISPOSABLE: '1' });
  });
});
