// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Unit tests for deploy-ci's pure argv builder. Actually provisioning a pipeline (which spawns cdk,
// which spawns `cdk-cicd pipeline-app`) is proven end to end by the m4-verify real-AWS gate.

import { deployCiArgs, pipelineAppCommand } from '../../src/cmds/v3/DeployCiCommand';

describe('m4-approval-selfupdate: deployCiArgs', () => {
  test('deploys the pipeline by pointing cdk at the pipeline-app command', () => {
    // The `--app` value is what makes provisioning zero-touch: no file in the user's repo is named.
    expect(deployCiArgs(false)).toEqual([
      'cdk',
      'deploy',
      '--app',
      'npx cdk-cicd pipeline-app',
      '--all',
      '--require-approval',
      'never',
    ]);
  });

  test('--disposable is forwarded into the app command, not to cdk itself', () => {
    // cdk would reject an unknown option outright; the flag has to travel inside the --app string, and
    // it is the app -- not cdk -- that acts on it.
    expect(pipelineAppCommand(true)).toEqual('npx cdk-cicd pipeline-app --disposable');
    expect(deployCiArgs(true)).toContain('npx cdk-cicd pipeline-app --disposable');
    expect(deployCiArgs(true).filter((a) => a.startsWith('--'))).toEqual(['--app', '--all', '--require-approval']);
  });

  test('the app command is a single argv element, so it survives being handed to cdk', () => {
    // Split on the space it contains and cdk would read "cdk-cicd" as a stack name -- and deploy it.
    const args = deployCiArgs(true);
    expect(args[args.indexOf('--app') + 1]).toEqual(pipelineAppCommand(true));
    expect(args.filter((a) => a.includes('pipeline-app'))).toHaveLength(1);
  });
});
