// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The throwaway app behind test/proof/devops-agent-verify.sh: a versioned S3 source bucket, and a flat
// CodePipeline (the wrapper's CodePipelineEngine, built from this checkout) whose Build fails on purpose,
// with `devopsAgent` pointing at the proof's Agent Space. Both stacks carry the harness's disposable tag.
//
// Inputs come from the environment the proof script exports: CDK_CICD_TEST_RUN_ID, CDK_CICD_TEST_ACCOUNT,
// PROOF_REGION, PROOF_AGENT_SPACE_ID.

const path = require('path');

// aws-cdk-lib from where the wrapper resolves it, so the app and the wrapper share one copy of it even if
// the repo root's and the package's copies ever differ.
const wrapperDir = path.dirname(require.resolve('@cdklabs/cdk-cicd-wrapper/package.json'));
const fromWrapper = (id) => require(require.resolve(id, { paths: [wrapperDir] }));
const { App, RemovalPolicy, Stack } = fromWrapper('aws-cdk-lib');
const s3 = fromWrapper('aws-cdk-lib/aws-s3');
const w = require('@cdklabs/cdk-cicd-wrapper');

const need = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`devops-agent-app: ${name} is not set`);
  return value;
};
const run = need('CDK_CICD_TEST_RUN_ID');
const env = { account: need('CDK_CICD_TEST_ACCOUNT'), region: need('PROOF_REGION') };
const tags = { 'cdk-cicd-wrapper-test': run };

const app = new App();

const sourceStack = new Stack(app, `cdkcicdtest-${run}-devopssrc`, { env, tags });
const bucketName = `cdkcicdtest-${run}-devopssrc-${env.account}`;
new s3.Bucket(sourceStack, 'Source', {
  bucketName,
  versioned: true, // the CodePipeline S3 source requires it
  encryption: s3.BucketEncryption.S3_MANAGED,
  enforceSSL: true,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  removalPolicy: RemovalPolicy.DESTROY,
  autoDeleteObjects: true,
});

const pipelineStack = new Stack(app, `cdkcicdtest-${run}-devopspipeline`, { env, tags });
new w.CodePipelineEngine({ removalPolicy: RemovalPolicy.DESTROY }).render(pipelineStack, {
  config: w.defineCICD({
    application: `cdkcicdtest-${run}`,
    qualifier: 'hnb659fds', // the account's default bootstrap
    repository: w.Repository.s3(`${bucketName}/source.zip`),
    stages: ['dev'],
    // Fail Build on purpose, the way a broken commit does: the source holds no package.json, so `npm ci`
    // fails -- a real error for DevOps Agent to find in the build log. The sleep keeps the failure after the
    // forwarder's EventBridge rule exists: CloudFormation creates the rule after the pipeline, and a new
    // pipeline starts its first run at once.
    ci: { steps: { install: 'sleep 60 && npm ci' } },
    // Two of the three levels. changeRiskAnalysis needs a GitHub/GitLab repository connected to the Agent
    // Space, which an S3-sourced throwaway pipeline cannot have.
    devopsAgent: { agentSpaceId: need('PROOF_AGENT_SPACE_ID'), investigations: {}, knowledge: {} },
  }),
  pipelineName: `cdkcicdtest-${run}-devops`,
});
