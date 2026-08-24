#!/usr/bin/env node
// Fixture for m9-migrate-github-actions-engine's real-AWS deploy-verify pass. Deploys the wrapper's
// own `GitHubActionsEngine` top-level stack -- the GitHubActionRole + OIDC provider it creates is the
// ONLY real AWS resource `deploy-ci` provisions for this engine, since the rendered workflow itself is
// a plain-text YAML file on disk, not a CloudFormation resource. The engine's per-stage app stacks
// (nested `cdk.Stage` children) are never requested by the harness's `cdk deploy <stack>`, so they need
// no real deployable content of their own -- see `lib/stub-stages.ts`.
import * as os from 'os';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { GitHubActionsEngine, Repository, defineCICD } from '@cdklabs/cdk-cicd-wrapper';
import { StubStages } from '../lib/stub-stages';

const runId = process.env.CDK_CICD_TEST_RUN_ID ?? 'local';

const app = new cdk.App();
const stack = new cdk.Stack(app, `cdkcicdtest-${runId}-github-actions`, {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

// The rendered workflow YAML embeds the account id as a literal string (see GitHubActionsEngine's own
// comment on why); write it to a scratch dir OUTSIDE the repo, same as the engine's unit tests do, so
// no account id ever lands in a committed file.
const workflowDir = path.join(os.tmpdir(), `cdkcicdtest-${runId}-github-actions-workflow`);

new GitHubActionsEngine(stack, 'Cd', {
  config: defineCICD({
    application: `cdkcicdtest-${runId}`,
    repository: Repository.github('cdklabs/cdk-cicd-wrapper-test-fixture'),
    stages: ['dev'],
    githubActions: { workflowPath: path.join(workflowDir, '.github', 'workflows', 'deploy.yml') },
  }),
  stages: new StubStages(runId),
});

// The marker `harness.sh assert` reads back -- proves this stack (the wrapper's GitHubActionRole/OIDC
// provider construct, deployed for real) actually rolled out, not just that `cdk deploy` exited 0.
new ssm.StringParameter(stack, 'Marker', {
  parameterName: `/cdkcicdtest/${runId}/github-actions`,
  stringValue: `cdk-cicd-wrapper github-actions fixture, run ${runId}`,
});
