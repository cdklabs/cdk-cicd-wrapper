// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-console */
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import * as path from 'path';

/**
 * A utility class providing helper functions for various command line operations.
 */
export class CliHelpers {
  /**
   * Determines the appropriate Python executable and pip executable based on the installed Python version.
   *
   * @returns An object containing the Python executable and pip executable paths.
   * @throws An error if Python is not installed.
   */
  static getPythonCommand() {
    // 1 min timeout
    const TIMEOUT = { timeout: 5 * 60 * 1000 };
    const pythonResults = spawnSync('python', ['-v'], {
      encoding: 'utf8',
      ...TIMEOUT,
    });

    if (pythonResults.status === 0 && pythonResults.output.find((line) => line?.match('.*Python 3.*'))) {
      return {
        pythonExecutable: 'python',
        pipExecutable: 'pip',
      };
    } else {
      const python3Results = spawnSync('python3', ['-v'], {
        encoding: 'utf8',
        ...TIMEOUT,
      });

      if (python3Results.status !== 0) {
        console.error('Python is not installed. Security checks will not be executed');
        throw new Error('Python is not installed. Security checks will not be executed');
      }
      return {
        pythonExecutable: 'python3',
        pipExecutable: 'pip3',
      };
    }
  }

  /**
   * Recursively searches for files matching the given pattern within a directory.
   *
   * @param match The regular expression pattern to match file names against.
   * @param directory The directory to search in.
   * @param excludes An optional regular expression pattern to exclude certain directories.
   * @param maxDept The maximum depth of recursion (default is 8).
   * @returns An array of absolute file paths that match the pattern.
   */
  static findRecursively(match: string, directory: string, excludes?: string, maxDept: number = 8) {
    const matches: string[] = [];

    function throughDirectory(dir: string, level: number = 0) {
      if (excludes && dir.match(excludes)) {
        return;
      }

      if (level > maxDept) {
        return;
      }

      readdirSync(dir).forEach((file) => {
        // Suppressed as no user input it used to manage the path and child_process
        // nosemgrep
        const absolute = path.join(dir, file);

        if (file.match(match)) {
          matches.push(absolute);
        } else if (statSync(absolute).isDirectory()) {
          throughDirectory(absolute, level + 1);
        }
      });
    }

    throughDirectory(directory, 0);

    return matches;
  }

  /**
   * Generates a SHA-256 checksum for the given file path.
   *
   * @param filePath The path to the file for which the checksum should be generated.
   * @returns The SHA-256 checksum of the file as a hexadecimal string.
   */
  static generateChecksum(filePath: string) {
    const checksum = createHash('sha256');
    checksum.update(readFileSync(filePath));
    return checksum.digest('hex');
  }

  /**
   * Generates a SHA-256 checksum for the given text.
   *
   * @param text The text for which the checksum should be generated.
   * @returns The SHA-256 checksum of the text as a hexadecimal string.
   */
  static generateChecksumForText(text: string) {
    const checksum = createHash('sha256');
    checksum.update(text);
    return checksum.digest('hex');
  }

  /**
   * Persists a checksum value to a verification file.
   *
   * @param verificationFile The path to the verification file.
   * @param checksumKey The key under which the checksum value should be stored.
   * @param checksumValue The checksum value to be persisted.
   */
  static persistChecksum(verificationFile: string, checksumKey: string, checksumValue: string) {
    let checkSumState: Record<string, string> = {};
    if (existsSync(verificationFile)) {
      checkSumState = JSON.parse(readFileSync(verificationFile, { encoding: 'utf8' })) as Record<string, string>;
    }

    checkSumState[checksumKey] = checksumValue;

    writeFileSync(verificationFile, JSON.stringify(checkSumState, null, 2));
  }
}
