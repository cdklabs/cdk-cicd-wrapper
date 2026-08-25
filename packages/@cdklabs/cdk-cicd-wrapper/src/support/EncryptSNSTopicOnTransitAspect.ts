// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// v2 shipped this as `EncryptSNSTopicOnTransitPlugin`, on by default (m9-migrate-security-plugins).
// v3 has no plugin registry -- it is a plain `IAspect`, wired tree-wide by the runtime injection
// hook (m2-attach/m2-register) alongside cdk-nag, tags and log retention.

import { CfnResource, IAspect, Resource } from 'aws-cdk-lib';
import { Effect, PolicyStatement, AnyPrincipal } from 'aws-cdk-lib/aws-iam';
import { ITopic } from 'aws-cdk-lib/aws-sns';
import { IConstruct } from 'constructs';

const TOPIC_RESOURCE_TYPE = 'AWS::SNS::Topic';

/**
 * True when `node` is an L2 resource construct whose default child is a CFN resource of
 * `cfnResourceType`. Checked structurally -- `Resource.isResource` (a `Symbol.for` marker shared
 * through the global symbol registry) plus `CfnResource.isCfnResource`'s `cfnResourceType` duck-type
 * (same pattern as `RotateEncryptionKeysAspect`/`LogRetentionAspect`) -- rather than `instanceof
 * Topic`, which silently misses a match when the app resolves a second, physically distinct copy of
 * `aws-cdk-lib` (confirmed against a real deploy -- see m9-migrate-security-plugins in task.md). The
 * node itself still has every real `Topic` method at runtime; only its class identity differs from
 * this module's own `Topic` class.
 */
function isL2ResourceOfType(node: IConstruct, cfnResourceType: string): node is ITopic {
  const defaultChild = Resource.isResource(node) ? node.node.defaultChild : undefined;
  return CfnResource.isCfnResource(defaultChild) && defaultChild.cfnResourceType === cfnResourceType;
}

/**
 * Enforces encryption in transit on every L2 `Topic` it visits: denies non-TLS access and denies
 * HTTP subscribe/receive, matching v2's default-on `EncryptSNSTopicOnTransitPlugin`.
 */
export class EncryptSNSTopicOnTransitAspect implements IAspect {
  public visit(node: IConstruct): void {
    if (isL2ResourceOfType(node, TOPIC_RESOURCE_TYPE)) {
      const topic = node;
      topic.addToResourcePolicy(
        new PolicyStatement({
          sid: 'NoHTTPSubscriptions',
          resources: [`${topic.topicArn}`],
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
      topic.addToResourcePolicy(
        new PolicyStatement({
          sid: 'HttpsOnly',
          resources: [`${topic.topicArn}`],
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
