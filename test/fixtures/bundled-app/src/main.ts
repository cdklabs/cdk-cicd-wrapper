#!/usr/bin/env node
/**
 * Single-file entrypoint so `bundle.sh` has exactly one esbuild entry.
 *
 * The Autopilot `node -r @cdklabs/cdk-cicd-wrapper/register` preload works by replacing
 * the `App` class on the *live module object* of `aws-cdk-lib/core/lib/app`. Once
 * this file is bundled, `aws-cdk-lib` is inlined into `dist/app.js` and there is no
 * module object left to patch — the preload silently does nothing. That failure mode
 * is what this fixture exists to reproduce (`m2-bundled-diagnostic`), and the
 * documented escape hatch is the explicit `CdkCicd.attach(app)` call.
 */
import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

class BundledStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const runId = process.env.CDK_CICD_TEST_RUN_ID ?? 'local';

    new ssm.StringParameter(this, 'Marker', {
      parameterName: `/cdkcicdtest/${runId}/bundled`,
      stringValue: `cdk-cicd-wrapper bundled fixture, run ${runId}`,
    });
  }
}

const app = new cdk.App();

const runId = process.env.CDK_CICD_TEST_RUN_ID ?? 'local';

new BundledStack(app, `cdkcicdtest-${runId}-bundled`, {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
