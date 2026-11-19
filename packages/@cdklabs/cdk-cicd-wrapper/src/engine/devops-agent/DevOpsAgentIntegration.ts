// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as path from 'path';
import {
  Aws,
  CfnResource,
  CfnRule,
  Duration,
  Fn,
  Stack,
  Token,
  aws_codepipeline as codepipeline,
  aws_events as events,
  aws_events_targets as targets,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_sqs as sqs,
} from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { INVESTIGATION_SKILL_FILES } from './investigation-skill.generated';
import { PipelineLayout } from './layout';
import { Repository } from '../../config/repository';
import { DevOpsAgentConfig, DevOpsAgentPriority } from '../../config/types';
import { latestNodeRuntime } from '../lambda-runtime';

export interface DevOpsAgentIntegrationProps {
  /** The pipelines to connect (Repo 2 renders its auto-deploy pipelines too). */
  readonly pipelines: codepipeline.IPipeline[];
  readonly config: DevOpsAgentConfig;
  /** How the engine names the pipeline's stages and actions; see layout.ts. */
  readonly layout: PipelineLayout;
  /** The source repository, which a `changeRiskAnalysis` review names. */
  readonly repository?: Repository;
}

const SKILL_NAME_MAX = 64;

/** A skill name DevOps Agent accepts: lowercase letters, digits and hyphens, at most 64, no edge hyphen. */
function skillName(base: string): string {
  return base
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, SKILL_NAME_MAX)
    .replace(/^-+|-+$/g, '');
}

/**
 * Connects a wrapper-rendered pipeline to AWS DevOps Agent (`devopsAgent` in `cicd.config.ts` /
 * `deploy.config.ts`), one level at a time; each renders only when its block is configured:
 *
 * - `investigations`: an EventBridge rule on the pipelines' own `Action Execution State Change` events in
 *   state FAILED (approvals excluded, optionally filtered to some stages) invokes a Lambda that opens one
 *   INVESTIGATION per failed action with `CreateBacklogTask`.
 * - `changeRiskAnalysis`: a rule on approval actions of the named stages in state STARTED invokes the same
 *   Lambda, which reads the commit being promoted (`GetPipelineExecution`) and requests a
 *   CODE_CHANGE_RISK_ANALYSIS of it.
 * - `knowledge`: skill assets in the Agent Space (`AWS::DevOpsAgent::Asset`), owned by the pipeline stack.
 *
 * Everything stays in the pipeline's account and Region. The Lambda has no inbound endpoint, and its role may
 * call `aidevops:CreateBacklogTask` on the one Agent Space (plus, for reviews, `codepipeline:GetPipelineExecution`
 * on these pipelines) and nothing else.
 *
 * Update semantics: changing `agentSpaceId` or `region` updates the Lambda in place, but REPLACES the knowledge
 * assets (an asset's `AgentSpaceId` and `AssetType` cannot be updated). Changing a skill's content updates it.
 */
export class DevOpsAgentIntegration extends Construct {
  /** The forwarder, when `investigations` or `changeRiskAnalysis` is on. */
  public readonly function?: lambda.Function;
  private readonly agentSpaceId: string;

  constructor(scope: Construct, id: string, props: DevOpsAgentIntegrationProps) {
    super(scope, id);
    const stack = Stack.of(this);
    const { config, layout } = props;
    this.agentSpaceId = config.agentSpaceId;
    const region = config.region ?? stack.region;
    const agentSpaceArn = `arn:${stack.partition}:aidevops:${region}:${stack.account}:agentspace/${config.agentSpaceId}`;

    if (config.investigations !== undefined || config.changeRiskAnalysis !== undefined) {
      this.function = this.forwarder(props, region, agentSpaceArn);
    }
    if (config.knowledge !== undefined) {
      if (config.region !== undefined && !Token.isUnresolved(stack.region) && config.region !== stack.region) {
        throw new Error(
          `cdk-cicd: devopsAgent.knowledge publishes skills from the pipeline stack, so the Agent Space must be in its ` +
            `Region (${stack.region}); devopsAgent.region is ${config.region}.`,
        );
      }
      if (config.region !== undefined && Token.isUnresolved(stack.region)) {
        // An environment-agnostic stack learns its Region only at deploy time: let CloudFormation refuse it then.
        new CfnRule(this, 'AgentSpaceRegion', {
          assertions: [
            {
              assert: Fn.conditionEquals(Aws.REGION, config.region),
              assertDescription: `devopsAgent.knowledge needs the pipeline stack in the Agent Space's Region, ${config.region}.`,
            },
          ],
        });
      }
      if (config.knowledge.investigationSkill !== false) {
        this.skill('InvestigationSkill', {
          name: 'cdk-cicd-pipeline-failure-investigation',
          description:
            'How a cdk-cicd-wrapper pipeline is laid out and how to investigate a failed run of it: what each stage ' +
            'and action runs, and where its log or stack lives.',
          files: INVESTIGATION_SKILL_FILES.map((file) => ({ Path: file.path, ContentText: file.content })),
        });
      }
      if (config.knowledge.pipelineMap !== false) {
        // Named after the stack, not the application: container mode's Repo 1 and Repo 2 share an application name.
        const name = skillName(`cdk-cicd-pipeline-map-${stack.stackName}`);
        this.skill('PipelineMap', {
          name,
          description:
            `The layout of the ${layout.application ?? stack.stackName} pipeline (cdk-cicd-wrapper): its stages, the ` +
            'accounts and Regions they deploy to, their approvals and action names. Use when investigating a ' +
            'failed run of that pipeline.',
          files: [{ Path: 'SKILL.md', ContentText: pipelineMap(name, props, stack) }],
        });
      }
    }
  }

