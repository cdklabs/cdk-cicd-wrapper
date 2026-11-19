// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The DevOps Agent forwarder: an EventBridge target that turns CodePipeline `Action Execution State Change`
// events into DevOps Agent backlog tasks with CreateBacklogTask. A failed action (the `investigations` level)
// becomes an INVESTIGATION; an approval that started (the `changeRiskAnalysis` level) becomes a
// CODE_CHANGE_RISK_ANALYSIS of the commit the execution promotes. DevOps Agent has no CodePipeline connector,
// so this is the documented integration path: EventBridge -> Lambda -> CreateBacklogTask.
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
  readonly taskType: 'INVESTIGATION' | 'CODE_CHANGE_RISK_ANALYSIS';
  readonly priority: string;
  readonly title: string;
  readonly description: string;
  readonly clientToken: string;
}

/** The source revision of a pipeline execution, from GetPipelineExecution `artifactRevisions`. */
export interface SourceRevision {
  readonly revisionId?: string;
  readonly revisionUrl?: string;
  readonly revisionSummary?: string;
}

/** The slices of the DevOps Agent and CodePipeline clients the forwarder needs; tests supply fakes. */
export interface ForwarderClients {
  createBacklogTask(request: BacklogTaskRequest): Promise<unknown>;
  /** The source revisions of a pipeline execution. Needed only for change risk analysis. */
  sourceRevisions(pipeline: string, executionId: string): Promise<SourceRevision[]>;
}

