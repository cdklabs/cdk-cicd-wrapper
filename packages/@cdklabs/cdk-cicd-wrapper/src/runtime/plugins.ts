// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The plugin model behind the security-hardening Aspects (issue #241). A "plugin" is an `IAspect`
// with a stable `{ name, version }` identity. The built-ins live in a name -> factory registry so
// `cicd.config.ts` -- which travels as JSON through CDK context and cannot carry a live object --
// can select or override them by name. A custom plugin names itself the same way in config, but its
// actual instance is supplied in `bin/` via `CdkCicd.addPlugin` (the instance cannot cross context).
//
// `resolvePlugins` is a pure function so the whole selection/override/opt-out contract is unit-
// testable without an App: `applyWrapper` calls it, then adds the returned Aspects tree-wide.

import { IAspect } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { PluginRef } from '../config/types';
import { DisablePublicIPAssignmentForEC2Aspect } from '../support/DisablePublicIPAssignmentForEC2Aspect';
import { EncryptBucketOnTransitAspect } from '../support/EncryptBucketOnTransitAspect';
import { EncryptSNSTopicOnTransitAspect } from '../support/EncryptSNSTopicOnTransitAspect';
import { DEFAULT_LOG_RETENTION_DAYS, LogRetentionAspect } from '../support/LogRetentionAspect';
import { RotateEncryptionKeysAspect } from '../support/RotateEncryptionKeysAspect';

/** Re-export the config-owned identity so runtime callers can import it from one place. */
export { PluginRef } from '../config/types';

/** The stable names of the built-in, default-on security plugins. */
export const BUILTIN_PLUGIN_NAMES = {
  AWS_SOLUTIONS_CHECKS: 'AwsSolutionsChecks',
  LOG_RETENTION: 'LogRetention',
  ENCRYPT_BUCKET_ON_TRANSIT: 'EncryptBucketOnTransit',
  ENCRYPT_SNS_TOPIC_ON_TRANSIT: 'EncryptSNSTopicOnTransit',
  ROTATE_ENCRYPTION_KEYS: 'RotateEncryptionKeys',
  DISABLE_PUBLIC_IP_ASSIGNMENT_FOR_EC2: 'DisablePublicIPAssignmentForEC2',
} as const;

/** The version stamped on the built-in plugins in this wrapper release. */
export const BUILTIN_PLUGIN_VERSION = '1';

/**
 * A factory for a built-in plugin. Takes the resolved config so a plugin that reads config (log
 * retention) can, while the rest ignore it. Kept as a factory rather than a shared instance so each
 * resolve produces fresh Aspects -- Aspects carry no cross-App state, but a factory keeps that true
 * and lets `LogRetentionAspect` pick up the current config's retention.
 */
export type BuiltinPluginFactory = (config: Record<string, unknown>) => IAspect;

/** name -> factory for every default-on built-in. The default set is exactly this registry, in order. */
export const BUILTIN_PLUGINS: ReadonlyArray<{ name: string; factory: BuiltinPluginFactory }> = [
  { name: BUILTIN_PLUGIN_NAMES.AWS_SOLUTIONS_CHECKS, factory: () => new AwsSolutionsChecks() },
  {
    name: BUILTIN_PLUGIN_NAMES.LOG_RETENTION,
    factory: (config) =>
      new LogRetentionAspect({
        retentionInDays:
          typeof config.logRetentionInDays === 'number' ? config.logRetentionInDays : DEFAULT_LOG_RETENTION_DAYS,
      }),
  },
  { name: BUILTIN_PLUGIN_NAMES.ENCRYPT_BUCKET_ON_TRANSIT, factory: () => new EncryptBucketOnTransitAspect() },
  { name: BUILTIN_PLUGIN_NAMES.ENCRYPT_SNS_TOPIC_ON_TRANSIT, factory: () => new EncryptSNSTopicOnTransitAspect() },
  { name: BUILTIN_PLUGIN_NAMES.ROTATE_ENCRYPTION_KEYS, factory: () => new RotateEncryptionKeysAspect() },
  {
    name: BUILTIN_PLUGIN_NAMES.DISABLE_PUBLIC_IP_ASSIGNMENT_FOR_EC2,
    factory: () => new DisablePublicIPAssignmentForEC2Aspect(),
  },
];

/** A custom plugin registered in `bin/` via `CdkCicd.addPlugin`: a real instance plus its identity. */
export interface RegisteredPlugin {
  readonly ref: PluginRef;
  readonly aspect: IAspect;
}

/** Inputs to the pure resolver. Kept explicit so the selection contract is testable without an App. */
export interface ResolvePluginsInput {
  /**
   * The `plugins` list from the resolved cicd config, or `undefined` if the config did not set one.
   * `undefined` means "use defaults"; `[]` means "opt out of all"; a non-empty list COMPLETELY
   * overrides the default set.
   */
  readonly configPlugins?: PluginRef[];
  /** Custom plugins registered in `bin/` via `addPlugin`, matched to config entries by name. */
  readonly registered: RegisteredPlugin[];
  /** The injected config, threaded to built-in factories (e.g. log retention). */
  readonly config: Record<string, unknown>;
}

