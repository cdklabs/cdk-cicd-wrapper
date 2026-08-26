// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Internal runtime helpers shared by the preload hook (register.ts) and the explicit
// escape hatch (CdkCicd.attach, m2-attach). NOT part of the jsii public surface: these
// use free functions, dynamic behaviour and module-level state that jsii cannot model,
// so they are never exported from src/v3/index.ts.
//
// The split exists because the two entry points differ in exactly one thing -- when they
// run. The preload subclasses App and runs at construction, so it can set the
// constructor-only `defaultStackSynthesizer`. `attach()` runs after `new App()`, so it
// can only do the parts that work post-construction: Aspects and tags. `applyWrapper`
// below is that shared post-construction core.

import * as path from 'path';
import { App, Aspects, DefaultStackSynthesizer, IReusableStackSynthesizer, Tags } from 'aws-cdk-lib';
import { configPluginRefs, registeredPlugins, resolvePlugins } from './plugins';
import { AppConfig } from '../appconfig/accessor';

/**
 * Environment flag that `cdk-cicd exec` (m2-exec) sets to arm the bundled-app diagnostic. It is a
 * contract between the CLI launcher and this preload, deliberately OFF by default: the diagnostic
 * installs a `process.on('exit')` hook that can fail the process, and that must never fire when the
 * module is merely imported (jest, a library consumer) rather than driving a real `cdk-cicd exec` run.
 */
export const EXEC_FLAG = 'CDK_CICD_EXEC';

/** The actionable message the diagnostic prints when the preload injected nothing. */
export const BUNDLED_DIAGNOSTIC_MESSAGE =
  'cdk-cicd-wrapper: the injection preload loaded but no App passed through it, so the wrapper ' +
  'applied NOTHING -- no synthesizer, tags or Aspects. This happens when the entry point is bundled ' +
  '(esbuild inlines its own aws-cdk-lib), native ESM, or uses a vendored aws-cdk-lib. Add ' +
  'CdkCicd.attach(app) in your bin/ immediately after you create the App to apply the wrapper explicitly.';

/** How many Apps have passed through the wrapper. Read by the bundled-app diagnostic (m2-bundled-diagnostic). */
let appConstructionCount = 0;

/** Called once per wrapped App construction. */
export function markAppConstructed(): void {
  appConstructionCount += 1;
}

/** Number of Apps the wrapper has wrapped in this process. Zero after the hook loads means it patched nothing. */
export function appsConstructed(): number {
  return appConstructionCount;
}

/**
 * Whether the preload injected nothing and should fail the run. Pure so the decision is unit-testable
 * without a real process exit: fire only when the diagnostic was armed (a real `cdk-cicd exec` run),
 * the wrapper wrapped zero Apps, and the run otherwise succeeded -- a non-zero code means the app
 * already failed for its own reason and this diagnostic must not mask it.
 */
export function shouldWarnBundled(params: { armed: boolean; constructed: number; exitCode: number }): boolean {
  return params.armed && params.constructed === 0 && params.exitCode === 0;
}

/**
 * Env vars the CLI (cdk-cicd exec, populated from the stage's `deployment` config) sets so the preload
 * can install forced roles without the wrapper ever parsing cicd.config. Contract with the CLI --
 * the CLI hardcodes the same literals (tracked in finding code-review-exec-flag-cross-package-literal).
 */
export const DEPLOY_ROLE_FLAG = 'CDK_CICD_DEPLOY_ROLE_ARN';
export const CFN_EXEC_ROLE_FLAG = 'CDK_CICD_CFN_EXEC_ROLE_ARN';

function envArn(value: string | undefined): string | undefined {
  return value !== undefined && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * The synthesizer the wrapper installs. `DefaultStackSynthesizer` is the Autopilot default (app-staging is
 * opt-in, still alpha). When the CLI has exported forced deployer / CloudFormation-execution role ARNs
 * for the active stage (m3-forced-roles), they are threaded into the synthesizer here -- read from the
 * environment, not from config, so the wrapper stays decoupled from cicd.config parsing.
 */
export function resolveSynthesizer(_config: Record<string, unknown>): IReusableStackSynthesizer {
  const deployRoleArn = envArn(process.env[DEPLOY_ROLE_FLAG]);
  const cloudFormationExecutionRole = envArn(process.env[CFN_EXEC_ROLE_FLAG]);
  if (deployRoleArn !== undefined || cloudFormationExecutionRole !== undefined) {
    return new DefaultStackSynthesizer({ deployRoleArn, cloudFormationExecutionRole });
  }
  return new DefaultStackSynthesizer();
}

/**
 * The post-construction wrapper core: register compliance Aspects and apply stack tags
 * from the resolved config, tree-wide. Safe to call on an already-constructed App, which
 * is what lets `attach()` reuse it.
 */
export function applyWrapper(app: App, config: Record<string, unknown>): void {
  // Resolve which security plugins (Aspects) apply from the injected config's `plugins` selection and
  // any custom plugins registered in bin/ via CdkCicd.addPlugin (issue #241). No `plugins` in config
  // means the full default-on set (cdk-nag, log retention, and the bucket/SNS/key/EC2 hardening
  // Aspects), preserving prior behaviour; an empty list opts out; a non-empty list overrides. The
  // resolution itself is the pure `resolvePlugins` -- here we just add the result tree-wide, since
  // Aspects visit before template emission (no need to monkeypatch synth()).
  const { aspects, warnings } = resolvePlugins({
    configPlugins: configPluginRefs(config),
    registered: registeredPlugins(app),
    config,
  });
  for (const aspect of aspects) {
    Aspects.of(app).add(aspect);
  }
  for (const warning of warnings) {
    // eslint-disable-next-line no-console
    console.warn(`cdk-cicd-wrapper: ${warning.message}`);
  }

  const tags = config.tags;
  if (tags !== null && typeof tags === 'object' && !Array.isArray(tags)) {
    for (const [key, value] of Object.entries(tags as Record<string, unknown>)) {
      if (value !== null && value !== undefined) {
        Tags.of(app).add(key, String(value));
      }
    }
  }
}

/**
 * Read the injected config the way the preload must -- BEFORE `super()`, when there is no
 * App node yet to call `tryGetContext` on. The CDK CLI passes context two ways: inline on
 * `AppProps.context`, and via the `CDK_CONTEXT_JSON` environment variable. Returns `{}`
 * when neither carries a `cicd:config`, so a plain `cdk deploy` with no wrapper context is
 * simply un-configured, not an error.
 */
export function readInjectedConfig(props?: { context?: { [key: string]: unknown } }): Record<string, unknown> {
  const fromProps = props?.context?.[AppConfig.CONTEXT_KEY];
  if (isConfigObject(fromProps)) {
    return fromProps;
  }

  const raw = process.env.CDK_CONTEXT_JSON;
  if (raw !== undefined && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw);
      const fromEnv = parsed?.[AppConfig.CONTEXT_KEY];
      if (isConfigObject(fromEnv)) {
        return fromEnv;
      }
    } catch {
      // A malformed CDK_CONTEXT_JSON is the CLI's problem, not ours -- the App constructor
      // will surface it. Treat it as no injected config here.
    }
  }

  return {};
}

