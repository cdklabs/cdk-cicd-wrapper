// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-console */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yargs from 'yargs';
import { BanditScanner, ScanningContext, SemgrepScanner, Shellcheck } from './scanners';
import { CliHelpers } from '../utils/CliHelpers';
import { logger } from '../utils/Logging';

const pythonExecutables = CliHelpers.getPythonCommand();

/**
 * The command to execute Python.
 */
const PYTHON_COMMAND = pythonExecutables.pythonExecutable;

/**
 * The command to execute Python's package installer (pip).
 */
const PIP_COMMAND = pythonExecutables.pipExecutable;

/**
 * Command module for security scanning.
 */
class Command implements yargs.CommandModule {
  /**
   * Array of security scanners to be used.
   */
  static scanners = [new BanditScanner(), new Shellcheck(), new SemgrepScanner()];

  /**
   * Creates a scanning environment and executes the provided scanning function.
   * @param ci Whether to generate CI reports or not.
   * @param scanning The function to execute for security scanning.
   * @returns The exit code of the scanning process.
   */
  static createScanningEnvironment(ci: boolean = false, scanning: (context: ScanningContext) => number) {
    let workingDir;
    let exitCode = 0;
    try {
      workingDir = mkdtempSync(path.join(os.tmpdir(), 'security'));
      const venvLocation = path.join(workingDir, '.venv');

      const vEnvCreation = spawnSync(PYTHON_COMMAND, ['-m', 'venv', venvLocation]);

      if (vEnvCreation.status !== 0) {
        throw new Error(`Failed to create virtual environment ${venvLocation}`);
      }

      let scanReportFolder;
      if (ci) {
        scanReportFolder = path.join(process.cwd(), 'junit-reports');

        if (!existsSync(scanReportFolder)) {
          mkdirSync(scanReportFolder);
        }
      }

      exitCode = scanning({
        projectRoot: process.cwd(),
        workingDir: workingDir,
        pip: path.join(venvLocation, 'bin', PIP_COMMAND),
        python: path.join(venvLocation, 'bin', PYTHON_COMMAND),
        scanReportFolder: scanReportFolder,
      });
    } catch (error) {
      logger.error(error);
      logger.error('Security scan failed');
      exitCode = 1;
    } finally {
      if (workingDir) {
        rmSync(workingDir, { recursive: true });
      }
    }

    return exitCode;
  }

  /**
   * The command name.
   */
  command = 'security-scan';

  /**
   * The command description.
   */
  describe = 'scan the codebase for security vulnerabilities';

  /**
   * Configures the command options.
   * @param args The yargs instance to configure options for.
   * @returns The modified yargs instance.
   */
  builder(args: yargs.Argv) {
    args.option('ci', {
      type: 'boolean',
      default: false,
      description: 'Generates reports files',
    });

    Command.scanners.forEach((scanner) => {
      scanner.addOptions(args);
    });

    return args;
  }

  /**
   * Handles the command execution.
   * @param args The parsed command-line arguments.
   */
  handler(args: yargs.Arguments) {
    const exitCode = Command.createScanningEnvironment(args.ci as boolean, (context) => {
      let results = 0;
      Command.scanners.forEach((scanner) => {
        results += scanner.scan(context, args);
      });

      if (results === 0) {
        logger.info('Security scan completed successfully');
      } else {
        logger.error('Security scan has finding to resolve.');
      }

      return results;
    });

    if (exitCode !== 0) {
      yargs.exit(exitCode, new Error('Security scanning has findings.'));
    }
  }
}

export default new Command();
