// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Renders the M4 CodePipeline from a resolved config and prints a human-readable summary -- the stage
// order, the actions and their run orders, and the CodeBuild project count. Used by the m4-pipeline demo
// so the recording shows the pipeline's SHAPE without a 15-minute live run (that is m4-verify's job).
//
// No AWS: this only synthesizes a template in memory. Reads the compiled engine from lib/, so what the
// demo shows is the built artifact, not the TypeScript source.
/* eslint-disable @typescript-eslint/no-require-imports, no-console */
const path = require('path');

const REPO = path.resolve(__dirname, '../../../..');
const W = path.join(REPO, 'packages/@cdklabs/cdk-cicd-wrapper/lib/v3');
const { App, Stack } = require(path.join(REPO, 'node_modules/aws-cdk-lib'));
const { Template } = require(path.join(REPO, 'node_modules/aws-cdk-lib/assertions'));
const { defineCICD } = require(path.join(W, 'config/define'));
const { Repository } = require(path.join(W, 'config/repository'));
const { CodePipelineEngine } = require(path.join(W, 'engine/codepipeline/CodePipelineEngine'));

const mode = process.argv[2] || 'default';
const config = defineCICD({
  application: 'shop',
  repository: Repository.s3('shop-src/app.zip'),
  stages: ['dev', { name: 'prod', env: { region: 'us-west-1' }, manualApproval: true }],
  ...(mode === 'async' ? { asyncDeploy: true } : {}),
});

const stack = new Stack(new App(), 'PipelineStack', { env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-west-2' } });
new CodePipelineEngine().render(stack, { config, pipelineName: 'shop-pipeline' });
const t = Template.fromStack(stack);

const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0];
console.log('Pipeline stages (each box is a stage; -> is run order):\n');
for (const s of pipeline.Properties.Stages) {
  const actions = [...s.Actions]
    .sort((a, b) => (a.RunOrder || 1) - (b.RunOrder || 1))
    .map((a) => `${a.Name} [${a.ActionTypeId.Category}/${a.ActionTypeId.Provider}]`)
    .join('  ->  ');
  console.log(`  ${s.Name.padEnd(15)} ${actions}`);
}

const projects = Object.keys(t.findResources('AWS::CodeBuild::Project')).length;
const lambdas = Object.keys(t.findResources('AWS::Lambda::Function')).length;
console.log(`\nFootprint: ${projects} CodeBuild project(s)` + (mode === 'async' ? `, ${lambdas} deploy-driver Lambda(s)` : ''));
console.log('           v2 (CDK Pipelines) grew one project per asset per stage -- 100+ on a real app.');
