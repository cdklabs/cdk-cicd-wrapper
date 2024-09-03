// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { IAspect, Aspects } from 'aws-cdk-lib';
import { Effect, PolicyStatement, AnyPrincipal } from 'aws-cdk-lib/aws-iam';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { PluginBase, ResourceContext } from '../../common';

/**
 * Plugin to enable encryption for SNS topics.
 */
export class EncryptSNSTopicOnTransitPlugin extends PluginBase {
  readonly name: string = 'EncryptSNSTopicOnTransitPlugin';

  readonly version: string = '1.0';

  afterStage(scope: Construct, _: ResourceContext): void {
    Aspects.of(scope).add(new EncryptSNSTopicOnTransitAspect());
  }
}

class EncryptSNSTopicOnTransitAspect implements IAspect {
  constructor() {}

  visit(node: Construct): void {
    if (node instanceof Topic) {
      // Apply SNS topic policy to enforce encryption in transit
      node.addToResourcePolicy(
        new PolicyStatement({
          sid: 'NoHTTPSubscriptions',
          resources: [`${node.topicArn}`],
          principals: [new AnyPrincipal()],
          effect: Effect.DENY,
          actions: ['SNS:Subscribe', 'SNS:Receive'],
          conditions: {
            StringEquals: {
              'SNS:Protocol': 'http',
            },
          },
        }),
      );
      node.addToResourcePolicy(
        new PolicyStatement({
          sid: 'HttpsOnly',
          resources: [`${node.topicArn}`],
          actions: [
            'SNS:Publish',
            'SNS:RemovePermission',
            'SNS:SetTopicAttributes',
            'SNS:DeleteTopic',
            'SNS:ListSubscriptionsByTopic',
            'SNS:GetTopicAttributes',
            'SNS:Receive',
            'SNS:AddPermission',
            'SNS:Subscribe',
          ],
          principals: [new AnyPrincipal()],
          effect: Effect.DENY,
          conditions: {
            Bool: {
              'aws:SecureTransport': 'false',
            },
          },
        }),
      );
    }
  }
}
