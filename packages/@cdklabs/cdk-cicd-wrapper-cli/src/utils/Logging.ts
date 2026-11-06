// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Logger } from 'tslog';

/** Render an unknown thrown value for the logger: the stack for an Error, else its string form. */
export function describeError(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

export const logger = new Logger({
  name: 'CDK CI/CD CLI',
  minLevel: 3,
  pretty: {
    template: '{{yyyy}}.{{mm}}.{{dd}} {{hh}}:{{MM}}:{{ss}}:{{ms}}\t{{logLevelName}}\t[{{name}}]\t',
  },
});
