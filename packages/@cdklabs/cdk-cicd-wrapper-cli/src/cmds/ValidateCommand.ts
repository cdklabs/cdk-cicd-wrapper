// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { readFileSync, existsSync } from 'fs';
import * as yargs from 'yargs';
import { CliHelpers } from '../utils/CliHelpers';
import { logger } from '../utils/Logging';

/**
 * The path to the package verification file.
 */
const VERIFICATION_FILE = './package-verification.json';

/**
 * The key used to store the lock file checksum in the package verification file.
 */
const LOCK_FILE = 'npm-lock-file';

/**
 * A class representing the 'validate' command for validating the CDK-CICD-Wrapper pipeline.
 */
class Command implements yargs.CommandModule {
  /**
   * Generates a checksum for the given file path and logs it to the console.
   * Also persists the checksum in the package verification file.
   *
   * @param {string} filePath - The path to the file for which the checksum needs to be generated.
   */
  static generateChecksum(filePath: string) {
    const hexCheckSum = CliHelpers.generateChecksum(filePath);
    logger.info(hexCheckSum);

    CliHelpers.persistChecksum(VERIFICATION_FILE, LOCK_FILE, hexCheckSum);
  }

  /**
   * Validates the checksum of the given file path against the expected hash value.
   * If the checksums do not match, logs an error message and exits the process with an error.
   *
   * @param {string} filePath - The path to the file for which the checksum needs to be validated.
   * @param {string} expectedHash - The expected hash value against which the checksum needs to be validated.
   */
  static validateChecksum(filePath: string, expectedHash: string) {
    const hexCheckSum = CliHelpers.generateChecksum(filePath);
    if (hexCheckSum !== expectedHash) {
      logger.warn(
        `File at ${filePath} has checksum ${hexCheckSum}, which does not match expected value ${expectedHash}`,
      );
      logger.info('This likely means dependencies have updated. You must get the changes approved before proceeding');
      logger.info('Once you get approval, update ./package-verification.json with the new hash to proceed');
      yargs.exit(1, new Error('Checksums do not match'));
    }
  }

  /**
   * The name of the command.
   */
  command = 'validate';

  /**
   * The description of the command.
   */
  describe = 'validate the CDK-CICD-Wrapper pipeline';

  /**
   * Builds the command arguments.
   *
   * @param {yargs.Argv} args - The yargs argument object.
   * @returns {yargs.Argv} The updated yargs argument object.
   */
  builder(args: yargs.Argv) {
    args.option('fix', {
      type: 'boolean',
      default: false,
      description: 'Generates a new verification checksum',
    });

    return args;
  }

  /**
   * The handler function for the command.
   *
   * @param {yargs.Arguments} args - The parsed arguments for the command.
   */
  handler(args: yargs.Arguments) {
    const npmLockFile = existsSync('package-lock.json')
      ? 'package-lock.json'
      : existsSync('npm-shrinkwrap.json')
        ? 'npm-shrinkwrap.json'
        : existsSync('yarn.lock')
          ? 'yarn.lock'
          : undefined;

    if (!npmLockFile) {
      yargs.exit(1, new Error('Could not find package-lock.json, yarn.lock, or npm-shrinkwrap.json'));
    } else {
      if (args.fix) {
        Command.generateChecksum(npmLockFile);
      } else {
        Command.validateChecksum(
          npmLockFile,
          JSON.parse(readFileSync(VERIFICATION_FILE, { encoding: 'utf8' }))[LOCK_FILE],
        );
      }
    }
  }
}

export default new Command();
