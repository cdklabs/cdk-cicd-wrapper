#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { Level0Stack } from '../lib/level0-stack';

const app = new cdk.App();

// Disposable stack name. `CDK_CICD_TEST_RUN_ID` is injected by the harness; the
// fallback keeps a bare `npx cdk synth` working for a human.
const runId = process.env.CDK_CICD_TEST_RUN_ID ?? 'local';

new Level0Stack(app, `cdkcicdtest-${runId}-level0`, {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});
