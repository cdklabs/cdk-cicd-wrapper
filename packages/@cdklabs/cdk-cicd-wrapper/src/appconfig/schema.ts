// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/** Retention behaviour for a class of stateful resources. */
export enum RemovalPolicyValue {
  /** Keep the resource when its stack is deleted. */
  RETAIN = 'retain',
  /** Delete the resource when its stack is deleted. */
  DESTROY = 'destroy',
}

/** AWS account / region routing for the active stage. */
export interface AwsEnvironment {
  /** Target account id. Derived from `CDK_DEFAULT_ACCOUNT` when the config file omits it. */
  readonly accountId?: string;

  /** Target region. Derived from `CDK_DEFAULT_REGION` (or `AWS_REGION`) when the config file omits it. */
  readonly region?: string;
}

/** Retention of stateful resources. Both default to `RETAIN`. */
export interface RemovalPolicies {
  /** Retention for DynamoDB tables. */
  readonly dynamoDBTable?: RemovalPolicyValue;

  /** Retention for S3 buckets. */
  readonly s3Bucket?: RemovalPolicyValue;
}

/**
 * The wrapper's opinionated base schema for an application config file. Deliberately tiny — an
 * application extends it with its own per-environment shape, or ignores it entirely.
 *
 * Networking is intentionally NOT part of the base schema: VPC/subnet/hosted-zone shapes are too
 * application-specific, so they live in the user's own schema.
 */
export interface BaseConfig {
  /** Application name used for resource naming. */
  readonly application?: string;

  /** Account / region routing. */
  readonly aws: AwsEnvironment;

  /** Free-form cost-allocation/compliance tags. Base defaults may be added to or overridden. */
  readonly tags: { [key: string]: string };

  /** Stateful-resource retention. */
  readonly removalPolicies: RemovalPolicies;

  /**
   * CloudWatch Logs retention, in days, the wrapper forces on any log group that does not already set
   * one explicitly (applied tree-wide as an Aspect by the runtime injection hook). Defaults to 365,
   * matching v2's `PipelineBlueprint.logRetentionInDays`.
   */
  readonly logRetentionInDays: number;
}
