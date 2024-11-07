#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as wrapper from '@cdklabs/cdk-cicd-wrapper';
import { HelloWorldProvider } from './hello-world-provider';

const app = new cdk.App();
wrapper.PipelineBlueprint.builder()
  .region('eu-central-1')
  .defineStages([
    { stage: wrapper.Stage.RES, account: '<your AWS account id>' },
    { stage: wrapper.Stage.DEV, account: '<your AWS account id>' },
  ])
  .plugin(new wrapper.GitHubPipelinePlugin({
    repositoryName: '<your GitHub repository>',
  }))
  .addStack(new HelloWorldProvider())
  .synth(app);