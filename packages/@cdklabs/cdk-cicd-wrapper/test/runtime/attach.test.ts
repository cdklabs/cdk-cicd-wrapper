// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// attach.test.ts deliberately does NOT import register.ts -- it exercises the explicit escape
// hatch on a STOCK, unpatched App, which is the bundled/ESM situation attach exists for.

import { App, Aspects, IAspect, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { AwsSolutionsChecks } from 'cdk-nag';
import { IConstruct } from 'constructs';
import { AppConfig, CdkCicd } from '../../src';
import { appsConstructed } from '../../src/runtime/inject';
import { DEFAULT_LOG_RETENTION_DAYS } from '../../src/support/LogRetentionAspect';

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

  test('forces the default log retention when no cicd:config is present', () => {
    const app = new App();
    CdkCicd.attach(app);
    const stack = new Stack(app, 'NoConfigRetentionStack');
    new logs.CfnLogGroup(stack, 'Logs');

    Template.fromStack(stack).hasResourceProperties('AWS::Logs::LogGroup', {
      RetentionInDays: DEFAULT_LOG_RETENTION_DAYS,
    });
  });

  test('applies a log retention from the injected cicd:config', () => {
    const app = new App({ context: { [AppConfig.CONTEXT_KEY]: { logRetentionInDays: 30 } } });
    CdkCicd.attach(app);
    const stack = new Stack(app, 'ConfiguredRetentionStack');
    new logs.CfnLogGroup(stack, 'Logs');

    Template.fromStack(stack).hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 });
  });

  test('skipDefaults opts out of every plugin (no cdk-nag)', () => {
    const app = new App();
    CdkCicd.attach(app, { skipDefaults: true });
    expect(Aspects.of(app).all.some((a) => a instanceof AwsSolutionsChecks)).toBe(false);
  });

  test('an explicit empty plugins list opts out of every plugin', () => {
    const app = new App();
    CdkCicd.attach(app, { plugins: [] });
    expect(Aspects.of(app).all.some((a) => a instanceof AwsSolutionsChecks)).toBe(false);
  });

  test('a plugins override wins over the injected config plugins', () => {
    const app = new App({
      context: { [AppConfig.CONTEXT_KEY]: { plugins: [{ name: 'AwsSolutionsChecks', version: '1' }] } },
    });
    // Options override with an empty list -> nothing applies, despite the config asking for cdk-nag.
    CdkCicd.attach(app, { plugins: [] });
    expect(Aspects.of(app).all.some((a) => a instanceof AwsSolutionsChecks)).toBe(false);
  });

  test('addPlugin registers a custom Aspect that a config plugins entry then selects', () => {
    const visited: string[] = [];
    class CustomAspect implements IAspect {
      public visit(node: IConstruct): void {
        visited.push(node.node.id);
      }
    }
    const app = new App({
      context: { [AppConfig.CONTEXT_KEY]: { plugins: [{ name: 'MyOrgRule', version: '1.0.0' }] } },
    });
    CdkCicd.addPlugin(app, new CustomAspect(), { name: 'MyOrgRule', version: '1.0.0' });
    CdkCicd.attach(app);

    const stack = new Stack(app, 'CustomPluginStack');
    new ssm.StringParameter(stack, 'P', { stringValue: 'v' });
    Template.fromStack(stack); // force synth -> aspects visit

    expect(visited.length).toBeGreaterThan(0);
    // The custom Aspect is the only plugin (config list overrides defaults), so cdk-nag did not apply.
    expect(Aspects.of(app).all.some((a) => a instanceof AwsSolutionsChecks)).toBe(false);
  });

  test('a config plugins entry naming an unregistered custom plugin throws an actionable error', () => {
    const app = new App({
      context: { [AppConfig.CONTEXT_KEY]: { plugins: [{ name: 'NotRegistered', version: '1' }] } },
    });
    expect(() => CdkCicd.attach(app)).toThrow(/NotRegistered/);
    expect(() => CdkCicd.attach(app)).toThrow(/addPlugin/);
  });
});
