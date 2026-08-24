// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { App, Aspects, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as sns from 'aws-cdk-lib/aws-sns';
import { EncryptSNSTopicOnTransitAspect } from '../../src/support/EncryptSNSTopicOnTransitAspect';

function stack(): Stack {
  return new Stack(new App(), 'TopicStack');
}

describe('m9-migrate-security-plugins: EncryptSNSTopicOnTransitAspect', () => {
  test('denies HTTP subscribe/receive and non-TLS access on every topic it visits', () => {
    const s = stack();
    Aspects.of(s).add(new EncryptSNSTopicOnTransitAspect());
    new sns.Topic(s, 'Topic');

    const statements = Template.fromStack(s).findResources('AWS::SNS::TopicPolicy');
    const policy = Object.values(statements)[0] as {
      Properties: { PolicyDocument: { Statement: Array<{ Sid: string }> } };
    };
    const sids = policy.Properties.PolicyDocument.Statement.map((st) => st.Sid);

    expect(sids).toContain('NoHTTPSubscriptions');
    expect(sids).toContain('HttpsOnly');
  });

  test('ignores non-topic constructs', () => {
    const s = stack();
    expect(() => Aspects.of(s).add(new EncryptSNSTopicOnTransitAspect())).not.toThrow();
    Template.fromStack(s).resourceCountIs('AWS::SNS::TopicPolicy', 0);
  });

  test('denies HTTP subscribe/receive on a topic built from a second, independently-loaded copy of aws-cdk-lib', () => {
    // `jest.isolateModules` re-executes `aws-cdk-lib` (and everything it depends on) in a fresh
    // module registry, so the `Topic` class it returns is a distinct class object from the one
    // imported at the top of this file -- mirroring the two physical `aws-cdk-lib` copies this dev
    // tree actually resolves (root `node_modules` vs. this package's own nested `node_modules`), the
    // module-identity boundary that made `node instanceof Topic` silently false against a real
    // deploy. The aspect must recognize the topic structurally, not by class identity.
    let otherTopic!: sns.Topic;
    let otherTemplate!: unknown;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const otherCdkLib = require('aws-cdk-lib');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const otherSns = require('aws-cdk-lib/aws-sns');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const otherAssertions = require('aws-cdk-lib/assertions');
      const otherStack = new otherCdkLib.Stack(new otherCdkLib.App(), 'OtherCopyStack');
      otherTopic = new otherSns.Topic(otherStack, 'Topic');
      new EncryptSNSTopicOnTransitAspect().visit(otherTopic);
      otherTemplate = otherAssertions.Template.fromStack(otherStack);
    });

    // Proves the object really did come from a different class -- otherwise this test would pass
    // trivially without exercising the cross-copy boundary at all.
    expect(otherTopic instanceof sns.Topic).toBe(false);

    const statements = (otherTemplate as Template).findResources('AWS::SNS::TopicPolicy');
    const policy = Object.values(statements)[0] as {
      Properties: { PolicyDocument: { Statement: Array<{ Sid: string }> } };
    };
    const sids = policy.Properties.PolicyDocument.Statement.map((st) => st.Sid);

    expect(sids).toContain('NoHTTPSubscriptions');
    expect(sids).toContain('HttpsOnly');
  });
});
