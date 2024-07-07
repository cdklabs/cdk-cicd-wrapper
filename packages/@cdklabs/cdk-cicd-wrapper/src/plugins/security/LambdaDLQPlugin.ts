/**
 * Copyright 2022 Amazon.com Inc. or its affiliates.
 * Provided as part of Amendment No. 5 to Definitive Agreement No. 8,
 * Activity/Deliverable 10 (to the Strategic Framework Agreement dated March 26, 2019).
 */

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as nag from 'cdk-nag';
import { Construct } from 'constructs';
import { IPlugin, ResourceContext } from '../../';

export interface LambdaDLQPluginProps {
  /**
   * The retentionPeriod for the DLQ.
   */
  retentionPeriod?: cdk.Duration;
}

export class LambdaDLQPlugin implements IPlugin {
  readonly name = 'LambdaDLQPlugin';
  readonly version = '1.0';

  readonly retentionPeriod: cdk.Duration;

  constructor(props?: LambdaDLQPluginProps) {
    this.retentionPeriod = props?.retentionPeriod ?? cdk.Duration.days(14);

    // eslint-disable-next-line
    console.log('LambdaDLQPlugin constructor');
  }

  afterStage(scope: Construct, context: ResourceContext): void {
    cdk.Aspects.of(scope).add(
      new LambdaDLQPluginAspect(() => {
        const dlqStack = new cdk.Stack(scope, `${context.blueprintProps.applicationName}-${this.name}-DLQStack`);
        const dlq = new sqs.Queue(dlqStack, 'DLQ', {
          queueName: `${context.blueprintProps.applicationQualifier}-${context.stage}-${context.blueprintProps.applicationName}-DLQ`,
          retentionPeriod: this.retentionPeriod,
          enforceSSL: true,
        });

        nag.NagSuppressions.addResourceSuppressions(dlq, [
          { id: 'AwsSolutions-SQS3', reason: 'This is a dead letter queue but referenced from other stacks' },
        ]);

        return dlq;
      }),
    );
  }
}

class LambdaDLQPluginAspect implements cdk.IAspect {
  private _dlq?: sqs.Queue;

  constructor(private queueProvider: () => sqs.Queue) {}

  public visit(node: Construct): void {
    if (node instanceof lambda.Function && node.deadLetterQueue === undefined && node.deadLetterTopic === undefined) {
      node.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['sqs:SendMessage'],
          resources: [this.dlq.queueArn],
        }),
      );
      (node.node.defaultChild! as lambda.CfnFunction).deadLetterConfig = {
        targetArn: this.dlq.queueArn,
      };
    }
  }

  private get dlq(): sqs.Queue {
    if (!this._dlq) {
      this._dlq = this.queueProvider();
    }

    return this._dlq;
  }
}
