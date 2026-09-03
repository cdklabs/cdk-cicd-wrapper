// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// NOTE: importing register.ts runs its side effect -- it patches aws-cdk-lib's App at
// module load. Jest gives each test file its own module registry, so that patch is
// contained to this file. The pure-guard tests deliberately import from inject.ts (no
// side effect) rather than register.ts.

import { App, Aspects, DefaultStackSynthesizer, IReusableStackSynthesizer, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { AwsSolutionsChecks } from 'cdk-nag';
import { AppConfig } from '../../src/appconfig';
import * as inject from '../../src/runtime/inject';
import {
  appsConstructed,
  assertAppModuleLayout,
  readInjectedConfig,
  WRAPPER_CONFIG_CONTEXT_KEY,
} from '../../src/runtime/inject';
import { DEFAULT_LOG_RETENTION_DAYS } from '../../src/support/LogRetentionAspect';
// Side-effecting import: patches App. Must come after the other imports so the assertions
// below observe the patched module.
import '../../src/runtime/register';

function hasNagAspect(scope: App | Stack): boolean {
  return Aspects.of(scope).all.some((a) => a instanceof AwsSolutionsChecks);
}

describe('m2-register: the App patch', () => {
  test('aws-cdk-lib.App and aws-cdk-lib/core.App resolve to the wrapper subclass', () => {
    // The leaf patch is observed through every import path (both re-read the leaf lazily).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(require('aws-cdk-lib').App).toBe(App);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(require('aws-cdk-lib/core').App).toBe(App);
    // The patched class is not the stock App: it carries the wrapper's constructor behaviour.
    expect(App.name).toBe('WrappedApp');
  });

  test('a wrapped App registers the cdk-nag AwsSolutionsChecks aspect', () => {
    expect(hasNagAspect(new App())).toBe(true);
  });

  test('tags from injected cicd:config reach the synthesized template', () => {
    const app = new App({ context: { [AppConfig.CONTEXT_KEY]: { tags: { Owner: 'platform', Stage: 'dev' } } } });
    const stack = new Stack(app, 'TagStack');
    new ssm.StringParameter(stack, 'P', { stringValue: 'v' });

    // SSM parameters are taggable, so the applied tags surface on the resource in the template.
    Template.fromStack(stack).hasResourceProperties('AWS::SSM::Parameter', {
      Tags: { Owner: 'platform', Stage: 'dev' },
    });
  });

  test('the wrapper resolves and installs its own synthesizer when the user gives none', () => {
    // At m2 the wrapper's synthesizer is behaviourally identical to the stock default
    // (resolveSynthesizer returns a bare DefaultStackSynthesizer), so asserting the resulting
    // TYPE proves nothing -- an unwrapped App has the same type. Instead, mock the resolver to
    // return a SENTINEL synthesizer and assert that specific one reached the template: this
    // proves both that the resolver was consulted AND that its result was installed, so it fails
    // if the wrapper stops calling it or calls it and discards the result. A differentiating
    // black-box assertion on the real resolver arrives with m3-forced-roles.
    const spy = jest
      .spyOn(inject, 'resolveSynthesizer')
      .mockReturnValue(new DefaultStackSynthesizer({ qualifier: 'sentinel99' }));
    try {
      const stack = new Stack(new App(), 'SynthStack');
      expect(spy).toHaveBeenCalled();
      expect(JSON.stringify(Template.fromStack(stack).toJSON())).toContain('sentinel99');
    } finally {
      spy.mockRestore();
    }
  });

  test('the resolver is NOT consulted when the user supplies a synthesizer', () => {
    // The `?? resolveSynthesizer` short-circuit must leave a user choice untouched -- proven here
    // by the resolver never being called, complementing the qualifier-survival test below.
    const spy = jest.spyOn(inject, 'resolveSynthesizer');
    try {
      new Stack(new App({ defaultStackSynthesizer: new DefaultStackSynthesizer() }), 'UserSynth');
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  test('an explicit user synthesizer is not overridden', () => {
    // A reusable synthesizer is bound per stack, so stack.synthesizer is a bound clone, not
    // the same instance -- the observable proof that the wrapper kept the user's choice is the
    // custom bootstrap qualifier surviving into the template (default would be 'hnb659fds').
    const mine: IReusableStackSynthesizer = new DefaultStackSynthesizer({ qualifier: 'custom01' });
    const app = new App({ defaultStackSynthesizer: mine });
    const stack = new Stack(app, 'UserSynthStack');
    const json = JSON.stringify(Template.fromStack(stack).toJSON());
    expect(json).toContain('custom01');
    expect(json).not.toContain('hnb659fds');
  });

  test('config is read from CDK_CONTEXT_JSON when not on AppProps', () => {
    const previous = process.env.CDK_CONTEXT_JSON;
    process.env.CDK_CONTEXT_JSON = JSON.stringify({ [AppConfig.CONTEXT_KEY]: { tags: { Via: 'env' } } });
    try {
      const stack = new Stack(new App(), 'EnvCtxStack');
      new ssm.StringParameter(stack, 'P', { stringValue: 'v' });
      Template.fromStack(stack).hasResourceProperties('AWS::SSM::Parameter', { Tags: { Via: 'env' } });
    } finally {
      if (previous === undefined) {
        delete process.env.CDK_CONTEXT_JSON;
      } else {
        process.env.CDK_CONTEXT_JSON = previous;
      }
    }
  });

  test('wrapper config is separate from the stage application config', () => {
    const appConfig = { qualifier: 'business-value', feature: 'checkout' };
    const app = new App({
      context: {
        [AppConfig.CONTEXT_KEY]: appConfig,
        [WRAPPER_CONFIG_CONTEXT_KEY]: { qualifier: 'runtime01', plugins: [] },
      },
    });
    const stack = new Stack(app, 'SeparatedConfigStack');

    expect(AppConfig.of(stack)).toEqual(appConfig);
    expect(hasNagAspect(app)).toBe(false);
    const artifact = app.synth().getStackArtifact(stack.artifactId);
    expect(artifact.assumeRoleArn).toContain('runtime01');
    expect(artifact.assumeRoleArn).not.toContain('business-value');
  });

  test('readInjectedConfig strips wrapper-owned fields from app config when wrapper context is present', () => {
    expect(
      readInjectedConfig({
        context: {
          [AppConfig.CONTEXT_KEY]: {
            tags: { Owner: 'platform' },
            plugins: [{ name: 'application-data', version: '9' }],
            qualifier: 'application-data',
          },
          [WRAPPER_CONFIG_CONTEXT_KEY]: { plugins: [], qualifier: 'runtime01', synthesizer: { type: 'default' } },
        },
      }),
    ).toEqual({
      tags: { Owner: 'platform' },
      plugins: [],
      qualifier: 'runtime01',
      synthesizer: { type: 'default' },
    });
  });

  test('a wrapped App forces the default log retention with no injected config', () => {
    const stack = new Stack(new App(), 'DefaultRetentionStack');
    new logs.CfnLogGroup(stack, 'Logs');

    Template.fromStack(stack).hasResourceProperties('AWS::Logs::LogGroup', {
      RetentionInDays: DEFAULT_LOG_RETENTION_DAYS,
    });
  });

  test('logRetentionInDays from injected cicd:config overrides the default', () => {
    const app = new App({ context: { [AppConfig.CONTEXT_KEY]: { logRetentionInDays: 14 } } });
    const stack = new Stack(app, 'ConfiguredRetentionStack');
    new logs.CfnLogGroup(stack, 'Logs');

    Template.fromStack(stack).hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 14 });
  });

  test('each construction is counted (for the bundled-app diagnostic)', () => {
    const before = appsConstructed();
    new App();
    new App();
    expect(appsConstructed()).toBe(before + 2);
  });
});

describe('m2-register: the layout guard', () => {
  test('accepts a module exposing a writable App class', () => {
    const good = {};
    Object.defineProperty(good, 'App', { value: class {}, writable: true, configurable: true });
    expect(() => assertAppModuleLayout(good, '2.195.0')).not.toThrow();
  });

  test('throws a clear, version-named error when App is missing', () => {
    expect(() => assertAppModuleLayout({}, '2.999.0')).toThrow(/aws-cdk-lib 2\.999\.0/);
    expect(() => assertAppModuleLayout({}, '2.999.0')).toThrow(/CdkCicd\.attach/);
  });

  test('throws when App is present but not writable (a moved/frozen layout)', () => {
    const frozen = {};
    Object.defineProperty(frozen, 'App', { value: class {}, writable: false, configurable: false });
    expect(() => assertAppModuleLayout(frozen, '2.195.0')).toThrow(/internal layout this hook relies on has changed/);
  });
});