/** A parsed value usable as a config object: a non-null, non-array object. */
export function isConfigObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Assert that the resolved aws-cdk-lib leaf module exposes a writable `App` class where the
 * preload expects it. Kept separate from the require() that loads the leaf so it is unit-
 * testable with a fake module, and so the failure is a clear, version-named error rather
 * than a silent patch-nothing -- the seam depends on aws-cdk-lib's internal layout, which a
 * future release could move.
 */
export function assertAppModuleLayout(appModule: unknown, cdkVersion: string): void {
  const descriptor =
    appModule !== null && typeof appModule === 'object' ? Object.getOwnPropertyDescriptor(appModule, 'App') : undefined;
  const app = (appModule as { App?: unknown } | null | undefined)?.App;
  if (typeof app !== 'function' || descriptor === undefined || descriptor.writable !== true) {
    throw new Error(
      `cdk-cicd-wrapper: cannot install the App injection hook against aws-cdk-lib ${cdkVersion}. ` +
        `Its ${path.join('core', 'lib', 'app.js')} does not expose a writable 'App' class at the ` +
        'expected location, so the internal layout this hook relies on has changed. Upgrade ' +
        '@cdklabs/cdk-cicd-wrapper, or use the explicit escape hatch CdkCicd.attach(app) in bin/.',
    );
  }
}

/**
 * Every place `App` is independently re-exported from one aws-cdk-lib install: the internal leaf
 * module the caller already resolved (`core/lib/app.js`), plus the `aws-cdk-lib` and
 * `aws-cdk-lib/core` package entry points. Newer aws-cdk-lib releases (confirmed on 2.220.0+,
 * unaffected on 2.195.0) compile each of these barrels with a SELF-MEMOIZING getter for `App` --
 * the first read anywhere freezes it to a plain, non-writable value, permanently disconnected from
 * the leaf module's own (still-writable) property. Patching only the leaf, as this hook did before,
 * silently misses whichever of these a caller's `import { App } from 'aws-cdk-lib'` already resolved
 * through before the patch ran -- `new App()` in that caller's code then builds a REAL, unpatched App
 * instead of being redirected, with no error, until something downstream (e.g. aws-cdk-lib's own
 * `App.isApp` check during synthesis) trips over the mismatch.
 */
export function appExportTargets(cdkRoot: string, leafModule: object): object[] {
  const targets = [leafModule];
  for (const specifier of [cdkRoot, path.join(cdkRoot, 'core')]) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(specifier) as object;
      if (mod !== leafModule && !targets.includes(mod)) {
        targets.push(mod);
      }
    } catch {
      // Not every aws-cdk-lib layout resolves both; the leaf module is the one guaranteed hit.
    }
  }
  return targets;
}

/**
 * Force-set `App` on every export target for one aws-cdk-lib copy, via `Object.defineProperty` --
 * unlike a plain assignment, this works even once aws-cdk-lib's own lazy re-export has already
 * frozen itself into a non-writable value (see `appExportTargets`). Returns each target's original
 * descriptor (or `undefined` if it had none) for `restoreAppExports` to put back exactly, preserving
 * whatever accessor shape aws-cdk-lib itself used rather than collapsing it to a plain value.
 */
export function patchAppExports(targets: object[], value: unknown): Map<object, PropertyDescriptor | undefined> {
  const originals = new Map<object, PropertyDescriptor | undefined>();
  for (const target of targets) {
    originals.set(target, Object.getOwnPropertyDescriptor(target, 'App'));
    Object.defineProperty(target, 'App', { value, writable: true, configurable: true, enumerable: true });
  }
  return originals;
}

/** Undo `patchAppExports`, restoring each target's exact original property descriptor. */
export function restoreAppExports(originals: Map<object, PropertyDescriptor | undefined>): void {
  for (const [target, descriptor] of originals) {
    if (descriptor === undefined) {
      Reflect.deleteProperty(target, 'App');
    } else {
      Object.defineProperty(target, 'App', descriptor);
    }
  }
}
