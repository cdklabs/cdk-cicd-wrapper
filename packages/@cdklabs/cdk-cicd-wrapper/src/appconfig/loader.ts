// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { applyDerivedDefaults, deepMerge, getDefaultConfig } from './defaults';
import { ConfigError, ConfigErrorKind } from './error';
import { ConfigSchema, validateConfig } from './validation';

/** Config file extensions, in probing order: an existing `.json` wins, then `.yaml`, then `.yml`. */
const CONFIG_EXTENSIONS = ['.json', '.yaml', '.yml'];

/** Stage used when `CDK_STAGE` is not set — the plain `cdk deploy` inner loop. */
const LOCAL_STAGE = 'local';

/** Inputs to a config load. Every dependency is injectable, so the loader is trivially testable. */
export interface ConfigLoadOptions {
  /** Environment map driving path resolution and derived defaults. Defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv;

  /** What the config file must contain. Omitted means any shape is accepted. */
  readonly schema?: ConfigSchema;
}

/**
 * Pure resolver/loader/validator for an application's per-environment configuration.
 *
 * No CDK imports: depends only on Node built-ins, `yaml`, and an injectable environment map.
 */
export class ConfigLoader {
  /**
   * Resolve the active config file path. Total: never throws, always returns a non-empty path.
   *
   * Order: `CONFIG_FILE` → `config/<CDK_STAGE>.<ext>` → `config/local.<ext>`. The `local` fallback
   * applies when `CDK_STAGE` is unset; a stage whose file is missing is reported as `MISSING_FILE`
   * rather than silently falling back. When no extension exists on disk the `.json` path is returned,
   * so the caller reports `MISSING_FILE` against a concrete path.
   */
  public static resolvePath(env: NodeJS.ProcessEnv): string {
    const configFile = (env.CONFIG_FILE ?? '').trim();
    if (configFile.length > 0) {
      return configFile;
    }

    const stage = (env.CDK_STAGE ?? '').trim() || LOCAL_STAGE;
    const basePath = path.join('config', stage);

    for (const extension of CONFIG_EXTENSIONS) {
      if (fs.existsSync(`${basePath}${extension}`)) {
        return `${basePath}${extension}`;
      }
    }
    return `${basePath}${CONFIG_EXTENSIONS[0]}`;
  }

  /**
   * Read, merge with defaults, apply derived defaults, and validate the active configuration.
   * Layers `base defaults < file` (last wins), then derived defaults, then structural validation.
   *
   * Throws a `ConfigError` when the file is missing/unreadable, is not valid JSON/YAML, or is missing
   * a required key or attribute. Left uncaught at a CDK app entry point, this makes `cdk synth` exit
   * non-zero and emit no templates.
   */
  public static load<T>(options: ConfigLoadOptions = {}): T {
    const env = options.env ?? process.env;
    const filePath = ConfigLoader.resolvePath(env);

    if (!fs.existsSync(filePath)) {
      throw new ConfigError(ConfigErrorKind.MISSING_FILE, `Config file not found: ${filePath}`);
    }

    let raw: string;
    try {
      raw = fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      throw new ConfigError(
        ConfigErrorKind.MISSING_FILE,
        `Config file not readable: ${filePath} (${(error as Error).message})`,
      );
    }

    const parsed = ConfigLoader.parse(raw, filePath);
    const fileConfig: Record<string, unknown> =
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};

    const defaults: unknown = getDefaultConfig();
    const merged = deepMerge<Record<string, unknown>>(defaults as Record<string, unknown>, fileConfig);

    const validated: unknown = validateConfig(applyDerivedDefaults(merged, env), filePath, options.schema);
    return validated as T;
  }

  private static parse(raw: string, filePath: string): unknown {
    const extension = path.extname(filePath).toLowerCase();
    const isYaml = extension === '.yaml' || extension === '.yml';
    try {
      return isYaml ? yaml.parse(raw) : JSON.parse(raw);
    } catch (error) {
      throw new ConfigError(
        ConfigErrorKind.PARSE_ERROR,
        `Config file is not valid ${isYaml ? 'YAML' : 'JSON'}: ${filePath} (${(error as Error).message})`,
      );
    }
  }
}
