// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { ConfigError, ConfigErrorKind } from './error';

/** Shape a required field must satisfy. */
export enum FieldKind {
  /** A non-blank string. */
  STRING = 'string',
  /** A non-empty array. */
  STRING_LIST = 'string[]',
}

/** A required field addressed by dot-path, plus the shape it must satisfy. */
export interface RequiredField {
  /** Dot-path into the nested config, e.g. `aws.accountId`. */
  readonly path: string;

  /** The shape the value must have. */
  readonly kind: FieldKind;
}

/** A group of fields that becomes required only when `when` resolves to a present value. */
export interface ConditionalFieldGroup {
  /** Dot-path whose presence activates the group. */
  readonly when: string;

  /** Fields required once the group is active. */
  readonly fields: RequiredField[];
}

/** Caller-supplied description of what an application's config file must contain. */
export interface ConfigSchema {
  /** Fields whose absence is reported as `MISSING_KEY`. */
  readonly requiredKeys?: RequiredField[];

  /** Fields whose absence is reported as `MISSING_ATTRIBUTE`. */
  readonly requiredAttributes?: RequiredField[];

  /** Conditionally required fields; absence is reported as `MISSING_ATTRIBUTE`. */
  readonly conditionalGroups?: ConditionalFieldGroup[];
}

/** Read a dot-path (e.g. `aws.accountId`) out of a nested object. */
export function getByPath(obj: Record<string, unknown>, dotPath: string): unknown {
  return dotPath.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object' && !Array.isArray(acc)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** Returns true when a value is absent or fails its declared shape. */
export function isMissing(value: unknown, kind: FieldKind): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (kind === FieldKind.STRING_LIST) {
    return !Array.isArray(value) || value.length === 0;
  }
  return typeof value !== 'string' || value.trim().length === 0;
}

/**
 * Structurally validate a parsed config object against a caller-supplied schema.
 *
 * Throws a `ConfigError` naming the offending dot-path and the source file, so the failure is
 * actionable when it surfaces uncaught at a CDK app entry point.
 */
export function validateConfig(parsed: unknown, filePath: string, schema: ConfigSchema = {}): Record<string, unknown> {
  const obj: Record<string, unknown> =
    typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};

  for (const field of schema.requiredKeys ?? []) {
    if (isMissing(getByPath(obj, field.path), field.kind)) {
      throw new ConfigError(
        ConfigErrorKind.MISSING_KEY,
        `Missing or malformed required config key '${field.path}' in ${filePath} (expected ${field.kind})`,
      );
    }
  }

  for (const field of schema.requiredAttributes ?? []) {
    assertAttribute(obj, field, filePath);
  }

  for (const group of schema.conditionalGroups ?? []) {
    // Only required when the activating path is present. `null` counts as absent: in YAML a blank key
    // (`secondary:`) parses to `null` and means "I did not configure this", so it must not activate the
    // group and demand the fields underneath it.
    const activator = getByPath(obj, group.when);
    if (activator === undefined || activator === null) {
      continue;
    }
    for (const field of group.fields) {
      assertAttribute(obj, field, filePath);
    }
  }

  return obj;
}

function assertAttribute(obj: Record<string, unknown>, field: RequiredField, filePath: string): void {
  if (isMissing(getByPath(obj, field.path), field.kind)) {
    throw new ConfigError(
      ConfigErrorKind.MISSING_ATTRIBUTE,
      `Missing or malformed required config attribute '${field.path}' in ${filePath} (expected ${field.kind})`,
    );
  }
}
