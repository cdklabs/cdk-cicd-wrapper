#!/usr/bin/env node
// The deployer image app for container-pipeline-verify (Repo 1). Its ONLY environment-specific value is
// `greeting`, read from the stage configuration with the image's own schema. Repo 2 supplies that
// configuration per target, so the image declares no stages and carries no environment knowledge.
//
// One stack per stage: `cdkcicdtest-<run-id>-<stage>-r2`, holding an SSM parameter whose value is the
// configured greeting -- which is what the gate reads back to prove which configuration was deployed.
import * as fs from 'fs';
import * as path from 'path';
import { AppConfig, FieldKind } from '@cdklabs/cdk-cicd-wrapper';
import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';

interface FixtureConfig {
  readonly greeting: string;
}

const runId: string = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'run.json'), 'utf-8')).runId;
const stage = (process.env.CDK_STAGE ?? 'local').trim() || 'local';

const app = new cdk.App();
const config: FixtureConfig = AppConfig.of(app, {
  schema: { requiredKeys: [{ path: 'greeting', kind: FieldKind.STRING }] },
});

const stack = new cdk.Stack(app, `cdkcicdtest-${runId}-${stage.toLowerCase()}-r2`, {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
new ssm.StringParameter(stack, 'Greeting', {
  parameterName: `/cdkcicdtest/${runId}/${stage}/greeting`,
  stringValue: config.greeting,
});
// The teardown guard only deletes stacks that carry this tag.
cdk.Tags.of(stack).add('cdk-cicd-wrapper-test', runId);
