// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// attach.test.ts deliberately does NOT import register.ts -- it exercises the explicit escape
// hatch on a STOCK, unpatched App, which is the bundled/ESM situation attach exists for.

import { App, Aspects, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { AwsSolutionsChecks } from 'cdk-nag';
import { AppConfig, CdkCicd } from '../../../src/v3';
import { appsConstructed } from '../../../src/v3/runtime/inject';

describe('m2-attach: CdkCicd.attach', () => {
  test('applies cdk-nag to a stock (unwrapped) App', () => {
    const app = new App();
    expect(Aspects.of(app).all.some((a) => a instanceof AwsSolutionsChecks)).toBe(false);

    CdkCicd.attach(app);

    expect(Aspects.of(app).all.some((a) => a instanceof AwsSolutionsChecks)).toBe(true);
  });

  test('applies injected cicd:config tags to the synthesized template', () => {
    const app = new App({ context: { [AppConfig.CONTEXT_KEY]: { tags: { Owner: 'attach', Stage: 'prod' } } } });
    CdkCicd.attach(app);
    const stack = new Stack(app, 'AttachStack');
    new ssm.StringParameter(stack, 'P', { stringValue: 'v' });

    Template.fromStack(stack).hasResourceProperties('AWS::SSM::Parameter', {
      Tags: { Owner: 'attach', Stage: 'prod' },
    });
  });

  test('is safe when no cicd:config is present (no tags, still applies nag)', () => {
    const app = new App();
    expect(() => CdkCicd.attach(app)).not.toThrow();
    const stack = new Stack(app, 'BareStack');
    new ssm.StringParameter(stack, 'P', { stringValue: 'v' });

    // No Tags property is emitted when there is nothing to tag.
    const params = Template.fromStack(stack).findResources('AWS::SSM::Parameter');
    const only = Object.values(params)[0] as { Properties?: { Tags?: unknown } };
    expect(only.Properties?.Tags).toBeUndefined();
  });

  test('tags apply even when attach is called AFTER stacks are added', () => {
    // Aspects/Tags resolve at synth regardless of add order, so attach need not precede the stacks
    // -- pin it, since a bundled bin/ may call attach at the very end.
    const app = new App({ context: { [AppConfig.CONTEXT_KEY]: { tags: { Order: 'after' } } } });
    const stack = new Stack(app, 'LateAttachStack');
    new ssm.StringParameter(stack, 'P', { stringValue: 'v' });
    CdkCicd.attach(app);

    Template.fromStack(stack).hasResourceProperties('AWS::SSM::Parameter', { Tags: { Order: 'after' } });
  });

  test('counts as a wrapped App so the bundled-app diagnostic stays silent', () => {
    const before = appsConstructed();
    CdkCicd.attach(new App());
    expect(appsConstructed()).toBe(before + 1);
  });
});
