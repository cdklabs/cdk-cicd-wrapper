// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-console */
import { spawnSync } from 'child_process';
import * as path from 'path';
import * as yargs from 'yargs';

/**
 * Path to the configure script relative to the current directory.
 */
const CONFIGURE_SCRIPT = '../../scripts/configure.sh';

/**
 * Command class for configuring the pipeline.
 */
class Command implements yargs.CommandModule {
  /**
   * The command name.
   */
  command = 'configure';

  /**
   * A description of the command.
   */
  describe = 'Configures the CDK-CICD-Wrapper pipeline';

  /**
   * Builds the command arguments.
   * @param args The argument parser.
   * @returns The argument parser with added arguments.
   */
  builder(args: yargs.Argv) {
    return args;
  }

  /**
   * Handles the command execution.
   */
  handler() {
    // Join the current directory path with the configure script path
    const command = path.join(__dirname, CONFIGURE_SCRIPT);

    // Spawn a new process to execute the configure script
    const result = spawnSync(command, { stdio: 'inherit' });

    // If an error occurred during the execution, throw it
    if (result.error) {
      throw result.error;
    }
  }
}

// Export a new instance of the Command class
export default new Command();
