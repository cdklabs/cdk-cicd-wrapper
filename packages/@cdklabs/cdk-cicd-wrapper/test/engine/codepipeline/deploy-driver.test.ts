// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Unit tests for the deploy driver's step machine. `step()` takes an injected CloudFormation client, so
// these run with a fake -- no AWS. The full path is exercised by m4-verify with asyncDeploy: true.

import { CfnClient, DeployPlan, Progress, step } from '../../../src/engine/codepipeline/deploy-driver/handler';

/** A fake CloudFormation client that records calls and returns scripted responses per stack. */
function fakeCfn(responses: { [stack: string]: { changeSet?: any; stacks?: Array<{ StackStatus: string }> } }): {
  client: CfnClient;
  executed: string[];
} {
  const executed: string[] = [];
  const client: CfnClient = {
    describeChangeSet: async ({ StackName }) =>
      responses[StackName]?.changeSet ?? { Status: 'CREATE_COMPLETE', ExecutionStatus: 'AVAILABLE' },
    executeChangeSet: async ({ StackName }) => {
      executed.push(StackName);
      return {};
    },
    describeStacks: async ({ StackName }) => ({
      Stacks: responses[StackName]?.stacks ?? [{ StackStatus: 'CREATE_COMPLETE' }],
    }),
  };
  return { client, executed };
}

const plan = (...names: string[]): DeployPlan => ({
  stacks: names.map((stackName) => ({ stackName, changeSetName: 'cs', region: 'us-west-2' })),
});
const start: Progress = { index: 0, started: false };

describe('m4-deploy-observer: step()', () => {
  test('executes a change set, then advances only once the stack reaches a terminal-OK status', async () => {
    const { client, executed } = fakeCfn({ A: { stacks: [{ StackStatus: 'CREATE_IN_PROGRESS' }] } });

    // First call executes and marks started -- but does NOT advance while CFN is still working.
    const afterExec = await step(plan('A', 'B'), start, () => client);
    expect(executed).toEqual(['A']);
    expect(afterExec).toEqual({ index: 0, started: true });

    // Same index, still in progress -> stay put (this is the "invoke me again" continuation).
    const stillWorking = await step(plan('A', 'B'), afterExec!, () => client);
    expect(stillWorking).toEqual({ index: 0, started: true });
  });

  test('a terminal-OK stack advances to the next entry; the last one finishes the plan', async () => {
    const { client } = fakeCfn({});
    expect(await step(plan('A', 'B'), { index: 0, started: true }, () => client)).toEqual({ index: 1, started: false });
    // index past the end -> undefined = the whole plan is done.
    expect(await step(plan('A', 'B'), { index: 2, started: false }, () => client)).toBeUndefined();
  });

  test('a rollback/terminal-bad status throws, so the pipeline action fails instead of hanging', async () => {
    const { client } = fakeCfn({ A: { stacks: [{ StackStatus: 'ROLLBACK_COMPLETE' }] } });
    await expect(step(plan('A'), { index: 0, started: true }, () => client)).rejects.toThrow(/ROLLBACK_COMPLETE/);
  });

  test('an empty change set is a no-op: advance without executing (cdk treats no-changes as success)', async () => {
    const { client, executed } = fakeCfn({
      A: { changeSet: { Status: 'FAILED', StatusReason: "The submitted information didn't contain changes." } },
    });
    expect(await step(plan('A', 'B'), start, () => client)).toEqual({ index: 1, started: false });
    expect(executed).toEqual([]); // never executed the empty change set
  });

  test('idempotent resume: a token-less retry does NOT re-execute an already-executed change set', async () => {
    // CodePipeline "retry failed actions" carries no continuation token, so the driver re-enters at
    // {index:0, started:false}. If it blindly re-executed, that is InvalidChangeSetStatus -> stuck.
    const { client, executed } = fakeCfn({
      A: { changeSet: { Status: 'CREATE_COMPLETE', ExecutionStatus: 'EXECUTE_COMPLETE' } },
    });
    const next = await step(plan('A', 'B'), start, () => client);
    expect(executed).toEqual([]); // skipped -- already executed
    expect(next).toEqual({ index: 0, started: true }); // falls through to the status poll
  });

  test('the region on each entry selects the client -- a multi-region plan hits both', async () => {
    const seen: string[] = [];
    const cfnFor = (region: string): CfnClient => {
      seen.push(region);
      return {
        describeChangeSet: async () => ({ Status: 'CREATE_COMPLETE', ExecutionStatus: 'AVAILABLE' }),
        executeChangeSet: async () => ({}),
        describeStacks: async () => ({ Stacks: [{ StackStatus: 'CREATE_COMPLETE' }] }),
      };
    };
    const p: DeployPlan = {
      stacks: [
        { stackName: 'A', changeSetName: 'cs', region: 'us-west-2' },
        { stackName: 'B', changeSetName: 'cs', region: 'us-west-1' },
      ],
    };
    await step(p, { index: 1, started: false }, cfnFor);
    expect(seen).toEqual(['us-west-1']); // entry 1 is the us-west-1 stack
  });
});
