// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as path from 'path';
import { ResolvedCicdConfig } from '@cdklabs/cdk-cicd-wrapper';
import { synthTargets } from '../../src/cmds/v3/SynthCommand';

// A minimal resolved config: one single-region stage, one multi-region stage.
const CONFIG = {
  repository: {} as any,
  synthesizer: { type: 'default' as any },
  stages: [
    { name: 'dev', env: { account: '111111111111', regions: ['us-west-2'], regionOrder: 'sequential' as any }, manualApproval: false },
    { name: 'prod', env: { account: '222222222222', regions: ['us-west-1', 'eu-west-1'], regionOrder: 'sequential' as any }, manualApproval: true },
  ],
} as unknown as ResolvedCicdConfig;

describe('m3-synth: synthTargets', () => {
  test('--all enumerates every stage x region, in config order', () => {
    const targets = synthTargets(CONFIG);
    expect(targets.map((t) => `${t.stage}/${t.region}`)).toEqual([
      'dev/us-west-2',
      'prod/us-west-1',
      'prod/eu-west-1',
    ]);
  });

  test('a single stage yields only that stage regions', () => {
    expect(synthTargets(CONFIG, 'prod').map((t) => t.region)).toEqual(['us-west-1', 'eu-west-1']);
    expect(synthTargets(CONFIG, 'nope')).toEqual([]);
  });

  test('each target carries the per-region env and a segregated output dir', () => {
    const [, prodUsW1] = synthTargets(CONFIG);
    expect(prodUsW1.outDir).toBe(path.join('cdk.out', 'prod', 'us-west-1'));
    expect(prodUsW1.env).toEqual({
      CDK_STAGE: 'prod',
      CDK_DEFAULT_ACCOUNT: '222222222222',
      CDK_DEPLOY_ACCOUNT: '222222222222',
      CDK_DEFAULT_REGION: 'us-west-1',
      CDK_DEPLOY_REGION: 'us-west-1',
      // steer the CDK CLI's own region derivation, not just the app's CDK_DEFAULT_REGION
      AWS_REGION: 'us-west-1',
      AWS_DEFAULT_REGION: 'us-west-1',
    });
  });
});