  private forwarder(props: DevOpsAgentIntegrationProps, region: string, agentSpaceArn: string): lambda.Function {
    const { config, layout, pipelines } = props;
    // A failure the forwarder cannot hand over must not vanish: EventBridge delivery failures and
    // invocations that still fail after Lambda's asynchronous retries both land here.
    const deadLetterQueue = new sqs.Queue(this, 'DeadLetters', {
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
      retentionPeriod: Duration.days(14),
    });
    const fn = new lambda.Function(this, 'Forwarder', {
      runtime: latestNodeRuntime(),
      // Just the compiled handler: the DevOps Agent client comes from the Lambda runtime's AWS SDK v3.
      // Proven on nodejs22.x in eu-west-1 (test/proof/devops-agent-verify.sh, 2026-11-19). If a runtime ever
      // lacks it, the handler fails with a message naming the package, and the event lands in the DLQ.
      code: lambda.Code.fromAsset(path.join(__dirname, 'forwarder')),
      handler: 'handler.handler',
      timeout: Duration.seconds(30),
      description: 'cdk-cicd: open AWS DevOps Agent tasks for pipeline events',
      environment: {
        AGENT_SPACE_ID: config.agentSpaceId,
        AGENT_SPACE_REGION: region,
        INVESTIGATION_PRIORITY: config.investigations?.priority ?? DevOpsAgentPriority.HIGH,
        REVIEW_PRIORITY: config.changeRiskAnalysis?.priority ?? DevOpsAgentPriority.MEDIUM,
        ...(props.repository !== undefined ? { REPOSITORY: props.repository.name } : {}),
      },
      // EventBridge invokes asynchronously; these govern retries of a failing invocation (throttling, a
      // transient API error). Retrying is safe: the handler sends an idempotency token.
      retryAttempts: 2,
      maxEventAge: Duration.hours(6),
      deadLetterQueue,
    });
    fn.addToRolePolicy(
      new iam.PolicyStatement({ actions: ['aidevops:CreateBacklogTask'], resources: [agentSpaceArn] }),
    );
    const target = new targets.LambdaFunction(fn, {
      retryAttempts: 2,
      maxEventAge: Duration.hours(1),
      deadLetterQueue,
    });
    const pipelineArns = pipelines.map((pipeline) => pipeline.pipelineArn);
    const base = {
      source: ['aws.codepipeline'],
      detailType: ['CodePipeline Action Execution State Change'],
      resources: pipelineArns,
    };

    if (config.investigations !== undefined) {
      new events.Rule(this, 'ActionFailed', {
        description: 'cdk-cicd: open a DevOps Agent investigation for a failed pipeline action',
        eventPattern: {
          ...base,
          detail: {
            state: ['FAILED'],
            // A rejected (or timed-out) manual approval also ends FAILED. That is a decision, not an incident.
            type: { category: events.Match.anythingBut('Approval') },
            ...failureScope(config, layout),
          },
        },
        targets: [target],
      });
    }

    if (config.changeRiskAnalysis !== undefined) {
      const wanted = new Set(config.changeRiskAnalysis.beforeApprovalOf);
      const approvals = layout.environments
        .filter((environment) => wanted.has(environment.name) && environment.approvalAction !== undefined)
        .map((environment) => environment.approvalAction!);
      new events.Rule(this, 'ApprovalStarted', {
        description: 'cdk-cicd: request a DevOps Agent Code Change Risk Analysis when a gated stage waits for approval',
        eventPattern: { ...base, detail: { state: ['STARTED'], type: { category: ['Approval'] }, action: approvals } },
        targets: [target],
      });
      // The review names the commit being promoted, which only the pipeline execution knows.
      fn.addToRolePolicy(
        new iam.PolicyStatement({ actions: ['codepipeline:GetPipelineExecution'], resources: pipelineArns }),
      );
    }

    NagSuppressions.addResourceSuppressions(
      fn,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'AWSLambdaBasicExecutionRole is the CDK default for a Lambda with no VPC; it grants only ' +
            'logs:CreateLogGroup, logs:CreateLogStream and logs:PutLogEvents (on Resource "*").',
        },
      ],
      true,
    );
    NagSuppressions.addResourceSuppressions(deadLetterQueue, [
      { id: 'AwsSolutions-SQS3', reason: 'This queue is itself the dead-letter queue of the forwarder.' },
    ]);
    return fn;
  }

  private skill(
    id: string,
    skill: { name: string; description: string; files: Array<{ Path: string; ContentText: string }> },
  ) {
    // AgentSpaceId and AssetType cannot be updated: changing either REPLACES the asset. Content updates in place.
    new CfnResource(this, id, {
      type: 'AWS::DevOpsAgent::Asset',
      properties: {
        AgentSpaceId: this.agentSpaceId,
        AssetType: 'skill',
        Metadata: { name: skill.name, description: skill.description, agent_types: ['GENERIC'] },
        Files: skill.files,
      },
    });
  }
}

