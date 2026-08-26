# App-config loader — port reference (M1)

Source: the maintainer's external CDK project, shared as the port target for Milestone 1 and
**anonymized** here (domain-specific property names replaced with neutral placeholders). This repo is
public — do not reintroduce the original project's domain names, resource names, or account values.

**What to port vs. what is example.** The *machinery* below is what the wrapper ships, made **generic
over a user schema `<T>`**: `ConfigError`, `getByPath`, `isMissing`, the dot-path required-field tables
with **conditional groups**, and the `resolvePath` / `load` / `validate` flow. The `EnvConfig` interface
and the concrete field tables are **examples of what a user supplies** — the wrapper's own base schema
stays tiny (`aws`, `tags`, `removalPolicies`, `application`) and **excludes networking** by design.

## Deltas from this reference to Autopilot (must-change)

1. **Resolution keys off `CDK_STAGE`, not `ENVIRONMENT`**, and falls back to `config/local.*` (for a
   plain `cdk deploy`), not `dev`. Order: `CONFIG_FILE` → `config/<CDK_STAGE>.(json|yaml)` → `config/local.*`.
2. **Accept YAML as well as JSON** (`.json` / `.yaml` / `.yml`), same validation either way.
3. `deepMerge` / `applyDerivedDefaults` / `getDefaultConfig` / `DeepPartial` came from a `./defaults`
   module that was **not shared** — build greenfield to the documented behavior: `deepMerge` is a
   last-wins recursive merge; `applyDerivedDefaults` fills region inheritance and account-derived names;
   `getDefaultConfig` returns the (small) base defaults; `DeepPartial` is a standard recursive partial.
4. **jsii boundary:** the published accessor cannot be a TS generic (`config<T>()`) across
   Java/Python/.NET. Keep the generic loader usable from TS app code; expose the multi-language surface
   as a structured type or via `node.tryGetContext('cicd:config')`. (task.md M1e.)

## The portable machinery (anonymized)

