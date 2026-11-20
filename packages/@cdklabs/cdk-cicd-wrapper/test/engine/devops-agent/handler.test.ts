// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  ActionFailedEvent,
  BacklogTaskRequest,
  buildBacklogTask,
  consoleHost,
  forward,
  ForwarderSettings,
  handler,
} from '../../../src/engine/devops-agent/forwarder/handler';

const SETTINGS: ForwarderSettings = {
  agentSpaceId: 'as-123',
  investigationPriority: 'HIGH',
};

// Shape from the CodePipeline user guide's `Action Execution State Change` example.
function failedEvent(overrides: Partial<ActionFailedEvent['detail']> = {}): ActionFailedEvent {
  return {
    account: '111111111111',
    region: 'eu-west-1',
    time: '2026-11-19T10:00:00Z',
    detail: {
      pipeline: 'shop-pipeline',
      'execution-id': '12345678-1234-5678-abcd-12345678abcd',
      stage: 'Deploy-prod',
      action: 'Deploy',
      state: 'FAILED',
      region: 'eu-west-1',
      'pipeline-execution-attempt': 1,
      type: { category: 'Build', provider: 'CodeBuild' },
      'execution-result': {
        'external-execution-summary': 'Build terminated with state: FAILED',
        'external-execution-url': 'https://eu-west-1.console.aws.amazon.com/codesuite/codebuild/projects/x/build/y',
        'error-code': 'JobFailed',
      },
      ...overrides,
    },
  };
}

