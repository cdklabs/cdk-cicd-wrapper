#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { Level1Stack } from '../lib/level1-stack';

const app = new cdk.App();

const runId = process.env.CDK_CICD_TEST_RUN_ID ?? 'local';

new Level1Stack(app, `cdkcicdtest-${runId}-level1`, {
  /* Deliberately identical to level0-app: the ONLY difference between the two
   * fixtures is the presence of `cicd.config.ts` + `config/`. That is what makes
   * "wrapper inert without a config file" vs "wrapper active with one" a clean
   * A/B comparison. */
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
