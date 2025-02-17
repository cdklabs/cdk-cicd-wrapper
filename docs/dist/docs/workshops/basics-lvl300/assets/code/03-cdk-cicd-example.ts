#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as wrapper from '@cdklabs/cdk-cicd-wrapper';
import { DemoStack } from '../lib/demo-stack';

const app = new cdk.App();

wrapper.PipelineBlueprint.builder()
  .defineStages([
    { stage: wrapper.Stage.RES, account: process.env.AWS_ACCOUNT_ID },
    { stage: wrapper.Stage.DEV, account: process.env.AWS_ACCOUNT_ID },
  ])
  .workbench({
    provide(context) {
      new DemoStack(context.scope, 'DemoStack', { env: context.environment });
    },
  })
  .synth(app);
