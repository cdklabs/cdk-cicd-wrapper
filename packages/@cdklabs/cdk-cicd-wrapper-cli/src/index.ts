// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-console */

import * as yargs from 'yargs';
import checkDependencies from './cmds/CheckDependenciesCommand';
import complianceBucket from './cmds/ComplianceBucketCommand';
import configure from './cmds/ConfigureCommand';
import license from './cmds/LicenseCommand';
import security from './cmds/SecurityCommand';
import validate from './cmds/ValidateCommand';
import { logger } from './utils/Logging';

/**
 * The main function sets up the command-line interface (CLI) using the yargs library.
 * It defines various commands, options, and configurations for the CLI.
 */
async function main() {
  const ya = yargs;

  // Register the command handlers
  ya.command(configure);
  ya.command(validate);
  ya.command(license);
  ya.command(complianceBucket);
  ya.command(security);
  ya.command(checkDependencies);

  // Enable command recommendations and strict command handling
  ya.recommendCommands();
  ya.strictCommands();

  // Configure CLI options
  ya.showHelpOnFail(true); // Show help on command failure
  ya.wrap(yargs.terminalWidth()); // Wrap command output to terminal width
  ya.options('debug', { type: 'boolean', default: false, desc: 'Debug logs' }); // Add a --debug option
  ya.completion(); // Enable command completion
  ya.help(); // Add a --help option

  // Ensure a command is provided
  ya.demandCommand();

  // Custom version option handling
  ya.version(); // Enabling the default --version option

  const args = await ya.argv; // Parse the command-line arguments

  // Enable debug mode if the --debug option is provided
  if (args.debug) {
    process.env.DEBUG = 'true';
  }
}

// Start the main function and handle any errors
main().catch((e) => {
  logger.error(e.stack); // Log the error stack trace
  process.exit(1); // Exit with a non-zero status code
});
