// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-console */
import { SpawnSyncOptions, spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, openSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as globby from 'globby';
import * as yargs from 'yargs';
import { CliHelpers } from '../utils/CliHelpers';

// 2 min timeout
const GLOBAL_TIMEOUT = { timeout: 2 * 60 * 1000 };

const pythonExecutables = CliHelpers.getPythonCommand();

const PYTHON_COMMAND = pythonExecutables.pythonExecutable;
const PIP_COMMAND = pythonExecutables.pipExecutable;

interface ScanningContext {
  readonly projectRoot: string;
  readonly workingDir: string;
  readonly pip: string;
  readonly python: string;
  readonly scanReportFolder?: string;
}

abstract class SecurityScanner {
  constructor(
    readonly command: string,
    readonly defaultVersion: string,
    readonly packageName: string,
    readonly additionalPackages: string[] = [],
  ) {}

  addOptions(args: yargs.Argv) {
    args.option(this.command, {
      type: 'boolean',
      default: false,
      requiresArg: false,
      description: `Use ${this.command} ${this.defaultVersion} for security scanning.`,
    });

    args.option(`${this.command}-version`, {
      type: 'string',
      default: this.defaultVersion,
      requiresArg: false,
      description: `Use ${this.command} ${this.defaultVersion} for security scanning.`,
    });

    return args;
  }

  install(context: ScanningContext, version: string) {
    console.log(`Installing ${this.packageName} ${version}`);

    const commandArgs = ['install', '-q', '--upgrade', `${this.packageName}==${version}`, ...this.additionalPackages];

    // Suppressed as no user input it used to manage the path and child_process
    // nosemgrep
    const commandResults = spawnSync(context.pip, commandArgs, {
      encoding: 'utf8',
      stdio: ['ignore', 'inherit', 'inherit'],
      ...GLOBAL_TIMEOUT,
    });

    if (commandResults.status !== 0) {
      console.error(`Failed to install ${this.packageName} ${version}`);
      throw new Error(`Failed to install ${this.packageName} ${version}`);
    }

    return;
  }

  protected abstract doScan(context: ScanningContext, args: yargs.Arguments): number;

  scan(context: ScanningContext, args: yargs.Arguments) {
    const version = args[`${this.command}-version`] as string;

    let result = 0;
    if (args[this.command]) {
      this.install(context, version);
      console.log(`Scanning with ${this.command} ${version}`);
      const errorCode = this.doScan(context, args);
      console.log(`Scanning with ${this.command} ${version} completed with status: ${errorCode}`);

      result = errorCode;
    } else {
      console.log(`Scanning with ${this.command} has been skipped by user.`);
    }
    return result;
  }
}

class Shellcheck extends SecurityScanner {
  constructor() {
    super('shellcheck', '0.9.0.6', 'shellcheck-py');
  }

  override addOptions(args: yargs.Argv) {
    super.addOptions(args);

    args.option('severity', {
      type: 'string',
      default: 'error',
      requiresArg: false,
      description: 'Severity level for shellcheck',
    });

    return args;
  }

  protected doScan(context: ScanningContext, args: yargs.Arguments): number {
    const severity = args.severity as string;

    const commandArgs = ['-x', `--severity=${severity}`];
    const options: SpawnSyncOptions = {
      encoding: 'utf8',
      stdio: 'inherit',
      ...GLOBAL_TIMEOUT,
    };

    if (args.ci) {
      commandArgs.push('-f');
      commandArgs.push('checkstyle');
      options.stdio = [
        'ignore',
        // Suppressed as no user input it used to manage the path and child_process
        // nosemgrep
        openSync(path.join(context.scanReportFolder!, 'shellcheck-checkstyle-results.xml'), 'w'),
        0,
      ];
    }

    const files: string[] = globby.sync('*.{sh,bash,ksh}', {
      absolute: true,
      gitignore: true,
      baseNameMatch: true,
      cwd: context.projectRoot,
    });

    // no files to check
    if (files.length == 0) {
      console.log('No files to analyze with Shellcheck.');

      return 0;
    }

    commandArgs.push(...files);
    // Suppressed as no user input it used to manage the path and child_process
    // nosemgrep
    const commandResults = spawnSync(path.join(context.workingDir, '.venv', 'bin', this.command), commandArgs, options);

    if (commandResults.error) {
      throw commandResults.error;
    }

    return commandResults.status || 0;
  }
}

class SemgrepScanner extends SecurityScanner {
  constructor() {
    super('semgrep', '1.55.0', 'semgrep', ['jsonschema']);
  }

  protected doScan(context: ScanningContext, args: yargs.Arguments): number {
    const commandArgs = [
      'scan',
      '--config',
      'p/default',
      '--metrics=off',
      '--error',
      '--exclude',
      'cdk.context.json',
      '--exclude',
      'export_vars.sh',
      '--exclude',
      '.npmrc',
      '--exclude',
      '.env*',
    ];
    const options: SpawnSyncOptions = {
      encoding: 'utf8',
      stdio: 'inherit',
      ...GLOBAL_TIMEOUT,
    };

    if (args.ci) {
      commandArgs.push('-q');
      commandArgs.push('--junit-xml');
      // Suppressed as no user input it used to manage the path and child_process
      // nosemgrep
      options.stdio = ['ignore', openSync(path.join(context.scanReportFolder!, 'semgrep-junit-results.xml'), 'w'), 0];
    }
    commandArgs.push(context.projectRoot);

    // Suppressed as no user input it used to manage the path and child_process
    // nosemgrep
    const commandResults = spawnSync(path.join(context.workingDir, '.venv', 'bin', this.command), commandArgs, options);

    if (commandResults.error) {
      throw commandResults.error;
    }

    return commandResults.status || 0;
  }
}

class BanditScanner extends SecurityScanner {
  constructor() {
    super('bandit', '1.7.5', 'bandit');
  }

  protected doScan(context: ScanningContext, args: yargs.Arguments): number {
    const commandArgs = ['-m', this.command, '-x', '**node_modules/*,**cdk.out/*,**docs/*', '-r', context.projectRoot];
    const options: SpawnSyncOptions = { encoding: 'utf8', stdio: 'inherit' };

    const banditConfigs = globby.sync('bandit.{yml,yaml}', { cwd: context.projectRoot, deep: 0 });

    if (banditConfigs.length > 0) {
      commandArgs.push('-c', banditConfigs[0]);
    }

    if (args.ci) {
      commandArgs.push('-f', 'xml');
      commandArgs.push('-q');
      // Suppressed as no user input it used to manage the path and child_process
      // nosemgrep
      options.stdio = ['ignore', openSync(path.join(context.scanReportFolder!, 'bandit-junit-results.xml'), 'w'), 0];
    }

    // Suppressed as no user input it used to manage the path and child_process
    // nosemgrep
    const commandResults = spawnSync(context.python, commandArgs, options);

    if (commandResults.error) {
      throw commandResults.error;
    }

    return commandResults.status || 0;
  }
}

class Command implements yargs.CommandModule {
  static scanners = [new BanditScanner(), new Shellcheck(), new SemgrepScanner()];

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
      console.error(error);
      console.error('Security scan failed');
      exitCode = 1;
    } finally {
      if (workingDir) {
        rmSync(workingDir, { recursive: true });
      }
    }

    return exitCode;
  }

  command = 'security-scan';

  describe = 'Scans the codebase for security vulnerabilities.';

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

  handler(args: yargs.Arguments) {
    const exitCode = Command.createScanningEnvironment(args.ci as boolean, (context) => {
      let results = 0;
      Command.scanners.forEach((scanner) => {
        results += scanner.scan(context, args);
      });

      if (results === 0) {
        console.log('Security scan completed successfully');
      } else {
        console.error('Security scan has finding to resolve.');
      }

      return results;
    });

    if (exitCode !== 0) {
      yargs.exit(exitCode, new Error('Security scanning has findings.'));
    }
  }
}

export default new Command();
