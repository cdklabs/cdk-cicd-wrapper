// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { BOOTSTRAP_QUALIFIER_CONTEXT, DefaultStackSynthesizer } from 'aws-cdk-lib';
import { IConstruct } from 'constructs';

const BOOTSTRAP_QUALIFIER_PATTERN = /^[A-Za-z0-9_-]{1,10}$/;

/**
 * Normalize an explicitly configured CDK bootstrap qualifier.
 *
 * Authoring inputs may contain surrounding whitespace, but the resolved configuration, runtime
 * synthesizer, and pipeline IAM must all use the same trimmed, validated value.
 */
export function normalizeDefaultSynthesizerQualifier(qualifier: string): string {
  const normalized = qualifier.trim();
  if (!BOOTSTRAP_QUALIFIER_PATTERN.test(normalized)) {
    throw new Error(
      'cdk-cicd: explicit bootstrap qualifier must match the CDK contract `[A-Za-z0-9_-]{1,10}` ' +
        'after trimming surrounding whitespace.',
    );
  }
  return normalized;
}

/** Target values used to specialize a DefaultStackSynthesizer role ARN. */
export interface DefaultSynthesizerRoleArnOptions {
  /** Bootstrap qualifier. Defaults to the CDK default qualifier (`hnb659fds`). */
  readonly qualifier?: string;
  /** Concrete target AWS account. */
  readonly account: string;
  /** Concrete target AWS Region. */
  readonly region: string;
  /**
   * Concrete target AWS partition.
   *
   * When omitted, `${AWS::Partition}` remains intact to match the role ARN emitted in a cloud assembly.
   */
  readonly partition?: string;
}

/**
 * Specialize the literal placeholders accepted by CDK's DefaultStackSynthesizer role properties.
 *
 * CDK specializes qualifier, account, and Region while leaving the partition as
 * `${AWS::Partition}` in the cloud assembly. Callers rendering an IAM policy can additionally supply
 * a concrete partition.
 */
export function specializeDefaultSynthesizerRoleArn(
  roleArn: string,
  options: DefaultSynthesizerRoleArnOptions,
): string {
  const qualifier =
    options.qualifier === undefined
      ? DefaultStackSynthesizer.DEFAULT_QUALIFIER
      : normalizeDefaultSynthesizerQualifier(options.qualifier);
  const replacements: Array<readonly [string, string]> = [
    ['${Qualifier}', qualifier],
    ['${AWS::AccountId}', options.account],
    ['${AWS::Region}', options.region],
  ];
  if (options.partition !== undefined) {
    replacements.push(['${AWS::Partition}', options.partition]);
  }

  return replacements.reduce(
    (specialized, [placeholder, value]) => specialized.split(placeholder).join(value),
    roleArn,
  );
}

/**
 * Resolve the qualifier the DefaultStackSynthesizer bound below `scope` will use.
 *
 * An omitted property does not always mean `hnb659fds`: CDK first consults its bootstrap-qualifier
 * context key. Pipeline IAM must follow the same precedence as the application synthesizer.
 */
export function resolveDefaultSynthesizerQualifier(scope: IConstruct, configuredQualifier?: string): string {
  if (configuredQualifier !== undefined) return normalizeDefaultSynthesizerQualifier(configuredQualifier);

  const contextQualifier = scope.node.tryGetContext(BOOTSTRAP_QUALIFIER_CONTEXT);
  if (contextQualifier === undefined) return DefaultStackSynthesizer.DEFAULT_QUALIFIER;
  if (typeof contextQualifier !== 'string' || !BOOTSTRAP_QUALIFIER_PATTERN.test(contextQualifier)) {
    throw new Error(
      `cdk-cicd: context '${BOOTSTRAP_QUALIFIER_CONTEXT}' must match the CDK bootstrap qualifier ` +
        'contract `[A-Za-z0-9_-]{1,10}`.',
    );
  }
  return contextQualifier;
}
