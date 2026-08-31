// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Unit tests for `cdk-cicd list-ci`'s pure logic. Actually synthesizing the pipeline app (which needs
// aws-cdk-lib, and for a self-mutating engine replays the bin) is exercised by the shared
// `renderPipelineApp` path and the m4-verify gate, not here.

import { resourceCounts } from '../../src/cmds/autopilot/ListCiCommand';

describe('list-ci: resourceCounts', () => {
  test('counts resources by CloudFormation type', () => {
    const template = {
      Resources: {
        A: { Type: 'AWS::S3::Bucket' },
        B: { Type: 'AWS::S3::Bucket' },
        C: { Type: 'AWS::IAM::Role' },
      },
    };
    expect(resourceCounts(template)).toEqual({ 'AWS::S3::Bucket': 2, 'AWS::IAM::Role': 1 });
  });

  test('an empty or Resources-less template yields no counts', () => {
    expect(resourceCounts({})).toEqual({});
    expect(resourceCounts({ Resources: {} })).toEqual({});
  });

  test('a resource with no Type is bucketed as unknown rather than dropped', () => {
    expect(resourceCounts({ Resources: { X: {} } })).toEqual({ '(unknown)': 1 });
  });
});
