// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { App, IAspect } from 'aws-cdk-lib';
import { applyWrapper, isConfigObject, markAppConstructed } from './inject';
import { PluginRef, registerPlugin } from './plugins';
import { AppConfig } from '../appconfig/accessor';

/** Options for `CdkCicd.attach`: override or opt out of the default security plugins from code. */
export interface AttachOptions {
  /**
   * Plugin selection, equivalent to `cicd.config.ts`'s `plugins`. Omitted keeps the config's
   * selection (or the defaults); a non-empty list COMPLETELY overrides it; an empty list opts out of
   * all plugins. A custom name here must have a matching `CdkCicd.addPlugin(app, ...)`.
   */
  readonly plugins?: PluginRef[];
  /** Shorthand for `plugins: []` -- opt out of every default plugin. Ignored when `plugins` is set. */
  readonly skipDefaults?: boolean;
}

/**
 * Explicit, reliable entry point for applying the wrapper when the `node -r` preload
 * (m2-register) cannot take effect -- bundled apps (esbuild inlines its own `App`), native
 * ESM, or a vendored aws-cdk-lib. In those cases the preload patches nothing observable and
 * the app would synthesize silently non-compliant; a single `CdkCicd.attach(app)` in bin/ is
 * the documented one-liner that restores the wrapper.
 *
 * It runs the SAME post-construction core as the preload (`applyWrapper`): cdk-nag Aspects and
 * stack tags, tree-wide. It cannot install the default synthesizer, because
 * `App.defaultStackSynthesizer` is constructor-only -- an app that needs a forced synthesizer
 * under a bundler passes it itself via `new App({ defaultStackSynthesizer })` (config-driven
 * forced roles are threaded in at wave 3).
 */
export class CdkCicd {
  /**
   * Apply the wrapper's Aspects and tags to an already-constructed `App`, reading the injected
   * `cicd:config` from its (fully-merged) context. Call it once: it is an alternative to the
   * preload, not a supplement, so calling it twice -- or alongside a preload that also ran -- adds
   * a second cdk-nag Aspect and evaluates the rules twice (tags are idempotent, same key wins).
   */
  public static attach(app: App, options?: AttachOptions): void {
    const injected = app.node.tryGetContext(AppConfig.CONTEXT_KEY);
    const config = isConfigObject(injected) ? { ...injected } : {};

    // Options win over the injected config's `plugins`: an explicit list overrides, and `skipDefaults`
    // is the `plugins: []` shorthand. Left unset, the injected config's selection (or the defaults)
    // stands. The selection is merged into the config object applyWrapper resolves from, so both the
    // config-driven and code-driven paths funnel through the same `resolvePlugins`.
    if (options?.plugins !== undefined) {
      config.plugins = options.plugins;
    } else if (options?.skipDefaults === true) {
      config.plugins = [];
    }

    // Count this as a wrapped App so the bundled-app diagnostic (m2-bundled-diagnostic) sees the
    // wrapper WAS applied and stays silent -- attach is exactly the remedy that diagnostic points to.
    markAppConstructed();
    applyWrapper(app, config);
  }

  /**
   * Register a custom security plugin: a real `IAspect` instance plus its `{ name, version }` identity.
   * Because a live Aspect cannot travel through CDK context, a plugin named in `cicd.config.ts` that is
   * not a built-in MUST be registered here in `bin/`; `applyWrapper`/`attach` then matches it by name.
   * Call before `attach` (or before the exec preload runs `applyWrapper`) so the registration is present
   * when plugins resolve.
   */
  public static addPlugin(app: App, aspect: IAspect, ref: PluginRef): void {
    registerPlugin(app, { ref, aspect });
  }

  private constructor() {}
}
