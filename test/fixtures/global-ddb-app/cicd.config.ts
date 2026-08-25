// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The pipeline config for the global-DDB fixture. One dev stage in the primary test region; the global
// table's replica lands in the secondary region (see lib/stack.ts). Account reads from the environment.
import { defineCICD, Repository } from '@cdklabs/cdk-cicd-wrapper';

export default defineCICD({
  application: 'global-ddb',
  repository: Repository.github('cdklabs/cdk-cicd-wrapper-fixture'),
  stages: [
    {
      name: 'dev',
      env: {
        account: process.env.CDK_CICD_TEST_ACCOUNT!,
        region: process.env.CDK_CICD_TEST_REGION_PRIMARY ?? 'us-west-2',
      },
    },
  ],
});
