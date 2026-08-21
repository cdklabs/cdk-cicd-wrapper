// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The deploy driver: the Lambda half of D-deploy-wait. The build action prepares CloudFormation change
// sets and exits; this function executes them and waits, so no build compute is billed while
// CloudFormation works.
//
// It is a CodePipeline **asynchronous** action. The contract is: return `PutJobSuccessResult` with a
// `continuationToken` to mean "not finished, invoke me again", plain success to finish the action, and
// `PutJobFailureResult` to fail the stage. The token carries all the state -- which stack we are on and
// whether its change set has been started -- so there is no table to provision, and a retry that loses
// the token simply re-derives it from CloudFormation.
//
// Written as a compiled .ts rather than a plain .js asset because `jsii` does NOT copy non-TypeScript
// files from src/ into lib/ (measured -- the .py assets that appear in lib/ are stale build output), so a
// hand-written .js here would ship as an empty asset. The AWS SDK is `require`d rather than imported: v3
// is present in the Lambda runtime, and taking a dependency on it would put the whole SDK into every
// consumer's install.
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

/** What the build action recorded for us to drive, read from SSM. */
interface DeployPlan {
  /** Stacks in dependency order; each entry is one prepared change set. */
  readonly stacks: Array<{ readonly stackName: string; readonly changeSetName: string; readonly region: string }>;
  /** Role to assume per target account, when the stage deploys somewhere other than the pipeline. */
  readonly assumeRoleArn?: string;
}

/** Position in the plan. Serialized into the CodePipeline continuation token. */
interface Progress {
  readonly index: number;
  readonly started: boolean;
}

const TERMINAL_OK = ['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'IMPORT_COMPLETE'];
const TERMINAL_BAD = [
  'CREATE_FAILED',
  'ROLLBACK_COMPLETE',
  'ROLLBACK_FAILED',
  'UPDATE_ROLLBACK_COMPLETE',
  'UPDATE_ROLLBACK_FAILED',
  'UPDATE_FAILED',
  'DELETE_FAILED',
];

function cfnClient(region: string, credentials?: any): any {
  const { CloudFormationClient } = require('@aws-sdk/client-cloudformation');
  return new CloudFormationClient({ region, credentials });
}

/** Credentials for the target account, or undefined to use the function's own role. */
async function credentialsFor(assumeRoleArn: string | undefined, region: string): Promise<any> {
  if (!assumeRoleArn) return undefined;
  const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
  const sts = new STSClient({ region });
  const out = await sts.send(
    new AssumeRoleCommand({ RoleArn: assumeRoleArn, RoleSessionName: 'cdk-cicd-deploy-driver' }),
  );
  return {
    accessKeyId: out.Credentials.AccessKeyId,
    secretAccessKey: out.Credentials.SecretAccessKey,
    sessionToken: out.Credentials.SessionToken,
  };
}

async function readPlan(parameterName: string, region: string): Promise<DeployPlan> {
  const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
  const ssm = new SSMClient({ region });
  const out = await ssm.send(new GetParameterCommand({ Name: parameterName }));
  return JSON.parse(out.Parameter.Value) as DeployPlan;
}

/**
 * Drive one step of the plan. Returns the next progress to continue with, or undefined when the whole
 * plan is done. Throws to fail the pipeline action.
 */
async function step(plan: DeployPlan, at: Progress, ownRegion: string): Promise<Progress | undefined> {
  const target = plan.stacks[at.index];
  if (target === undefined) return undefined;

  const credentials = await credentialsFor(plan.assumeRoleArn, ownRegion);
  const cfn = cfnClient(target.region, credentials);
  const {
    ExecuteChangeSetCommand,
    DescribeStacksCommand,
    DescribeChangeSetCommand,
  } = require('@aws-sdk/client-cloudformation');

  if (!at.started) {
    // An empty change set is a no-op, not a failure: `cdk deploy` treats "no changes" as success, and so
    // must we, or an unchanged stack would fail the stage.
    const described = await cfn.send(
      new DescribeChangeSetCommand({ StackName: target.stackName, ChangeSetName: target.changeSetName }),
    );
    if (
      described.Status === 'FAILED' &&
      /didn't contain changes|No updates are to be performed/i.test(described.StatusReason ?? '')
    ) {
      return { index: at.index + 1, started: false };
    }
    await cfn.send(new ExecuteChangeSetCommand({ StackName: target.stackName, ChangeSetName: target.changeSetName }));
    return { index: at.index, started: true };
  }

  const stacks = await cfn.send(new DescribeStacksCommand({ StackName: target.stackName }));
  const status: string = stacks.Stacks[0].StackStatus;
  if (TERMINAL_BAD.includes(status)) {
    throw new Error(`${target.stackName} in ${target.region} reached ${status}`);
  }
  if (TERMINAL_OK.includes(status)) {
    return { index: at.index + 1, started: false };
  }
  // Still working -- stay put and be invoked again.
  return at;
}

export async function handler(event: any): Promise<void> {
  const {
    CodePipelineClient,
    PutJobSuccessResultCommand,
    PutJobFailureResultCommand,
  } = require('@aws-sdk/client-codepipeline');
  const job = event['CodePipeline.job'];
  const jobId = job.id;
  const region = process.env.AWS_REGION as string;
  const pipeline = new CodePipelineClient({ region });

  try {
    const params = JSON.parse(job.data.actionConfiguration.configuration.UserParameters);
    const plan = await readPlan(params.planParameterName, region);
    const at: Progress = job.data.continuationToken
      ? (JSON.parse(job.data.continuationToken) as Progress)
      : { index: 0, started: false };

    const next = await step(plan, at, region);
    await pipeline.send(
      new PutJobSuccessResultCommand(
        next === undefined ? { jobId } : { jobId, continuationToken: JSON.stringify(next) },
      ),
    );
  } catch (error) {
    // Fail the action explicitly. Without this the action would hang until CodePipeline's own timeout,
    // which is exactly the "rollback looks like a stall" failure mode this design has to avoid.
    await pipeline.send(
      new PutJobFailureResultCommand({
        jobId,
        failureDetails: { type: 'JobFailed', message: `${(error as Error).message}`.slice(0, 512) },
      }),
    );
  }
}
