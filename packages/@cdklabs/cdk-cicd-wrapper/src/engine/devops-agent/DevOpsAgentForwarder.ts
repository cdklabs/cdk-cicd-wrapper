// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as path from 'path';
import {
  Duration,
  Stack,
  aws_codepipeline as codepipeline,
  aws_events as events,
  aws_events_targets as targets,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_sqs as sqs,
} from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { DevOpsAgentConfig } from '../../config/types';
import { latestNodeRuntime } from '../lambda-runtime';

export interface DevOpsAgentForwarderProps {
  /** The pipelines whose failed actions are forwarded (Repo 2 renders its auto-deploy pipelines too). */
  readonly pipelines: codepipeline.IPipeline[];
  readonly config: DevOpsAgentConfig;
}

/**
 * Opens an AWS DevOps Agent investigation for every failed action of the given pipelines (`devopsAgent` in
 * `cicd.config.ts` / `deploy.config.ts`).
 *
 * An EventBridge rule on the pipeline's own `CodePipeline Action Execution State Change` events in
 * state `FAILED` invokes a Lambda that calls `CreateBacklogTask`. Everything lives in the pipelines'
 * account and Region: the rule matches on the pipeline ARNs, the Lambda has no inbound endpoint, and its
 * role may call `aidevops:CreateBacklogTask` on the one configured Agent Space and nothing else.
 *
 * Changing `agentSpaceId` or `region` updates the function's environment and policy in place; no
 * resource here is replaced by it. Rejected or timed-out manual approvals are not forwarded. Construct IDs are the stable part: renaming them replaces the rule
 * and the function (harmless, they hold no state) but is still churn in every user's diff.
 */
export class DevOpsAgentForwarder extends Construct {
  public readonly function: lambda.Function;
  /** Events that could not be delivered, or that the function still failed on after its retries. */
  public readonly deadLetterQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props: DevOpsAgentForwarderProps) {
    super(scope, id);
    const stack = Stack.of(this);
    const region = props.config.region ?? stack.region;

    // A failure the forwarder cannot hand over must not vanish: EventBridge delivery failures and
    // invocations that still fail after Lambda's asynchronous retries both land here.
    this.deadLetterQueue = new sqs.Queue(this, 'DeadLetters', {
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
      retentionPeriod: Duration.days(14),
    });

    this.function = new lambda.Function(this, 'Function', {
      runtime: latestNodeRuntime(),
      // Just the compiled handler: the DevOps Agent client comes from the Lambda runtime's AWS SDK v3.
      code: lambda.Code.fromAsset(path.join(__dirname, 'forwarder')),
      handler: 'handler.handler',
      timeout: Duration.seconds(30),
      description: 'cdk-cicd: open an AWS DevOps Agent investigation when a pipeline action fails',
      environment: {
        AGENT_SPACE_ID: props.config.agentSpaceId,
        AGENT_SPACE_REGION: region,
      },
      // EventBridge invokes asynchronously; these govern retries of a failing invocation (throttling,
      // a transient API error). Retrying is safe: the handler sends an idempotency token.
      retryAttempts: 2,
      maxEventAge: Duration.hours(6),
      deadLetterQueue: this.deadLetterQueue,
    });
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['aidevops:CreateBacklogTask'],
        resources: [
          `arn:${stack.partition}:aidevops:${region}:${stack.account}:agentspace/${props.config.agentSpaceId}`,
        ],
      }),
    );

    new events.Rule(this, 'ActionFailed', {
      description: 'cdk-cicd: forward failed pipeline actions to AWS DevOps Agent',
      eventPattern: {
        source: ['aws.codepipeline'],
        detailType: ['CodePipeline Action Execution State Change'],
        resources: props.pipelines.map((pipeline) => pipeline.pipelineArn),
        // A rejected (or timed-out) manual approval also ends FAILED. That is a decision, not an
        // incident, so it opens no investigation.
        detail: { state: ['FAILED'], type: { category: events.Match.anythingBut('Approval') } },
      },
      // These cover delivery into Lambda's queue only; the function's own retries are set above.
      targets: [
        new targets.LambdaFunction(this.function, {
          retryAttempts: 2,
          maxEventAge: Duration.hours(1),
          deadLetterQueue: this.deadLetterQueue,
        }),
      ],
    });

    NagSuppressions.addResourceSuppressions(
      this.function,
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
    NagSuppressions.addResourceSuppressions(this.deadLetterQueue, [
      { id: 'AwsSolutions-SQS3', reason: 'This queue is itself the dead-letter queue of the forwarder.' },
    ]);
  }
}
