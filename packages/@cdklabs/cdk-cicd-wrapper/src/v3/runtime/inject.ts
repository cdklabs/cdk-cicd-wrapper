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
import { AwsSolutionsChecks } from 'cdk-nag';
import { AppConfig } from '../appconfig/accessor';

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
 * The synthesizer the wrapper installs. `DefaultStackSynthesizer` is the v3 default
 * (app-staging is opt-in, still alpha). Forced deployer/CFN-exec roles from config are
 * threaded in at wave 3 (m3-forced-roles); today this just makes the wrapper the owner
 * of the choice so that later flip needs no bin change.
 */
export function resolveSynthesizer(_config: Record<string, unknown>): IReusableStackSynthesizer {
  return new DefaultStackSynthesizer();
}

/**
 * The post-construction wrapper core: register compliance Aspects and apply stack tags
 * from the resolved config, tree-wide. Safe to call on an already-constructed App, which
 * is what lets `attach()` reuse it.
 */
export function applyWrapper(app: App, config: Record<string, unknown>): void {
  // cdk-nag across the whole tree. Aspects visit before template emission, so this is the
  // right hook -- no need to monkeypatch synth().
  Aspects.of(app).add(new AwsSolutionsChecks());

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

function isConfigObject(value: unknown): value is Record<string, unknown> {
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
    appModule !== null && typeof appModule === 'object'
      ? Object.getOwnPropertyDescriptor(appModule, 'App')
      : undefined;
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
