// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// m4-nag-compliance: prove AwsSolutionsChecks is actually LIVE against the rendered pipeline, and that
// the pipeline's own plumbing carries no UNSUPPRESSED findings.
//
// This is only meaningful because the jest `moduleNameMapper` (see projenrc/PipelineConfig.ts) forces a
// single aws-cdk-lib copy: cdk-nag's rules match constructs with `instanceof`, which silently misses
// across the two copies this bundled package would otherwise resolve. The CONTROL test below fails if
// that unification ever regresses -- so a "zero findings" result can never be a vacuous green again
// (findings qa-duplicate-aws-cdk-lib-makes-cdk-nag-inert, qa-cdk-nag-compliance-tests-are-vacuous).

import { App, Aspects, Stack } from 'aws-cdk-lib';
import { Annotations, Match } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { AwsSolutionsChecks } from 'cdk-nag';
import { defineCICD } from '../../../../src/v3/config/define';
import { Repository } from '../../../../src/v3/config/repository';
import { CodePipelineEngine } from '../../../../src/v3/engine/codepipeline/CodePipelineEngine';

function pipelineStack(): Stack {
  const stack = new Stack(new App(), 'PipelineStack', { env: { account: '111111111111', region: 'us-west-2' } });
  new CodePipelineEngine().render(stack, {
    config: defineCICD({
      application: 'shop',
      repository: Repository.s3('shop-src/app.zip'),
      stages: ['dev', { name: 'prod', env: { region: 'us-west-1' }, manualApproval: true }],
    }),
    pipelineName: 'shop-pipeline',
  });
  return stack;
}

describe('m4-nag-compliance', () => {
  test('CONTROL: cdk-nag is LIVE here -- a deliberately non-compliant bucket produces an AwsSolutions finding', () => {
    // If the aws-cdk-lib copies drift apart again, cdk-nag goes inert and this bucket produces NOTHING --
    // which would make the zero-findings test below a false green. This test exists to fail first in that
    // case. An unencrypted, non-SSL bucket trips several AwsSolutions-S* rules.
    const stack = new Stack(new App(), 'ControlStack', { env: { account: '111111111111', region: 'us-west-2' } });
    new s3.Bucket(stack, 'Naughty');
    Aspects.of(stack).add(new AwsSolutionsChecks({ verbose: false }));

    Annotations.fromStack(stack).hasError('/ControlStack/Naughty/Resource', Match.stringLikeRegexp('AwsSolutions-'));
  });

  test('the rendered pipeline stack has ZERO unsuppressed AwsSolutions findings', () => {
    const stack = pipelineStack();
    Aspects.of(stack).add(new AwsSolutionsChecks({ verbose: false }));

    // Both error- and warning-level: a warning is still a finding a security review would flag. The
    // engine suppresses the pipeline's own IAM5/S1/L1/etc with evidence; anything left is a real gap.
    const errors = Annotations.fromStack(stack).findError('*', Match.stringLikeRegexp('AwsSolutions-'));
    const warnings = Annotations.fromStack(stack).findWarning('*', Match.stringLikeRegexp('AwsSolutions-'));
    const render = (a: typeof errors) => a.map((e) => `${e.id}: ${JSON.stringify(e.entry.data)}`);
    expect(render(errors)).toEqual([]);
    expect(render(warnings)).toEqual([]);
  });
});
