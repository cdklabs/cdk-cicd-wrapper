// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { IAspect } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { IConstruct } from 'constructs';
import {
  BUILTIN_PLUGINS,
  BUILTIN_PLUGIN_NAMES,
  BUILTIN_PLUGIN_VERSION,
  PluginRef,
  RegisteredPlugin,
  resolvePlugins,
} from '../../src/runtime/plugins';
import { EncryptSNSTopicOnTransitAspect } from '../../src/support/EncryptSNSTopicOnTransitAspect';
import { LogRetentionAspect } from '../../src/support/LogRetentionAspect';

class CustomAspect implements IAspect {
  public visit(_node: IConstruct): void {}
}

function customPlugin(name: string, version: string): RegisteredPlugin {
  return { ref: { name, version }, aspect: new CustomAspect() };
}

describe('resolvePlugins (issue #241)', () => {
  test('undefined config plugins -> the full default set, in registry order', () => {
    const { aspects, warnings } = resolvePlugins({ configPlugins: undefined, registered: [], config: {} });

    expect(aspects).toHaveLength(BUILTIN_PLUGINS.length);
    expect(aspects[0]).toBeInstanceOf(AwsSolutionsChecks);
    expect(aspects.some((a) => a instanceof EncryptSNSTopicOnTransitAspect)).toBe(true);
    expect(warnings).toEqual([]);
  });

  test('empty config plugins -> opt out of everything', () => {
    const { aspects, warnings } = resolvePlugins({ configPlugins: [], registered: [], config: {} });

    expect(aspects).toEqual([]);
    expect(warnings).toEqual([]);
  });

  test('a non-empty list COMPLETELY overrides the defaults (only the listed built-ins apply)', () => {
    const configPlugins: PluginRef[] = [
      { name: BUILTIN_PLUGIN_NAMES.ENCRYPT_SNS_TOPIC_ON_TRANSIT, version: BUILTIN_PLUGIN_VERSION },
    ];

    const { aspects } = resolvePlugins({ configPlugins, registered: [], config: {} });

    expect(aspects).toHaveLength(1);
    expect(aspects[0]).toBeInstanceOf(EncryptSNSTopicOnTransitAspect);
    expect(aspects.some((a) => a instanceof AwsSolutionsChecks)).toBe(false);
  });

  test('the log-retention built-in reads retention from the injected config', () => {
    const configPlugins: PluginRef[] = [{ name: BUILTIN_PLUGIN_NAMES.LOG_RETENTION, version: BUILTIN_PLUGIN_VERSION }];

    const { aspects } = resolvePlugins({ configPlugins, registered: [], config: { logRetentionInDays: 30 } });

    expect(aspects).toHaveLength(1);
    expect(aspects[0]).toBeInstanceOf(LogRetentionAspect);
  });

  test('a custom plugin resolves to its bin/-registered instance, matched by name', () => {
    const registered = [customPlugin('MyOrgTagEnforcer', '2.1.0')];
    const configPlugins: PluginRef[] = [{ name: 'MyOrgTagEnforcer', version: '2.1.0' }];

    const { aspects, warnings } = resolvePlugins({ configPlugins, registered, config: {} });

    expect(aspects).toHaveLength(1);
    expect(aspects[0]).toBe(registered[0].aspect);
    expect(warnings).toEqual([]);
  });

  test('built-ins and customs can be mixed, in listed order', () => {
    const registered = [customPlugin('MyOrgTagEnforcer', '2.1.0')];
    const configPlugins: PluginRef[] = [
      { name: 'MyOrgTagEnforcer', version: '2.1.0' },
      { name: BUILTIN_PLUGIN_NAMES.AWS_SOLUTIONS_CHECKS, version: BUILTIN_PLUGIN_VERSION },
    ];

    const { aspects } = resolvePlugins({ configPlugins, registered, config: {} });

    expect(aspects).toHaveLength(2);
    expect(aspects[0]).toBe(registered[0].aspect);
    expect(aspects[1]).toBeInstanceOf(AwsSolutionsChecks);
  });

  test('an unknown name with no bin/ registration throws an actionable error', () => {
    const configPlugins: PluginRef[] = [{ name: 'NotRegistered', version: '1.0.0' }];

    expect(() => resolvePlugins({ configPlugins, registered: [], config: {} })).toThrow(/NotRegistered/);
    expect(() => resolvePlugins({ configPlugins, registered: [], config: {} })).toThrow(/CdkCicd\.addPlugin/);
  });

  test('a built-in requested at a non-shipped version warns but still applies the shipped one', () => {
    const configPlugins: PluginRef[] = [{ name: BUILTIN_PLUGIN_NAMES.AWS_SOLUTIONS_CHECKS, version: '999' }];

    const { aspects, warnings } = resolvePlugins({ configPlugins, registered: [], config: {} });

    expect(aspects).toHaveLength(1);
    expect(aspects[0]).toBeInstanceOf(AwsSolutionsChecks);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].name).toBe(BUILTIN_PLUGIN_NAMES.AWS_SOLUTIONS_CHECKS);
  });

  test('a custom whose config version differs from its registered version warns, applies registered', () => {
    const registered = [customPlugin('MyOrgTagEnforcer', '2.1.0')];
    const configPlugins: PluginRef[] = [{ name: 'MyOrgTagEnforcer', version: '9.9.9' }];

    const { aspects, warnings } = resolvePlugins({ configPlugins, registered, config: {} });

    expect(aspects[0]).toBe(registered[0].aspect);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].name).toBe('MyOrgTagEnforcer');
  });

  test('registry is complete: every built-in has a stable name and a factory', () => {
    const names = BUILTIN_PLUGINS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining(Object.values(BUILTIN_PLUGIN_NAMES)));
    for (const p of BUILTIN_PLUGINS) {
      expect(typeof p.factory).toBe('function');
      expect(p.factory({})).toBeDefined();
    }
  });
});
