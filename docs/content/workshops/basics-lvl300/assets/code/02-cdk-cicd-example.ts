#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as wrapper from '@cdklabs/cdk-cicd-wrapper';

const app = new cdk.App();

wrapper.PipelineBlueprint.builder()
  .defineStages([
    { stage: wrapper.Stage.RES, account: process.env.AWS_ACCOUNT_ID },
  ])
  .synth(app);
