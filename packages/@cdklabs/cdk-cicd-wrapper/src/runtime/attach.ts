// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { App } from 'aws-cdk-lib';
import { applyWrapper, isConfigObject, markAppConstructed } from './inject';
import { AppConfig } from '../appconfig/accessor';

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
  public static attach(app: App): void {
    const injected = app.node.tryGetContext(AppConfig.CONTEXT_KEY);
    const config = isConfigObject(injected) ? injected : {};

    // Count this as a wrapped App so the bundled-app diagnostic (m2-bundled-diagnostic) sees the
    // wrapper WAS applied and stays silent -- attach is exactly the remedy that diagnostic points to.
    markAppConstructed();
    applyWrapper(app, config);
  }

  private constructor() {}
}