```ts
import * as fs from 'fs';
import * as path from 'path';
import {
  applyDerivedDefaults,
  deepMerge,
  getDefaultConfig,
  type DeepPartial,
} from './defaults';

/**
 * Typed shape of an environment configuration file (`config/<env>.json`).
 * Organised into semantic groups (each group owns a cohesive capability) rather
 * than one flat bag of keys, so a reader finds "everything about X" in one place.
 *
 * NOTE (port): this is an EXAMPLE user schema. The wrapper's base schema is far
 * smaller and networking is user-land. Free of CDK imports so it stays a pure,
 * dependency-injectable unit (only Node built-ins).
 */
export interface EnvConfig {
  /** AWS account / region routing. */
  aws: {
    accountId: string;
    region: string;
    secondaryRegion?: string;
  };

  /** Application name used for resource naming. */
  appName?: string;

  /**
   * EXAMPLE app-specific group replacing `*.fromLookup` context lookups.
   * In Autopilot this belongs to the USER schema, not the wrapper base schema.
   */
  networking: {
    vpcId: string;
    availabilityZones: string[];
    publicSubnetIds: string[];
    privateSubnetIds: string[];
    region: string;
    /** Optional secondary-region VPC — drives a CONDITIONAL required group. */
    secondary?: {
      vpcId: string;
      availabilityZones: string[];
      subnetIds: string[];
      region: string;
    };
  };

  /** Stateful-resource retention. Both default to `retain`. */
  removalPolicies: {
    dynamoDBTable?: 'retain' | 'destroy';
    s3Bucket?: 'retain' | 'destroy';
  };

  /**
   * Cost-allocation/compliance stack tags applied verbatim to every top-level
   * stack. Free-form key→value bag: base defaults live in defaults, a config
   * file may add or override any key.
   */
  tags?: Record<string, string>;

  /** Free-form passthrough. */
  extraParams?: Record<string, string>;
}

/** Discriminator describing why configuration resolution/validation failed. */
export type ConfigErrorKind =
  'MISSING_FILE' | 'PARSE_ERROR' | 'MISSING_KEY' | 'MISSING_ATTRIBUTE';

/**
 * Error raised for every configuration failure. Distinct `kind` values let
 * callers (and tests) tell a missing file from a parse failure, and a missing
 * general key from a missing lookup-replacement attribute.
 */
export class ConfigError extends Error {
  constructor(
    public readonly kind: ConfigErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ConfigError';
    // Restore the prototype chain when targeting older runtimes.
    Object.setPrototypeOf(this, ConfigError.prototype);
  }
}

/** Type tag describing how a required field must be shaped. */
type FieldType = 'string' | 'string[]';

/** A required field addressed by dot-path plus the type it must satisfy. */
type RequiredField = readonly [path: string, type: FieldType];

/**
 * General required keys (dot-paths into the nested config). A missing entry is
 * reported as `MISSING_KEY`. (EXAMPLE table — a user supplies their own.)
 */
const REQUIRED_KEYS: ReadonlyArray<RequiredField> = [
  ['aws.accountId', 'string'],
  // Tags that must never be blank; the rest of the `tags` bag is free-form.
  ['tags.CostCode', 'string'],
  ['tags.ApplicationName', 'string'],
];

/**
 * Lookup-replacement attributes that back removed `Vpc.fromLookup` /
 * `HostedZone.fromLookup` calls. Missing → `MISSING_ATTRIBUTE`. (EXAMPLE.)
 */
const LOOKUP_ATTRIBUTES: ReadonlyArray<RequiredField> = [
  ['networking.vpcId', 'string'],
  ['networking.availabilityZones', 'string[]'],
  ['networking.publicSubnetIds', 'string[]'],
  ['networking.privateSubnetIds', 'string[]'],
  ['networking.region', 'string'],
];

/**
 * CONDITIONAL GROUP: these become required only when the parent
 * (`networking.secondary`) is present. Missing → `MISSING_ATTRIBUTE`.
 * This is the pattern the wrapper's generic validator must support.
 */
const SECONDARY_ATTRIBUTES: ReadonlyArray<RequiredField> = [
  ['networking.secondary.vpcId', 'string'],
  ['networking.secondary.availabilityZones', 'string[]'],
  ['networking.secondary.subnetIds', 'string[]'],
];

/** Read a dot-path (e.g. `dns.public.hostedZoneId`) out of a nested object. */
function getByPath(obj: Record<string, unknown>, dotPath: string): unknown {
  return dotPath.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object' && !Array.isArray(acc)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** Returns true when a value is absent or fails its declared shape. */
function isMissing(value: unknown, type: FieldType): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (type === 'string[]') {
    return !Array.isArray(value) || value.length === 0;
  }
  return typeof value !== 'string' || value.trim().length === 0;
}

/**
 * Pure resolver/loader/validator for environment configuration.
 * No CDK imports: depends only on Node built-ins, the opinionated defaults, and
 * an injectable environment map, keeping the module trivially testable.
 */
export class ConfigLoader {
  /**
   * Resolve the config file path. Total: never throws, always returns a
   * non-empty path.
   *
   * PORT DELTA: Autopilot uses CDK_STAGE and a `config/local.*` fallback, and accepts
   * .json/.yaml/.yml. This reference uses ENVIRONMENT → config/<env>.json → dev.
   */
  static resolvePath(env: NodeJS.ProcessEnv): string {
    const configFile = (env.CONFIG_FILE ?? '').trim();
    if (configFile.length > 0) {
      return configFile;
    }
    const environment = (env.ENVIRONMENT ?? '').trim() || 'dev';
    return path.join('config', `${environment}.json`);
  }

  /**
   * Read, merge with defaults, apply derived defaults, and validate the active
   * environment configuration. Layers file over defaults (`defaults < file`,
   * last-wins), then derived defaults fill region inheritance / derived names,
   * then structural validation.
   *
   * Throws a ConfigError (uncaught at the app entry point so `cdk synth` exits
   * non-zero and emits no templates) when the file is missing/unreadable, is
   * not valid JSON, or is missing a required key or lookup attribute.
   */
  static load(env: NodeJS.ProcessEnv = process.env): EnvConfig {
    const filePath = ConfigLoader.resolvePath(env);

    if (!fs.existsSync(filePath)) {
      throw new ConfigError('MISSING_FILE', `Config file not found: ${filePath}`);
    }

    let raw: string;
    try {
      raw = fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      throw new ConfigError(
        'MISSING_FILE',
        `Config file not readable: ${filePath} (${(error as Error).message})`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw); // PORT DELTA: branch on extension for YAML.
    } catch (error) {
      throw new ConfigError(
        'PARSE_ERROR',
        `Config file is not valid JSON: ${filePath} (${(error as Error).message})`,
      );
    }

    const fileConfig: DeepPartial<EnvConfig> =
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as DeepPartial<EnvConfig>)
        : {};

    const merged = deepMerge<EnvConfig>(getDefaultConfig(), fileConfig);
    const resolved = applyDerivedDefaults(merged);

    return ConfigLoader.validate(resolved, filePath);
  }

  /** Structurally validate required keys and lookup-replacement attributes. */
  static validate(parsed: unknown, filePath: string): EnvConfig {
    const obj: Record<string, unknown> =
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};

    for (const [fieldPath, type] of REQUIRED_KEYS) {
      if (isMissing(getByPath(obj, fieldPath), type)) {
        throw new ConfigError(
          'MISSING_KEY',
          `Missing required config key '${fieldPath}' in ${filePath}`,
        );
      }
    }

    for (const [fieldPath, type] of LOOKUP_ATTRIBUTES) {
      if (isMissing(getByPath(obj, fieldPath), type)) {
        throw new ConfigError(
          'MISSING_ATTRIBUTE',
          `Missing required lookup attribute '${fieldPath}' in ${filePath}`,
        );
      }
    }

    // Conditional group: only required when the parent is present.
    if (getByPath(obj, 'networking.secondary') !== undefined) {
      for (const [fieldPath, type] of SECONDARY_ATTRIBUTES) {
        if (isMissing(getByPath(obj, fieldPath), type)) {
          throw new ConfigError(
            'MISSING_ATTRIBUTE',
            `Missing required lookup attribute '${fieldPath}' in ${filePath}`,
          );
        }
      }
    }

    return obj as unknown as EnvConfig;
  }
}
```

## Test parity to preserve (from the reference's own suite intent)

- One case per `ConfigErrorKind`: `MISSING_FILE`, `PARSE_ERROR`, `MISSING_KEY`, `MISSING_ATTRIBUTE`.
- Conditional group: absent parent → passes; present-but-incomplete parent → `MISSING_ATTRIBUTE`.
- `resolvePath` totality: `CONFIG_FILE` wins; else stage-derived; else `local`. Never throws.
- Blank/whitespace strings and empty arrays count as missing (`isMissing`).
- Autopilot-added: JSON and YAML inputs validate identically.
