// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The DevOps Agent forwarder: an EventBridge target that turns a failed CodePipeline action (an `Action
// Execution State Change` event in state FAILED) into a DevOps Agent INVESTIGATION with CreateBacklogTask.
// DevOps Agent has no CodePipeline connector, so this is the documented integration path:
// EventBridge -> Lambda -> CreateBacklogTask.
//
// Each task's clientToken is derived from the action execution, so a redelivered event or a retried
// invocation asks for the same task again rather than a new one. (The API documents the token as an
// idempotency token; it does not state how long it is remembered.)
//
// Compiled .ts rather than a .js asset, and the SDK `require`d rather than imported, for the same
// reasons as the deploy driver (../../codepipeline/deploy-driver/handler.ts): jsii copies no .js from
// src/, and a static SDK import would put the client into every consumer's install.
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { createHash } from 'crypto';

/** The `detail` of a `CodePipeline Action Execution State Change` event, as far as the forwarder reads it. */
export interface ActionExecutionDetail {
  readonly pipeline: string;
  readonly 'execution-id': string;
  readonly 'action-execution-id'?: string;
  readonly stage: string;
  readonly action: string;
  readonly state: string;
  readonly region?: string;
  readonly 'pipeline-execution-attempt'?: number;
  readonly type?: { readonly category?: string; readonly provider?: string };
  readonly 'execution-result'?: {
    readonly 'external-execution-summary'?: string;
    readonly 'external-execution-url'?: string;
    readonly 'error-code'?: string;
  };
}

export interface ActionFailedEvent {
  readonly account: string;
  readonly region: string;
  readonly time?: string;
  readonly detail: ActionExecutionDetail;
}

/** The CreateBacklogTask request this forwarder sends. */
export interface BacklogTaskRequest {
  readonly agentSpaceId: string;
  readonly taskType: 'INVESTIGATION';
  readonly priority: string;
  readonly title: string;
  readonly description: string;
  readonly clientToken: string;
}

/** The slice of the DevOps Agent client the forwarder needs; tests supply a fake. */
export interface ForwarderClients {
  createBacklogTask(request: BacklogTaskRequest): Promise<unknown>;
}

/** What the function was configured with (its environment). */
export interface ForwarderSettings {
  readonly agentSpaceId: string;
  readonly investigationPriority: string;
}

// CreateBacklogTask limits (API reference): title 1-400, description 0-10000, clientToken 1-64 of
// [\x21-\x7E]. A sha256 hex digest is exactly 64 characters of that set.
const MAX_TITLE = 400;
const MAX_DESCRIPTION = 10000;

/** The console host for a Region's partition; DevOps Agent also runs in AWS GovCloud (US). */
export function consoleHost(region: string): string {
  if (region.startsWith('us-gov-')) return `${region}.console.amazonaws-us-gov.com`;
  if (region.startsWith('cn-')) return `${region}.console.amazonaws.cn`;
  return `${region}.console.aws.amazon.com`;
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function executionUrl(event: ActionFailedEvent): string {
  const d = event.detail;
  return (
    `https://${consoleHost(event.region)}/codesuite/codepipeline/pipelines/` +
    `${encodeURIComponent(d.pipeline)}/executions/${d['execution-id']}/timeline?region=${event.region}`
  );
}

/** An idempotency token for one action execution (stable across redeliveries). */
function token(event: ActionFailedEvent): string {
  const d = event.detail;
  // Without an action execution id, the action in this attempt of the execution (an absent attempt stays null).
  const key =
    d['action-execution-id'] ??
    JSON.stringify([d.pipeline, d['execution-id'], d.stage, d.action, d['pipeline-execution-attempt']]);
  return createHash('sha256').update(key).digest('hex');
}

/** Map one failed-action event to the investigation request. Pure; exported for tests. */
export function buildBacklogTask(event: ActionFailedEvent, agentSpaceId: string, priority: string): BacklogTaskRequest {
  const d = event.detail;
  const attempt = d['pipeline-execution-attempt'];
  const result = d['execution-result'];
  const actionRegion = d.region ?? event.region;
  const lines = [
    `The CodePipeline pipeline ${d.pipeline} failed in stage ${d.stage}, action ${d.action}.`,
    '',
    `Pipeline execution: ${d['execution-id']}${attempt !== undefined ? ` (attempt ${attempt})` : ''}`,
    `Action: ${d.action} (${d.type?.category ?? 'unknown category'} / ${d.type?.provider ?? 'unknown provider'})`,
    `Pipeline account and Region: ${event.account} / ${event.region}; action Region: ${actionRegion}`,
    ...(event.time ? [`Failed at: ${event.time}`] : []),
    ...(result?.['error-code'] ? [`Error code: ${result['error-code']}`] : []),
    ...(result?.['external-execution-summary'] ? [`Summary: ${result['external-execution-summary']}`] : []),
    ...(result?.['external-execution-url'] ? [`Action details: ${result['external-execution-url']}`] : []),
    `Pipeline execution in the console: ${executionUrl(event)}`,
    '',
    'This pipeline is generated by cdk-cicd-wrapper from the cicd.config.ts in its source repository. ' +
      'Find the root cause of this failure: start from the failed action (its CodeBuild log, or the ' +
      'CloudFormation events of the stack it deployed), and say whether the cause is in the change that ' +
      'started this execution, in the target environment, or in the pipeline itself.',
  ];
  return {
    agentSpaceId,
    taskType: 'INVESTIGATION',
    priority,
    title: clip(`Pipeline ${d.pipeline} failed at ${d.stage} / ${d.action}`, MAX_TITLE),
    description: clip(lines.join('\n'), MAX_DESCRIPTION),
    clientToken: token(event),
  };
}

/**
 * Forward one event: a failed action that is not an approval opens an investigation. Anything else is ignored.
 * The rule already routes only those; checking again keeps the function safe on its own.
 */
export async function forward(
  event: ActionFailedEvent,
  settings: ForwarderSettings,
  clients: ForwarderClients,
): Promise<void> {
  const d = event?.detail;
  if (d === undefined || d.state !== 'FAILED' || d.type?.category === 'Approval') return;
  await clients.createBacklogTask(buildBacklogTask(event, settings.agentSpaceId, settings.investigationPriority));
}

function sdkClients(region: string): ForwarderClients {
  let agent: any;
  try {
    agent = require('@aws-sdk/client-devops-agent');
  } catch (err) {
    throw new Error(
      'cdk-cicd: this Lambda runtime does not provide @aws-sdk/client-devops-agent, so the DevOps Agent ' +
        `forwarder cannot call CreateBacklogTask (${(err as Error).message}).`,
    );
  }
  const agentClient = new agent.DevOpsAgentClient({ region });
  return { createBacklogTask: (request) => agentClient.send(new agent.CreateBacklogTaskCommand(request)) };
}

let cached: ForwarderClients | undefined;

export async function handler(event: ActionFailedEvent): Promise<void> {
  const env = process.env;
  if (!env.AGENT_SPACE_ID || !env.AGENT_SPACE_REGION || !env.INVESTIGATION_PRIORITY) {
    throw new Error(
      'cdk-cicd: the DevOps Agent forwarder needs AGENT_SPACE_ID, AGENT_SPACE_REGION and INVESTIGATION_PRIORITY.',
    );
  }
  cached ??= sdkClients(env.AGENT_SPACE_REGION);
  await forward(
    event,
    // The default priority lives in the construct alone (DevOpsAgentIntegration), which always sets it.
    { agentSpaceId: env.AGENT_SPACE_ID, investigationPriority: env.INVESTIGATION_PRIORITY },
    cached,
  );
}
