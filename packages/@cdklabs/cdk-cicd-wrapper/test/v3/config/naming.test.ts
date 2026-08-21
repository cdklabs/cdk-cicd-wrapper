// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { stageStackName } from '../../../src/v3/config/naming';

describe('m5: stageStackName', () => {
  const saved = process.env.CDK_STAGE;
  afterEach(() => {
    if (saved === undefined) delete process.env.CDK_STAGE;
    else process.env.CDK_STAGE = saved;
  });

  test('new-project default: base-<stage>, lowercased, reading CDK_STAGE', () => {
    process.env.CDK_STAGE = 'dev';
    expect(stageStackName('myapp')).toBe('myapp-dev');
  });

  test('reproduces the v2 deployed name (<STAGE>-base) so a migration updates in place', () => {
    // v2 nested stacks in AppStage(cdk.Stage), so CloudFormation deployed `DEV-myapp`. Matching that name
    // is what makes the v3 deploy an in-place UPDATE rather than a new stack that orphans the old one.
    process.env.CDK_STAGE = 'dev';
    expect(stageStackName('myapp', { stageFirst: true, uppercaseStage: true })).toBe('DEV-myapp');
  });

  test('an explicit stage wins over the environment', () => {
    process.env.CDK_STAGE = 'dev';
    expect(stageStackName('myapp', { stage: 'prod' })).toBe('myapp-prod');
  });

  test('no stage context returns the base unchanged, never `myapp-undefined`', () => {
    delete process.env.CDK_STAGE;
    expect(stageStackName('myapp')).toBe('myapp');
    expect(stageStackName('myapp', { stage: '' })).toBe('myapp');
  });

  test('the separator is configurable', () => {
    expect(stageStackName('myapp', { stage: 'dev', separator: '/' })).toBe('myapp/dev');
  });
});
