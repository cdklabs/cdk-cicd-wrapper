// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// v2 shipped this as `LambdaDLQPlugin` (m9-migrate-security-plugins), opt-in (not in v2's default
// plugin set), which lazily created its own dedicated stack + SQS queue the first time it visited a
// Lambda function with no DLQ/DLT set. v3 has no per-stage-plugin-hook to create that sibling stack
// from inside the aspect, so the queue is the caller's construct instead -- construct it however you
// like (e.g. with `enforceSSL: true`, matching v2's queue) and pass it in.

import { IAspect } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { CfnFunction, Function as LambdaFunction } from 'aws-cdk-lib/aws-lambda';
import { IQueue } from 'aws-cdk-lib/aws-sqs';
import { IConstruct } from 'constructs';

/** Constructor props for {@link LambdaDLQAspect}. */
export interface LambdaDLQAspectProps {
  /** The dead-letter queue every visited function without one is wired to. */
  readonly deadLetterQueue: IQueue;
}

/**
 * Wires every L2 Lambda `Function` it visits that has no dead-letter queue/topic already set to a
 * shared dead-letter queue, matching v2's opt-in `LambdaDLQPlugin`.
 */
export class LambdaDLQAspect implements IAspect {
  private readonly deadLetterQueue: IQueue;

  public constructor(props: LambdaDLQAspectProps) {
    this.deadLetterQueue = props.deadLetterQueue;
  }

  public visit(node: IConstruct): void {
    if (node instanceof LambdaFunction && node.deadLetterQueue === undefined && node.deadLetterTopic === undefined) {
      node.addToRolePolicy(
        new PolicyStatement({
          actions: ['sqs:SendMessage'],
          resources: [this.deadLetterQueue.queueArn],
        }),
      );
      (node.node.defaultChild as CfnFunction).deadLetterConfig = {
        targetArn: this.deadLetterQueue.queueArn,
      };
    }
  }
}
