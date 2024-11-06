import * as path from 'path';
import { IntegTest } from '@aws-cdk/integ-tests-alpha';
import * as cdk from 'aws-cdk-lib';
import { GitHubPipelinePlugin, PipelineBlueprint, RepositorySource } from '../../src';

const app = new cdk.App();

const account = process.env.CDK_INTEG_ACCOUNT; // || '12345678';
const region = process.env.CDK_INTEG_REGION; // || 'test-region';

PipelineBlueprint.builder()
  .applicationName('integ-github')
  .defineStages([
    { stage: 'RES', account, region },
    { stage: 'DEV', account, region },
    // { stage: 'INT', account, region },
  ])
  .plugin(
    new GitHubPipelinePlugin({
      repositoryName: 'cdklabs/cdk-cicd-wrapper',
      workflowPath: path.resolve(
        __dirname,
        'cdk-integ.out.integ.githubplugin.ts.snapshot/.github/workflows/deploy.yml',
      ),
    }),
  )
  .repository(
    RepositorySource.github({
      codeBuildCloneOutput: true,
    }),
  )
  .codeBuildEnvSettings({
    computeType: cdk.aws_codebuild.ComputeType.MEDIUM,
  })
  .addStack({
    provide(context) {
      const stack = new cdk.Stack(context.scope, 'test-stack');

      new cdk.CfnOutput(stack, 'test-output', { value: 'test' });
    },
  })
  .synth(app);

new IntegTest(app, 'IntegGithubPipeline', {
  testCases: app.node.children as cdk.Stack[], // Define a list of cases for this test
  cdkCommandOptions: {
    // Customize the integ-runner parameters
    destroy: {
      args: {
        force: true,
      },
    },
  },
});
