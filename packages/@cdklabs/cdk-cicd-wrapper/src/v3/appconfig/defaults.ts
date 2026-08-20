// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { BaseConfig, RemovalPolicyValue } from './schema';

/**
 * Standard recursive partial. TypeScript-only helper describing the shape of a config *file* (every
 * level optional) — it is never part of an exported jsii signature.
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/** Keys that must never be written through a merge, to avoid prototype pollution. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeRecords(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    if (UNSAFE_KEYS.has(key)) {
      continue;
    }
    const value = override[key];
    if (value === undefined) {
      // An absent override never clobbers a base value.
      continue;
    }
    const existing = result[key];
    if (isPlainObject(value)) {
      // Recurse even when the base has nothing here. Assigning the override's subtree directly would
      // both alias the caller's parsed object into the result and skip the UNSAFE_KEYS filter at every
      // level below this one -- and since the base schema is tiny, every application-specific group
      // takes exactly that path.
      result[key] = mergeRecords(isPlainObject(existing) ? existing : {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Last-wins recursive merge of plain objects. Nested objects are merged; arrays and scalars from the
 * override replace the base value outright. Only own enumerable keys are considered.
 */
export function deepMerge<T>(base: T, override: DeepPartial<T>): T {
  return mergeRecords(
    base as unknown as Record<string, unknown>,
    override as unknown as Record<string, unknown>,
  ) as unknown as T;
}

/** The wrapper's base defaults, layered underneath the application's config file. */
export function getDefaultConfig(): BaseConfig {
  return {
    aws: {},
    tags: {},
    removalPolicies: {
      dynamoDBTable: RemovalPolicyValue.RETAIN,
      s3Bucket: RemovalPolicyValue.RETAIN,
    },
  };
}

/**
 * Fill `aws.accountId` / `aws.region` from the CDK-provided environment when the merged config does
 * not already carry them. An explicit value from the config file is never overridden.
 *
 * `null` counts as absent, not as an explicit value: in YAML a blank key (`accountId:`) parses to
 * `null` and means "I did not set this", so it must still be derived.
 */
export function applyDerivedDefaults<T>(config: T, env: NodeJS.ProcessEnv): T {
  const obj = config as unknown as Record<string, unknown>;
  const aws: Record<string, unknown> = isPlainObject(obj.aws) ? { ...obj.aws } : {};

  if (aws.accountId === undefined || aws.accountId === null) {
    const accountId = (env.CDK_DEFAULT_ACCOUNT ?? '').trim();
    if (accountId.length > 0) {
      aws.accountId = accountId;
    }
  }

  if (aws.region === undefined || aws.region === null) {
    const region = (env.CDK_DEFAULT_REGION ?? env.AWS_REGION ?? '').trim();
    if (region.length > 0) {
      aws.region = region;
    }
  }

  return { ...obj, aws } as unknown as T;
}