/**
 * The `detail` fields that narrow the failure rule to the configured stages. Nothing at all when every stage and
 * the pipeline's own actions are wanted; otherwise an `$or` over the matching CodePipeline stage names and, where
 * an engine shares stages between environments (Repo 2), action names.
 */
export function failureScope(config: DevOpsAgentConfig, layout: PipelineLayout): Record<string, unknown> {
  const investigations = config.investigations!;
  const includePipeline = investigations.includePipelineActions !== false;
  if (investigations.stages === undefined) {
    // (A CDK Pipelines `Assets` stage split at 50 actions, `Assets.1`, still passes this filter: EventBridge's
    // anything-but takes one prefix at most, and the exact names are what a pipeline renders in practice.)
    return includePipeline ? {} : { stage: [{ 'anything-but': layout.pipelineStageNames }] };
  }
  const wanted = new Set(investigations.stages);
  const environments = layout.environments.filter((environment) => wanted.has(environment.name));
  const stageNames: Array<string | { prefix: string }> = [
    ...(includePipeline ? layout.pipelineStageNames : []),
    ...environments.flatMap((environment) => environment.stageNames),
    ...(includePipeline ? (layout.pipelineStagePrefixes ?? []) : []).map((prefix) => ({ prefix })),
    ...environments.flatMap((environment) => environment.stagePrefixes ?? []).map((prefix) => ({ prefix })),
  ];
  const actionNames = environments.flatMap((environment) => environment.actionNames);
  const alternatives = [
    ...(stageNames.length > 0 ? [{ stage: uniqueMatchers(stageNames) }] : []),
    ...(actionNames.length > 0 ? [{ action: [...new Set(actionNames)] }] : []),
  ];
  if (alternatives.length === 0) {
    throw new Error('cdk-cicd: devopsAgent.investigations matches no stage or action of this pipeline.');
  }
  return alternatives.length === 1 ? alternatives[0] : { $or: alternatives };
}

function uniqueMatchers(values: Array<string | { prefix: string }>): Array<string | { prefix: string }> {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = typeof value === 'string' ? value : `prefix:${value.prefix}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
}

/**
 * The pipeline-map skill, generated from the config: the names in it are exactly those the engine renders
 * (test/engine/devops-agent/integration.test.ts checks them against the synthesized pipelines).
 */
export function pipelineMap(name: string, props: DevOpsAgentIntegrationProps, stack: Stack): string {
  const { layout } = props;
  const pipelines = props.pipelines.map((pipeline) => pipeline.pipelineName).join(', ');
  const row = (environment: PipelineLayout['environments'][number]) =>
    `| \`${environment.name}\` | ${environment.account ?? 'the pipeline account'} | ` +
    `${environment.regions.length > 0 ? environment.regions.join(', ') : 'the pipeline Region'} | ` +
    `${environment.manualApproval ? `yes (\`${environment.approvalAction}\`)` : 'no'} | ` +
    `${environment.deployedBy.map((what) => what.replace(/^(stage|action) (.*)$/, '$1 `$2`')).join(', ')} |`;
  return [
    '---',
    `name: ${name}`,
    `description: The layout of the ${layout.application ?? stack.stackName} pipeline. Use when investigating a failed run of ${pipelines}.`,
    '---',
    '',
    `# Pipeline ${pipelines}`,
    '',
    `Generated by cdk-cicd-wrapper from the pipeline's config, and rendered by ${layout.description}. The pipeline and ` +
      `its CodeBuild projects run in the pipeline account ${stack.account}, Region ${stack.region}; the pipeline ` +
      `stack is ${stack.stackName}. Pipeline-level stages: ${layout.pipelineStageNames.map((n) => `\`${n}\``).join(', ')}.`,
    '',
    ...(layout.environments.length > 0
      ? [
          '| Environment | Account | Regions | Manual approval | Deployed by |',
          '| --- | --- | --- | --- | --- |',
          ...layout.environments.map(row),
          '',
          "Each environment's application stacks live in its account and Regions: read their CloudFormation events " +
            'there. Build logs are in the pipeline account under `/aws/codebuild/<project>`.',
        ]
      : ['This pipeline deploys nothing itself: it builds and pushes the deployer image.']),
    '',
    'For what each stage and action runs, and the usual causes of a failure, use the ' +
      'cdk-cicd-pipeline-failure-investigation skill.',
    '',
  ].join('\n');
}
