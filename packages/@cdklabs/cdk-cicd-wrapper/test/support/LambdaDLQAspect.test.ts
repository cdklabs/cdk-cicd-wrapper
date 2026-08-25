// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { App, Aspects, Duration, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { LambdaDLQAspect } from '../../src/support/LambdaDLQAspect';

function stack(): Stack {
  return new Stack(new App(), 'FunctionStack');
}

function fn(s: Stack, id: string): lambda.Function {
  return new lambda.Function(s, id, {
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: 'index.handler',
    code: lambda.Code.fromInline('exports.handler = async () => {};'),
  });
}

describe('m9-migrate-security-plugins: LambdaDLQAspect', () => {
  test('wires a function with no DLQ/DLT to the shared dead-letter queue', () => {
    const s = stack();
    const dlq = new sqs.Queue(s, 'DLQ', { retentionPeriod: Duration.days(14), enforceSSL: true });
    Aspects.of(s).add(new LambdaDLQAspect({ deadLetterQueue: dlq }));
    fn(s, 'Fn');

    Template.fromStack(s).hasResourceProperties('AWS::Lambda::Function', {
      DeadLetterConfig: {
        TargetArn: { 'Fn::GetAtt': [s.getLogicalId(dlq.node.defaultChild as sqs.CfnQueue), 'Arn'] },
      },
    });
  });

  test('a function with a dead-letter queue already set is left alone', () => {
    const s = stack();
    const shared = new sqs.Queue(s, 'DLQ');
    const own = new sqs.Queue(s, 'OwnDLQ');
    Aspects.of(s).add(new LambdaDLQAspect({ deadLetterQueue: shared }));
    new lambda.Function(s, 'Fn', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => {};'),
      deadLetterQueue: own,
    });

    Template.fromStack(s).hasResourceProperties('AWS::Lambda::Function', {
      DeadLetterConfig: {
        TargetArn: { 'Fn::GetAtt': [s.getLogicalId(own.node.defaultChild as sqs.CfnQueue), 'Arn'] },
      },
    });
  });

  test('a function with a dead-letter topic already set is left alone', () => {
    const s = stack();
    const dlq = new sqs.Queue(s, 'DLQ');
    const topic = new sns.Topic(s, 'DLT');
    Aspects.of(s).add(new LambdaDLQAspect({ deadLetterQueue: dlq }));
    new lambda.Function(s, 'Fn', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => {};'),
      deadLetterTopic: topic,
    });

    Template.fromStack(s).hasResourceProperties('AWS::Lambda::Function', {
      DeadLetterConfig: {
        TargetArn: { Ref: s.getLogicalId(topic.node.defaultChild as sns.CfnTopic) },
      },
    });
  });

  test('ignores non-function constructs', () => {
    const s = stack();
    const dlq = new sqs.Queue(s, 'DLQ');
    expect(() => Aspects.of(s).add(new LambdaDLQAspect({ deadLetterQueue: dlq }))).not.toThrow();
    Template.fromStack(s).resourceCountIs('AWS::Lambda::Function', 0);
  });
});
