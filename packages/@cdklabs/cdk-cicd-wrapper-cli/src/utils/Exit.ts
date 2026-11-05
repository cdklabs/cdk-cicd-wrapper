// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { logger } from './Logging';

/**
 * Terminate a command with a failure exit code.
 *
 * Replaces the yargs v17 singleton's `yargs.exit(code, error)`, which yargs 18 no longer exposes on
 * its module namespace. The error is logged at debug level only, matching `yargs.exit`, which recorded
 * the error without printing it; commands log their own user-facing message before exiting.
 */
export function exitWithError(code: number, error: Error): never {
  logger.debug(error.message);
  process.exit(code);
}
