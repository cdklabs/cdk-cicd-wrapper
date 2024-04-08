// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-console */
import { readFileSync, existsSync } from 'fs';
import * as yargs from 'yargs';
import { CliHelpers } from '../utils/CliHelpers';

const VERIFICATION_FILE = './package-verification.json';
const LOCK_FILE = 'npm-lock-file';

class Command implements yargs.CommandModule {
  static generateChecksum(filePath: string) {
    const hexCheckSum = CliHelpers.generateChecksum(filePath);
    console.log(hexCheckSum);

    CliHelpers.persistChecksum(VERIFICATION_FILE, LOCK_FILE, hexCheckSum);
  }

  static validateChecksum(filePath: string, expectedHash: string) {
    const hexCheckSum = CliHelpers.generateChecksum(filePath);
    if (hexCheckSum !== expectedHash) {
      console.log(
        `File at ${filePath} has checksum ${hexCheckSum}, which does not match expected value ${expectedHash}`,
      );
      console.log('This likely means dependencies have updated. You must get the changes approved before proceeding');
      console.log('Once you get approval, update ./package-verification.json with the new hash to proceed');
      yargs.exit(1, new Error('Checksums do not match'));
    }
  }

  command = 'validate';

  describe = 'Validates the vanilla-pipeline';

  builder(args: yargs.Argv) {
    args.option('fix', {
      type: 'boolean',
      default: false,
      description: 'Generates a new verification checksum',
    });

    return args;
  }

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