/** What the function was configured with (its environment). */
export interface ForwarderSettings {
  readonly agentSpaceId: string;
  readonly investigationPriority: string;
  readonly reviewPriority: string;
  /** The source repository (`owner/repo`), for change risk analysis. */
  readonly repository?: string;
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

/** An idempotency token for one task kind and one action execution (stable across redeliveries). */
function token(kind: string, event: ActionFailedEvent): string {
  const d = event.detail;
  const attempt = d['pipeline-execution-attempt'] ?? 1;
  const key =
    d['action-execution-id'] ?? [d.pipeline, d['execution-id'], d.stage, d.action, String(attempt)].join('\n');
  return createHash('sha256')
    .update(kind === 'INVESTIGATION' ? key : `${kind}\n${key}`)
    .digest('hex');
}

/** Map one failed-action event to the investigation request. Pure; exported for tests. */
export function buildBacklogTask(event: ActionFailedEvent, agentSpaceId: string, priority: string): BacklogTaskRequest {
  const d = event.detail;
  const attempt = d['pipeline-execution-attempt'] ?? 1;
  const result = d['execution-result'] ?? {};
  const actionRegion = d.region ?? event.region;
  const lines = [
    `The CodePipeline pipeline ${d.pipeline} failed in stage ${d.stage}, action ${d.action}.`,
    '',
    `Pipeline execution: ${d['execution-id']} (attempt ${attempt})`,
    `Action: ${d.action} (${d.type?.category ?? 'unknown category'} / ${d.type?.provider ?? 'unknown provider'})`,
    `Pipeline account and Region: ${event.account} / ${event.region}; action Region: ${actionRegion}`,
    ...(event.time ? [`Failed at: ${event.time}`] : []),
    ...(result['error-code'] ? [`Error code: ${result['error-code']}`] : []),
    ...(result['external-execution-summary'] ? [`Summary: ${result['external-execution-summary']}`] : []),
    ...(result['external-execution-url'] ? [`Action details: ${result['external-execution-url']}`] : []),
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
    clientToken: token('INVESTIGATION', event),
  };
}

/** The revision of the configured repository among an execution's source revisions (the first if none matches). */
export function pickRevision(revisions: SourceRevision[], repository?: string): SourceRevision | undefined {
  return (repository && revisions.find((revision) => revision.revisionUrl?.includes(repository))) || revisions[0];
}

/** Map an approval that started to a Code Change Risk Analysis request for the commit it gates. Pure. */
export function buildRiskReviewTask(
  event: ActionFailedEvent,
  revision: SourceRevision | undefined,
  settings: ForwarderSettings,
): BacklogTaskRequest {
  const d = event.detail;
  const commit = revision?.revisionId ?? 'the commit of this pipeline execution';
  const repository = settings.repository ?? 'the source repository of this pipeline';
  const lines = [
    `Review commit ${commit} on repo ${repository} for release risks before it is approved for stage ${d.stage} ` +
      `of the CodePipeline pipeline ${d.pipeline}.`,
    '',
    `An approver is waiting at the manual approval ${d.action}. Report the recommended action (BLOCK, Deploy with ` +
      'Caution or Standard Deployment) with the findings behind it.',
    '',
    ...(revision?.revisionSummary ? [`Commit summary: ${revision.revisionSummary}`] : []),
    ...(revision?.revisionUrl ? [`Commit: ${revision.revisionUrl}`] : []),
    `Pipeline execution: ${d['execution-id']} (${executionUrl(event)})`,
    `Pipeline account and Region: ${event.account} / ${event.region}`,
    '',
    'This pipeline is generated by cdk-cicd-wrapper from the cicd.config.ts in that repository.',
  ];
  return {
    agentSpaceId: settings.agentSpaceId,
    taskType: 'CODE_CHANGE_RISK_ANALYSIS',
    priority: settings.reviewPriority,
    title: clip(`Release risk review: ${repository} commit ${commit.slice(0, 12)} before ${d.stage}`, MAX_TITLE),
    description: clip(lines.join('\n'), MAX_DESCRIPTION),
    clientToken: token('CODE_CHANGE_RISK_ANALYSIS', event),
  };
}

/**
 * Forward one event: a failed action (not an approval) opens an investigation, and an approval that started
 * opens a Code Change Risk Analysis. Anything else is ignored. The rules already route only those; checking
 * again keeps the function safe on its own.
 */
export async function forward(
  event: ActionFailedEvent,
  settings: ForwarderSettings,
  clients: ForwarderClients,
): Promise<void> {
  const d = event?.detail;
  if (d === undefined) return;
  const approval = d.type?.category === 'Approval';
  if (d.state === 'FAILED' && !approval) {
    await clients.createBacklogTask(buildBacklogTask(event, settings.agentSpaceId, settings.investigationPriority));
  } else if (d.state === 'STARTED' && approval) {
    const revisions = await clients.sourceRevisions(d.pipeline, d['execution-id']);
    await clients.createBacklogTask(buildRiskReviewTask(event, pickRevision(revisions, settings.repository), settings));
  }
}

function sdkClients(region: string): ForwarderClients {
  let agent: any;
  let pipelines: any;
  try {
    agent = require('@aws-sdk/client-devops-agent');
  } catch (err) {
    throw new Error(
      'cdk-cicd: this Lambda runtime does not provide @aws-sdk/client-devops-agent, so the DevOps Agent ' +
        `forwarder cannot call CreateBacklogTask (${(err as Error).message}).`,
    );
  }
  const agentClient = new agent.DevOpsAgentClient({ region });
  return {
    createBacklogTask: (request) => agentClient.send(new agent.CreateBacklogTaskCommand(request)),
    sourceRevisions: async (pipeline, executionId) => {
      pipelines ??= require('@aws-sdk/client-codepipeline');
      const client = new pipelines.CodePipelineClient({});
      const out = await client.send(
        new pipelines.GetPipelineExecutionCommand({ pipelineName: pipeline, pipelineExecutionId: executionId }),
      );
      return out?.pipelineExecution?.artifactRevisions ?? [];
    },
  };
}

let cached: ForwarderClients | undefined;

export async function handler(event: ActionFailedEvent): Promise<void> {
  const env = process.env;
  if (!env.AGENT_SPACE_ID || !env.AGENT_SPACE_REGION || !env.INVESTIGATION_PRIORITY || !env.REVIEW_PRIORITY) {
    throw new Error(
      'cdk-cicd: the DevOps Agent forwarder needs AGENT_SPACE_ID, AGENT_SPACE_REGION, INVESTIGATION_PRIORITY and REVIEW_PRIORITY.',
    );
  }
  cached ??= sdkClients(env.AGENT_SPACE_REGION);
  await forward(
    event,
    {
      agentSpaceId: env.AGENT_SPACE_ID,
      // Defaults live in the construct alone (DevOpsAgentIntegration), which always sets both.
      investigationPriority: env.INVESTIGATION_PRIORITY,
      reviewPriority: env.REVIEW_PRIORITY,
      repository: env.REPOSITORY,
    },
    cached,
  );
}
