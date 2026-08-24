// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { IConstruct, Node } from 'constructs';
import { ConfigError, ConfigErrorKind } from './error';
import { ConfigLoader } from './loader';
import { ConfigSchema, validateConfig } from './validation';

/**
 * How to resolve the application's configuration.
 *
 * Deliberately free of `NodeJS.ProcessEnv`: this struct crosses the jsii boundary into Python/Java/
 * .NET, so the two environment variables that actually matter are surfaced as named properties and
 * everything else is read from the ambient process environment.
 */
export interface AppConfigOptions {
  /** Stage whose config file to read, overriding `CDK_STAGE`. Defaults to `local`. */
  readonly stage?: string;

  /** Exact config file to read, overriding stage resolution (the `CONFIG_FILE` escape hatch). */
  readonly configFile?: string;

  /** What the config file must contain. Omitted means any shape is accepted. */
  readonly schema?: ConfigSchema;
}

/**
 * Reads the application configuration for the stage being synthesized.
 *
 * Two ways in, in precedence order:
 *
 * 1. **Injected context.** When the app runs under `cdk-cicd exec`, the wrapper has already resolved
 *    the config for the active stage and put it in construct context under `cicd:config`.
 *    `AppConfig.of(scope)` reads that, so the app does no file I/O and cannot disagree with the
 *    stage it was deployed as.
 * 2. **The config file.** With no injected context — a plain `cdk deploy` in the inner loop —
 *    resolution falls back to `config/<stage>.(json|yaml|yml)`, defaulting to `config/local.*`.
 *
 * The returned value is intentionally untyped (`any`, i.e. `Object`/`dict`/`Map` in the other jsii
 * languages). The config shape belongs to the *application*, not to the wrapper, and jsii cannot
 * express a generic. TypeScript callers get zero-friction typing by annotating the target:
 *
 * ```ts
 * interface MyConfig { readonly application: string }
 * const config: MyConfig = AppConfig.of(this);
 * ```
 */
export class AppConfig {
  /** Construct-context key the wrapper writes the resolved stage config under. */
  public static readonly CONTEXT_KEY = 'cicd:config';

  /**
   * Resolve the configuration for the active stage: injected context first, config file second.
   *
   * Throws a `ConfigError` when neither is available, or when what is found does not satisfy
   * `options.schema`. Left uncaught in a CDK app, that makes `cdk synth` exit non-zero and emit no
   * templates — the config is wrong, so no template built from it should exist.
   */
  public static of(scope: IConstruct, options: AppConfigOptions = {}): any {
    const injected = Node.of(scope).tryGetContext(AppConfig.CONTEXT_KEY);

    if (injected === undefined || injected === null) {
      return AppConfig.load(options);
    }

    if (typeof injected !== 'object' || Array.isArray(injected)) {
      throw new ConfigError(
        ConfigErrorKind.PARSE_ERROR,
        `Context '${AppConfig.CONTEXT_KEY}' is not a config object (got ${Array.isArray(injected) ? 'an array' : typeof injected})`,
      );
    }

    // Validated even though the wrapper produced it: the context can also be set by hand in
    // cdk.json or on the command line, and a bad hand-written value should fail the same way.
    return validateConfig(injected, `context '${AppConfig.CONTEXT_KEY}'`, options.schema);
  }

  /**
   * Read, merge and validate the config file directly, ignoring any injected context.
   *
   * Prefer `of(scope)`; reach for this only where there is no construct to read context from.
   */
  public static load(options: AppConfigOptions = {}): any {
    return ConfigLoader.load({ env: AppConfig.envFor(options), schema: options.schema });
  }

  /** Overlay the struct's explicit stage/file onto the ambient environment the loader resolves from. */
  private static envFor(options: AppConfigOptions): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (options.stage !== undefined) {
      env.CDK_STAGE = options.stage;
    }
    if (options.configFile !== undefined) {
      env.CONFIG_FILE = options.configFile;
    }
    return env;
  }

  private constructor() {}
}
