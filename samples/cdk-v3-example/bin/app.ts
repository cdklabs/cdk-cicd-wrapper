#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The app entry. This is ordinary `cdk init`-shaped CDK: construct your stacks on a plain `App`. There is
// NO wrapper import required here -- `cdk.json` runs this through `cdk-cicd exec`, which injects config and
// tags around it. The only wrapper symbol is the OPT-IN `stageStackName`, used purely to control the CFN
// stack name per stage (and, on a migration, to reproduce a Blueprint name so resources are updated in place, not
// recreated -- see MIGRATION.md).
import * as cdk from 'aws-cdk-lib';
import { stageStackName } from '@cdklabs/cdk-cicd-wrapper';
import { MyStack } from '../lib/stack';

const app = new cdk.App();

new MyStack(app, 'cdk-v3-example', {
  // -> `cdk-v3-example-dev` / `cdk-v3-example-prod`. Migrating from Blueprint? Use
  // `stageStackName('cdk-v3-example', { stageFirst: true, uppercaseStage: true })` to get `DEV-...`.
  stackName: stageStackName('cdk-v3-example'),
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
