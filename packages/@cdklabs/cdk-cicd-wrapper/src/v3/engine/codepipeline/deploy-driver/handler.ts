// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The deploy driver: the Lambda half of D-deploy-wait. The build action prepares CloudFormation change
// sets and exits; this function executes them and waits, so no build compute is billed while
// CloudFormation works.
//
// It is a CodePipeline **asynchronous** action. The contract is: return `PutJobSuccessResult` with a
// `continuationToken` to mean "not finished, invoke me again", plain success to finish the action, and
// `PutJobFailureResult` to fail the stage. The token carries the position in the plan.
//
// The step logic is idempotent by DESIGN, not by relying on the token: it reads each change set's
// ExecutionStatus, so a re-invocation that lost the token (CodePipeline's manual "retry failed actions"
// carries none and does not re-run the prepare step) RESUMES rather than re-executing completed change
// sets. `step()` is exported and takes an injected CloudFormation client so it is unit-testable without
// AWS.
//
// Written as a compiled .ts rather than a plain .js asset because `jsii` does NOT copy non-TypeScript
// files from src/ into lib/ (measured -- the .py assets that appear in lib/ are stale build output), so a
// hand-written .js here would ship as an empty asset. The AWS SDK is `require`d rather than imported: v3
// is present in the Lambda runtime, and taking a dependency on it would put the whole SDK into every
// consumer's install.
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

/** What the build action recorded for us to drive, read from SSM. */
export interface DeployPlan {
  /** Stacks in dependency order; each entry is one prepared change set. */
  readonly stacks: Array<{ readonly stackName: string; readonly changeSetName: string; readonly region: string }>;
}

/** Position in the plan. Serialized into the CodePipeline continuation token. */
export interface Progress {
  readonly index: number;
  readonly started: boolean;
}

/** The slice of a CloudFormation client `step()` needs; a fake supplies the same shape in tests. */
export interface CfnClient {
  describeChangeSet(input: {
    StackName: string;
    ChangeSetName: string;
  }): Promise<{ Status?: string; StatusReason?: string; ExecutionStatus?: string }>;
  executeChangeSet(input: { StackName: string; ChangeSetName: string }): Promise<unknown>;
  describeStacks(input: { StackName: string }): Promise<{ Stacks: Array<{ StackStatus: string }> }>;
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

/** True when a change set carries no changes -- `cdk deploy` treats this as success, so we must too. */
function isEmptyChangeSet(described: { Status?: string; StatusReason?: string }): boolean {
  return (
    described.Status === 'FAILED' &&
    /didn't contain changes|No updates are to be performed|The submitted information didn't contain changes/i.test(
      described.StatusReason ?? '',
    )
  );
}

/**
 * Drive one step of the plan. Returns the next progress to continue with, or undefined when the whole
 * plan is done. Throws to fail the pipeline action. `cfnFor` yields a client bound to a stack's region.
 */
export async function step(
  plan: DeployPlan,
  at: Progress,
  cfnFor: (region: string) => CfnClient,
): Promise<Progress | undefined> {
  const target = plan.stacks[at.index];
  if (target === undefined) return undefined;
  const cfn = cfnFor(target.region);

  if (!at.started) {
    const described = await cfn.describeChangeSet({ StackName: target.stackName, ChangeSetName: target.changeSetName });
    // Empty change set: nothing to execute, advance. (cdk treats "no changes" as success.)
    if (isEmptyChangeSet(described)) {
      return { index: at.index + 1, started: false };
    }
    // Idempotent resume: a token-less retry re-enters here with started=false. If this change set was
    // already executed on a previous invocation, DO NOT execute it again (that is InvalidChangeSetStatus)
    // -- treat it as in-flight/done and fall through to the status poll below.
    if (described.ExecutionStatus !== 'EXECUTE_COMPLETE' && described.ExecutionStatus !== 'EXECUTE_IN_PROGRESS') {
      await cfn.executeChangeSet({ StackName: target.stackName, ChangeSetName: target.changeSetName });
    }
    return { index: at.index, started: true };
  }

  const stacks = await cfn.describeStacks({ StackName: target.stackName });
  const status = stacks.Stacks[0].StackStatus;
  if (TERMINAL_BAD.includes(status)) {
    throw new Error(`${target.stackName} in ${target.region} reached ${status}`);
  }
  if (TERMINAL_OK.includes(status)) {
    return { index: at.index + 1, started: false };
  }
  return at; // still working -- stay put and be invoked again
}

async function readPlan(parameterName: string, region: string): Promise<DeployPlan> {
  const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
  const ssm = new SSMClient({ region });
  const out = await ssm.send(new GetParameterCommand({ Name: parameterName }));
  return JSON.parse(out.Parameter.Value) as DeployPlan;
}

/** A real CloudFormation client adapted to the CfnClient shape, bound to `region`. */
function realCfn(region: string): CfnClient {
  const {
    CloudFormationClient,
    DescribeChangeSetCommand,
    ExecuteChangeSetCommand,
    DescribeStacksCommand,
  } = require('@aws-sdk/client-cloudformation');
  const c = new CloudFormationClient({ region });
  return {
    describeChangeSet: (i) => c.send(new DescribeChangeSetCommand(i)),
    executeChangeSet: (i) => c.send(new ExecuteChangeSetCommand(i)),
    describeStacks: (i) => c.send(new DescribeStacksCommand(i)),
  };
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

    const next = await step(plan, at, realCfn);
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
