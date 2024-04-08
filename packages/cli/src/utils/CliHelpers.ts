// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-console */
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import * as path from 'path';

export class CliHelpers {
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

  static generateChecksum(filePath: string) {
    const checksum = createHash('sha256');
    checksum.update(readFileSync(filePath));
    return checksum.digest('hex');
  }

  static generateChecksumForText(text: string) {
    const checksum = createHash('sha256');
    checksum.update(text);
    return checksum.digest('hex');
  }

  static persistChecksum(verificationFile: string, checksumKey: string, checksumValue: string) {
    let checkSumState: Record<string, string> = {};
    if (existsSync(verificationFile)) {
      checkSumState = JSON.parse(readFileSync(verificationFile, { encoding: 'utf8' })) as Record<string, string>;
    }

    checkSumState[checksumKey] = checksumValue;

    writeFileSync(verificationFile, JSON.stringify(checkSumState, null, 2));
  }
}