/** A non-fatal divergence surfaced by the resolver (e.g. a version mismatch). */
export interface PluginWarning {
  readonly name: string;
  readonly message: string;
}

/** The resolver's result: the Aspects to apply, in order, plus any non-fatal warnings. */
export interface ResolvedPlugins {
  readonly aspects: IAspect[];
  readonly warnings: PluginWarning[];
}

/**
 * The single source of truth for which Aspects apply. Pure -- no App, no synth -- so every branch of
 * the selection/override/opt-out contract is unit-tested directly.
 *
 * - `configPlugins === undefined` -> the full default set (every built-in), unchanged behaviour.
 * - `configPlugins === []`        -> nothing (explicit opt-out).
 * - a non-empty list              -> exactly those, in listed order: a built-in name resolves through
 *   its factory; any other name MUST match a `registered` (bin/`addPlugin`) plugin, else throw with an
 *   actionable message. A built-in selected with a version other than this release's is a warning, not
 *   an error; a custom whose config version differs from its registered version is likewise a warning.
 */
export function resolvePlugins(input: ResolvePluginsInput): ResolvedPlugins {
  const { configPlugins, registered, config } = input;

  if (configPlugins === undefined) {
    return { aspects: BUILTIN_PLUGINS.map((p) => p.factory(config)), warnings: [] };
  }

  const builtinByName = new Map(BUILTIN_PLUGINS.map((p) => [p.name, p.factory]));
  const registeredByName = new Map(registered.map((r) => [r.ref.name, r]));
  const aspects: IAspect[] = [];
  const warnings: PluginWarning[] = [];

  for (const ref of configPlugins) {
    const builtin = builtinByName.get(ref.name);
    if (builtin !== undefined) {
      if (ref.version !== BUILTIN_PLUGIN_VERSION) {
        warnings.push({
          name: ref.name,
          message:
            `cicd.config plugin '${ref.name}' requests version '${ref.version}', but this wrapper ships ` +
            `built-in version '${BUILTIN_PLUGIN_VERSION}'. Applying the shipped version.`,
        });
      }
      aspects.push(builtin(config));
      continue;
    }

    const custom = registeredByName.get(ref.name);
    if (custom === undefined) {
      throw new Error(
        `cicd.config declares plugin '${ref.name}' (version '${ref.version}'), but it is neither a ` +
          `built-in nor registered in bin/. Register it with CdkCicd.addPlugin(app, <aspect>, ` +
          `{ name: '${ref.name}', version: '${ref.version}' }), or remove it from the config plugins list. ` +
          `Built-in names: ${BUILTIN_PLUGINS.map((p) => p.name).join(', ')}.`,
      );
    }
    if (custom.ref.version !== ref.version) {
      warnings.push({
        name: ref.name,
        message:
          `cicd.config plugin '${ref.name}' declares version '${ref.version}', but the instance ` +
          `registered in bin/ is version '${custom.ref.version}'. Applying the registered instance.`,
      });
    }
    aspects.push(custom.aspect);
  }

  return { aspects, warnings };
}

/**
 * Symbol under which `addPlugin` stashes custom registrations on the App node, so `applyWrapper` can
 * read them back at synth. The App is the one object both the `bin/` registration and the wrapper
 * core reliably share -- the registration cannot travel through config, and there is no other seam
 * between a user's `bin/` and the tree-wide Aspect application.
 */
const REGISTERED_PLUGINS = Symbol.for('@cdklabs/cdk-cicd-wrapper.RegisteredPlugins');

interface PluginCarrier {
  [REGISTERED_PLUGINS]?: RegisteredPlugin[];
}

/** Record a custom plugin instance + identity on an App-like carrier (the App node's metadata bag). */
export function registerPlugin(carrier: object, plugin: RegisteredPlugin): void {
  const store = carrier as PluginCarrier;
  const list = store[REGISTERED_PLUGINS] ?? [];
  list.push(plugin);
  store[REGISTERED_PLUGINS] = list;
}

/** Read back the custom plugins registered on a carrier. Empty when none were registered. */
export function registeredPlugins(carrier: object): RegisteredPlugin[] {
  return (carrier as PluginCarrier)[REGISTERED_PLUGINS] ?? [];
}

/**
 * Pull the `plugins` selection out of the injected config, tolerating any shape. Returns `undefined`
 * (use defaults) unless the config carries a `plugins` array of well-formed `{name, version}` refs;
 * a present-but-empty array is preserved as `[]` (explicit opt-out).
 */
export function configPluginRefs(config: Record<string, unknown>): PluginRef[] | undefined {
  const raw = config.plugins;
  if (!Array.isArray(raw)) {
    return undefined;
  }
  return raw
    .filter((r): r is PluginRef => {
      return (
        r !== null &&
        typeof r === 'object' &&
        typeof (r as PluginRef).name === 'string' &&
        typeof (r as PluginRef).version === 'string'
      );
    })
    .map((r) => ({ name: r.name, version: r.version }));
}
