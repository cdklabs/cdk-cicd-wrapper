#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Fixture: a plain v3 app whose one stack owns a DynamoDB **global table** (TableV2) replicated into a
// second region. It exists to prove the v3 deploy path provisions a multi-region global table from a
// single stage deploy -- the replica is created cross-region by the deploy of the primary-region stack.
import * as cdk from 'aws-cdk-lib';
import { GlobalDdbStack } from '../lib/stack';

const app = new cdk.App();
const runId = process.env.CDK_CICD_TEST_RUN_ID ?? 'local';

new GlobalDdbStack(app, `cdkcicdtest-${runId}-global-ddb`, {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