describe('DevOps Agent forwarder handler', () => {
  test('opens one HIGH-priority investigation that names the failed stage and action', () => {
    const task = buildBacklogTask(failedEvent(), 'as-123', 'HIGH');
    expect(task).toMatchObject({ agentSpaceId: 'as-123', taskType: 'INVESTIGATION', priority: 'HIGH' });
    expect(task.title).toBe('Pipeline shop-pipeline failed at Deploy-prod / Deploy');
    expect(task.description).toContain('Pipeline execution: 12345678-1234-5678-abcd-12345678abcd (attempt 1)');
    expect(task.description).toContain('Action: Deploy (Build / CodeBuild)');
    expect(task.description).toContain('Summary: Build terminated with state: FAILED');
    expect(task.description).toContain('Error code: JobFailed');
    expect(task.description).toContain(
      'https://eu-west-1.console.aws.amazon.com/codesuite/codepipeline/pipelines/shop-pipeline/executions/' +
        '12345678-1234-5678-abcd-12345678abcd/timeline?region=eu-west-1',
    );
  });

  test('the clientToken is keyed on the action execution when the event carries one', () => {
    const a = buildBacklogTask(failedEvent({ 'action-execution-id': 'aaaa' }), 'as-123', 'HIGH').clientToken;
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    const retried = failedEvent({ 'action-execution-id': 'aaaa', 'pipeline-execution-attempt': 9 });
    expect(buildBacklogTask(retried, 'as-123', 'HIGH').clientToken).toBe(a);
    expect(buildBacklogTask(failedEvent({ 'action-execution-id': 'bbbb' }), 'as-123', 'HIGH').clientToken).not.toBe(a);
  });

  test('console links use the partition of the Region', () => {
    expect(consoleHost('eu-west-1')).toBe('eu-west-1.console.aws.amazon.com');
    expect(consoleHost('us-gov-west-1')).toBe('us-gov-west-1.console.amazonaws-us-gov.com');
    expect(consoleHost('cn-north-1')).toBe('cn-north-1.console.amazonaws.cn');
    const gov = buildBacklogTask({ ...failedEvent(), region: 'us-gov-west-1' }, 'as-123', 'HIGH');
    expect(gov.description).toContain('https://us-gov-west-1.console.amazonaws-us-gov.com/codesuite/codepipeline/');
  });

  test('the clientToken is stable per execution attempt and action, and fits the API pattern', () => {
    const token = buildBacklogTask(failedEvent(), 'as-123', 'HIGH').clientToken;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(buildBacklogTask(failedEvent(), 'as-123', 'HIGH').clientToken).toBe(token);
    expect(buildBacklogTask(failedEvent({ 'pipeline-execution-attempt': 2 }), 'as-123', 'HIGH').clientToken).not.toBe(
      token,
    );
    expect(buildBacklogTask(failedEvent({ action: 'Prepare' }), 'as-123', 'HIGH').clientToken).not.toBe(token);
  });

  test('clips title and description to the CreateBacklogTask limits', () => {
    const task = buildBacklogTask(
      failedEvent({ stage: 'S'.repeat(500), 'execution-result': { 'external-execution-summary': 'x'.repeat(20000) } }),
      'as-123',
      'HIGH',
    );
    expect(task.title.length).toBe(400);
    expect(task.description.length).toBe(10000);
  });

  test('tolerates an event without optional fields', () => {
    const event: ActionFailedEvent = {
      account: '111111111111',
      region: 'eu-west-1',
      detail: { pipeline: 'p', 'execution-id': 'e', stage: 's', action: 'a', state: 'FAILED' },
    };
    const task = buildBacklogTask(event, 'as-123', 'HIGH');
    expect(task.description).toContain('(unknown category / unknown provider)');
    expect(task.description).toContain('Pipeline execution: e\n'); // no attempt is claimed when the event has none
  });

  function clients(sent: BacklogTaskRequest[]) {
    return { createBacklogTask: async (request: BacklogTaskRequest) => sent.push(request) };
  }

  test('a failed action opens an investigation at the configured priority; other states open nothing', async () => {
    const sent: BacklogTaskRequest[] = [];
    await forward(failedEvent({ state: 'SUCCEEDED' }), SETTINGS, clients(sent));
    expect(sent).toHaveLength(0);
    await forward(failedEvent({ type: { category: 'Approval', provider: 'Manual' } }), SETTINGS, clients(sent));
    expect(sent).toHaveLength(0); // a rejected approval is a decision, not an incident
    await forward(
      failedEvent({ state: 'STARTED', type: { category: 'Approval', provider: 'Manual' } }),
      SETTINGS,
      clients(sent),
    );
    expect(sent).toHaveLength(0); // an approval that starts is not an event the forwarder acts on
    await forward(failedEvent(), { ...SETTINGS, investigationPriority: 'CRITICAL' }, clients(sent));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ taskType: 'INVESTIGATION', priority: 'CRITICAL' });
  });

  test('a client error propagates, so EventBridge retries the invocation', async () => {
    const failing = {
      createBacklogTask: async () => {
        throw new Error('ThrottlingException');
      },
    };
    await expect(forward(failedEvent(), SETTINGS, failing)).rejects.toThrow('ThrottlingException');
  });

  test('the handler says so when the Lambda runtime lacks the DevOps Agent client', async () => {
    const saved = { ...process.env };
    process.env.AGENT_SPACE_ID = 'as-123';
    process.env.AGENT_SPACE_REGION = 'eu-west-1';
    process.env.INVESTIGATION_PRIORITY = 'HIGH';
    try {
      await jest.isolateModulesAsync(async () => {
        jest.doMock(
          '@aws-sdk/client-devops-agent',
          () => {
            throw new Error("Cannot find module '@aws-sdk/client-devops-agent'");
          },
          { virtual: true },
        );
        const isolated = await import('../../../src/engine/devops-agent/forwarder/handler');
        await expect(isolated.handler(failedEvent())).rejects.toThrow(
          /runtime does not provide @aws-sdk\/client-devops-agent/,
        );
      });
    } finally {
      process.env = saved;
    }
  });

  test('the handler refuses to run without its configuration', async () => {
    const saved = { ...process.env };
    delete process.env.AGENT_SPACE_ID;
    delete process.env.AGENT_SPACE_REGION;
    try {
      await expect(handler(failedEvent())).rejects.toThrow(
        /needs AGENT_SPACE_ID, AGENT_SPACE_REGION and INVESTIGATION_PRIORITY/,
      );
    } finally {
      process.env = saved;
    }
  });
});
