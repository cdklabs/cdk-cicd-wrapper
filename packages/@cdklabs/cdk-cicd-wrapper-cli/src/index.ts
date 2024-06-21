// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-console */
import * as yargs from 'yargs';
import checkDependencies from './cmds/CheckDependenciesCommand';
import complianceBucket from './cmds/ComplianceBucketCommand';
import analyzer from './cmds/AnalyzerCommand';
import configure from './cmds/ConfigureCommand';
import license from './cmds/LicenseCommand';
import security from './cmds/SecurityCommand';
import validate from './cmds/ValidateCommand';

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
  ya.command(analyzer);

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
  ya.version(false); // Disable the default --version option
  ya.option('version', {
    type: 'boolean',
    description: 'Show version number',
    global: false, // Restrict to the top-level command
  });

  const args = await ya.argv; // Parse the command-line arguments

  // Enable debug mode if the --debug option is provided
  if (args.debug) {
    process.env.DEBUG = 'true';
  }
}

// Start the main function and handle any errors
main().catch((e) => {
  console.error(e.stack); // Log the error stack trace
  process.exit(1); // Exit with a non-zero status code
});
