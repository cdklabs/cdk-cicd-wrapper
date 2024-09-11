// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-console */
import { spawnSync } from 'child_process';
import * as path from 'path';
import * as yargs from 'yargs';
import { logger } from '../utils/Logging';

/**
 * The path to the Python dependency check script.
 */
const CHECK_DEPENDENCIES_PYTHON = '../../scripts/check-deps-python.sh';

/**
 * The command for auditing NPM dependencies.
 */
const CHECK_DEPENDENCIES_NPM = 'better-npm-audit@3.7.3';

class Command implements yargs.CommandModule {
  /**
   * The name of the command.
   */
  command = 'check-dependencies';

  /**
   * A brief description of the command.
   */
  describe = 'check 3rd party dependencies, e.g: (python, npm)';

  /**
   * Configures the command arguments.
   * @param args - The argument parser.
   * @returns The configured argument parser.
   */
  builder(args: yargs.Argv) {
    args.option('python', {
      type: 'boolean',
      default: false,
      description: 'Check Python dependencies',
    });

    args.option('npm', {
      type: 'boolean',
      default: false,
      description: 'Check NPM dependencies',
    });

    return args;
  }

  /**
   * Handles the command execution.
   * @param args - The parsed command arguments.
   */
  handler(args: yargs.Arguments) {
    if (args.python) {
      logger.info('Checking Python dependencies');
      const command = path.join(__dirname, CHECK_DEPENDENCIES_PYTHON);

      const result = spawnSync(command, { stdio: 'inherit' });

      if (result.error) {
        throw result.error;
      }

      if (result.status !== 0) {
        throw new Error('Python dependencies check failed');
      }
    }

    if (args.npm) {
      logger.info('Checking NPM dependencies');

      const result = spawnSync(
        'npx',
        [CHECK_DEPENDENCIES_NPM, 'audit', '--level=high', '--registry=https://registry.npmjs.org/'],
        { stdio: 'inherit' },
      );

      if (result.error) {
        throw result.error;
      }

      if (result.status !== 0) {
        throw new Error('NPM dependencies check failed');
      }
    }
  }
}

/**
 * Exports the Command instance as the default export.
 */
export default new Command();
