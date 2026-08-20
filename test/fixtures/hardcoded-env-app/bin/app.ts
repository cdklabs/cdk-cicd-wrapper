#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { HardcodedEnvStack } from '../lib/hardcoded-env-stack';

const app = new cdk.App();

const runId = process.env.CDK_CICD_TEST_RUN_ID ?? 'local';

new HardcodedEnvStack(app, `cdkcicdtest-${runId}-hardcoded-env`, {
  /* THE POINT OF THIS FIXTURE.
   *
   * A hardcoded env that disagrees with the stage the wrapper is deploying.
   * `000000000000` is a deliberately impossible placeholder account — it is NEVER
   * the real test account, and it must stay a placeholder so this fixture can
   * never accidentally deploy anywhere real.
   *
   * M3 drift rule (`m3-drift-rule`):
   *   region  mismatch -> warn and continue
   *   account mismatch -> error and stop
   */
  env: { account: '000000000000', region: 'eu-west-1' },
});
