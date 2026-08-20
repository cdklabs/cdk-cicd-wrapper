#!/usr/bin/env node
// The application the m4 pipeline deploys. Deliberately trivial -- one SSM parameter -- so the gate
// asserts "the pipeline really deployed this stage's stack" without any app-specific machinery. The
// stack is `cdkcicdtest-<run-id>-app`, distinct from the `cdkcicdtest-<run-id>-pipeline` stack that
// deploy-ci provisions, and both carry the cdkcicdtest- prefix the teardown guard requires.
//
// The run id comes from the bundle's run.json, NOT the environment -- see lib/run-id.ts for why.
import * as cdk from 'aws-cdk-lib';
import { runId } from '../lib/run-id';
import { PipelineFixtureStack } from '../lib/stack';

const app = new cdk.App();

new PipelineFixtureStack(app, `cdkcicdtest-${runId()}-app`, {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
