// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/** Discriminator describing why configuration resolution/validation failed. */
export enum ConfigErrorKind {
  /** The resolved config file does not exist or cannot be read. */
  MISSING_FILE = 'MISSING_FILE',
  /** The config file exists but is not valid JSON/YAML. */
  PARSE_ERROR = 'PARSE_ERROR',
  /** A required config key is absent or blank. */
  MISSING_KEY = 'MISSING_KEY',
  /** A required attribute (unconditional or within a satisfied conditional group) is absent or blank. */
  MISSING_ATTRIBUTE = 'MISSING_ATTRIBUTE',
}

/**
 * Error raised for every configuration failure. Distinct `kind` values let callers (and tests) tell a
 * missing file from a parse failure, and a missing general key from a missing attribute.
 */
export class ConfigError extends Error {
  /** Why the configuration failed. */
  public readonly kind: ConfigErrorKind;

  constructor(kind: ConfigErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'ConfigError';
    // Restore the prototype chain when targeting older runtimes.
    Object.setPrototypeOf(this, ConfigError.prototype);
  }
}
