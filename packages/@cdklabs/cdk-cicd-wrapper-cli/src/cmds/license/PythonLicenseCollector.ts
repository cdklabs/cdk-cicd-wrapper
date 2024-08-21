// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { SpawnSyncOptions, spawnSync } from 'child_process';
import { readFileSync, openSync, writeFileSync } from 'fs';
import * as path from 'path';
import { parse, stringify } from 'csv/sync';
import { LicenseCollector, LicenseConfig, ScanningContext } from './Types';
import { CliHelpers } from '../../utils/CliHelpers';
import { logger } from '../../utils/Logging';

const PYTHON_LICENSE_CHECKER_TOOL = 'pip-licenses';

enum ProjectType {
  PIP,
  PIPENV,
}

interface ProjectInfo {
  name: string;
  projectFilePath: string;
  projectPath: string;
  projectRelativePath: string;
  noticeFile: string;
  summaryFile: string;
  projectType: ProjectType;
}

export class PythonLicenseCollector implements LicenseCollector {
  private pip: string;
  private python: string;
  private venvLocation: string;

  constructor(
    private config: LicenseConfig,
    private context: ScanningContext,
    private projectFiles: string[],
  ) {
    this.pip = 'pip';
    this.python = 'python';
    this.venvLocation = '';
  }

  collectLicenses() {
    logger.info('Checking Python dependencies');

    if (this.projectFiles.length === 0) {
      logger.info('No Python project files found.');
      return;
    }

    this.installPythonLibsForLicenseCheck();

    for (const projectFile of this.projectFiles) {
      const projectInfo = this.getProjectInfo(projectFile);
      this.runPythonLicenseCheck(projectInfo);
    }
  }

  /**
   * Installs the python dependencies used to do the license checking into the venv
   */
  private installPythonLibsForLicenseCheck() {
    this.venvLocation = path.join(this.context.workingDir, '.venv');

    const pythonCommands = CliHelpers.getPythonCommand();
    // Suppressed as no user input it used to manage the path and child_process
    // nosemgrep
    const vEnvCreation = spawnSync(pythonCommands.pythonExecutable, ['-m', 'venv', this.venvLocation]);

    if (vEnvCreation.status !== 0) {
      throw new Error(`Failed to create virtual environment ${this.venvLocation}`);
    }

    // Suppressed as no user input it used to manage the path and child_process
    // nosemgrep
    this.pip = path.join(this.venvLocation, 'bin', pythonCommands.pipExecutable);
    // Suppressed as no user input it used to manage the path and child_process
    // nosemgrep
    this.python = path.join(this.venvLocation, 'bin', pythonCommands.pythonExecutable);

    // Suppressed as no user input it used to manage the path and child_process
    // nosemgrep
    const pipUpgrade = spawnSync(this.pip, ['install', '--upgrade', 'pip'], {
      stdio: 'ignore',
      encoding: 'utf8',
      timeout: this.config.timeout,
    });

    if (pipUpgrade.status !== 0) {
      logger.debug('CMD:', this.pip, 'install', '--upgrade', 'pip');
      throw new Error(`Failed to upgrade pip because ${pipUpgrade.stderr}`);
    }

    var args = ['install', PYTHON_LICENSE_CHECKER_TOOL];

    if (this.projectFiles.some((projectFile) => projectFile.endsWith('Pipfile'))) {
      args.push('pipenv');
    }
    // Suppressed as no user input it used to manage the path and child_process
    // nosemgrep
    const pipInstall = spawnSync(this.pip, args, {
      encoding: 'utf8',
      timeout: this.config.timeout,
    });

    if (pipInstall.status !== 0) {
      logger.debug('CMD:', this.pip, ...args);
      throw new Error(`Failed to install ${PYTHON_LICENSE_CHECKER_TOOL} because ${pipInstall.stderr}`);
    }
  }

  private getProjectInfo(projectToCheck: string): ProjectInfo {
    const { projectRoot, workingDir } = this.context;
    const projectFilePath = projectToCheck;
    const projectPath = path.dirname(projectFilePath);
    const projectRelativePath = path.relative(projectRoot, projectToCheck);
    const noticeSuffix = projectRelativePath.replace(/\//g, '-');

    return {
      name: projectRelativePath,
      projectFilePath: projectFilePath,
      projectPath: projectPath,
      projectRelativePath: projectRelativePath,
      // Suppressed as no user input it used to manage the path and child_process
      // nosemgrep
      noticeFile: path.join(workingDir, `NOTICE.python.${noticeSuffix}`),
      // Suppressed as no user input it used to manage the path and child_process
      // nosemgrep
      summaryFile: path.join(workingDir, `OSS_License_Summary.python.${noticeSuffix}.csv`),
      projectType: projectToCheck.endsWith('Pipfile') ? ProjectType.PIPENV : ProjectType.PIP,
    };
  }

  /**
   * Collect the licenses of the Python project
   */
  private runPythonLicenseCheck(projectInfo: ProjectInfo) {
    logger.info(`Checking licenses in ${projectInfo.name}`);
    logger.debug('Project: ', projectInfo);
    process.env.PIPENV_IGNORE_VIRTUALENVS = '1';
    this.installPythonDependencies(projectInfo);
    this.checkedPythonBannedLicenses(projectInfo);
    this.generatePythonNotice(projectInfo);
    this.generatePythonSummary(projectInfo);
  }

  /**
   * Install the dependencies for the Python project`
   */
  private installPythonDependencies(projectInfo: ProjectInfo) {
    if (projectInfo.projectType === ProjectType.PIPENV) {
      // Suppressed as no user input it used to manage the path and child_process
      // nosemgrep
      const pipenvSync = spawnSync(this.python, ['-m', 'pipenv', 'sync'], {
        cwd: projectInfo.projectPath,
        stdio: 'pipe',
        encoding: 'utf8',
      });

      if (pipenvSync.status !== 0) {
        // Suppressed as no user input it used to manage the path and child_process
        // nosemgrep
        logger.debug('CMD:', this.python, '-m', 'pipenv', 'sync');
        logger.debug('STDOUT:', pipenvSync);
        throw new Error(`Failed to synchronize pipenv ${projectInfo.name}. Use --debug for more information.`);
      }
      // Suppressed as no user input it used to manage the path and child_process
      // nosemgrep
      const pipenvSyncVenvLocation = spawnSync(this.python, ['-m', 'pipenv', '--venv'], {
        cwd: projectInfo.projectPath,
        stdio: 'pipe',
        encoding: 'utf8',
      });

      if (pipenvSyncVenvLocation.status !== 0) {
        // Suppressed as no user input it used to manage the path and child_process
        // nosemgrep
        logger.debug('CMD:', this.python, '-m', 'pipenv', '--venv');
        logger.debug('STDOUT:', pipenvSyncVenvLocation);
        throw new Error(
          `Failed to retrieve pipenv venv location for ${projectInfo.name}. Use --debug for more information.`,
        );
      }

      this.venvLocation = pipenvSyncVenvLocation.stdout.trim();
    } else {
      const venvFolder = '.venv-' + projectInfo.name.replace(/\//g, '-');
      // Suppressed as no user input it used to manage the path and child_process
      // nosemgrep
      const venvLocation = path.join(this.context.workingDir, venvFolder);

      const pythonCommand = this.python;
      // Suppressed as no user input it used to manage the path and child_process
      // nosemgrep
      const vEnvCreation = spawnSync(pythonCommand, ['-m', 'venv', venvLocation]);

      if (vEnvCreation.status !== 0) {
        throw new Error(`Failed to create virtual environment ${venvLocation}`);
      }
      // Suppressed as no user input it used to manage the path and child_process
      // nosemgrep
      const pipInstall = spawnSync(path.join(venvLocation, 'bin', 'pip'), ['install', '-r', projectInfo.projectPath], {
        cwd: this.context.projectRoot,
        stdio: 'inherit',
        encoding: 'utf8',
        timeout: this.config.timeout,
      });

      if (pipInstall.status !== 0) {
        // Suppressed as no user input it used to manage the path and child_process
        // nosemgrep
        logger.debug('CMD:', path.join(venvLocation, 'bin', 'pip'), 'install', '-r', projectInfo.projectPath);
        throw new Error(`Failed to install dependencies listed in ${projectInfo.name}`);
      }
    }
  }

  /**
   * Verifies there are no banned Licenses across the dependencies used.
   */
  private checkedPythonBannedLicenses(projectInfo: ProjectInfo) {
    const commandArgs = [
      // Suppressed as no user input it used to manage the path and child_process
      // nosemgrep
      `--python=${path.join(this.venvLocation, 'bin', 'python')}`,
      `--fail-on=${this.config.failOnLicenses.join(';')}`,
    ];

    this.addPythonPackageExclusion(commandArgs);

    const options: SpawnSyncOptions = {
      encoding: 'utf8',
      stdio: 'inherit',
      timeout: this.config.timeout,
    };
    const commandResults = spawnSync(
      // Suppressed as no user input it used to manage the path and child_process
      // nosemgrep
      path.join(this.context.workingDir, '.venv', 'bin', PYTHON_LICENSE_CHECKER_TOOL),
      commandArgs,
      options,
    );

    if (commandResults.status !== 0) {
      logger.error(`Module ${projectInfo.name} failed the license check. It contains dependency with banned license.`);
      // Suppressed as no user input it used to manage the path and child_process
      // nosemgrep
      logger.debug(
        'CMD:',
        path.join(this.context.workingDir, '.venv', 'bin', PYTHON_LICENSE_CHECKER_TOOL),
        ...commandArgs,
      );
      throw new Error(
        `Module ${projectInfo.name} failed the license check. It contains dependency with banned license.`,
      );
    }
  }

  /**
   * Extends the base list of command line arguments to exclude packages from the license check
   *
   * @param commandArgs base list of command line arguments
   */
  private addPythonPackageExclusion(commandArgs: string[]) {
    if (this.config.python.excluded && this.config.python.excluded.length != 0) {
      commandArgs.push('--ignore-packages', ...this.config.python.excluded);
    }
  }

  /**
   * Generates the summary of the various license types used in the Python project
   */
  private generatePythonSummary(projectInfo: ProjectInfo) {
    const commandArgs = [
      // Suppressed as no user input it used to manage the path and child_process
      // nosemgrep
      `--python=${path.join(this.venvLocation, 'bin', 'python')}`,
      '--summary',
      '-f',
      'csv',
    ];

    this.addPythonPackageExclusion(commandArgs);

    const options: SpawnSyncOptions = {
      encoding: 'utf8',
      stdio: ['ignore', openSync(projectInfo.summaryFile, 'w'), 0],
      timeout: this.config.timeout,
    };

    const commandResults = spawnSync(
      // Suppressed as no user input it used to manage the path and child_process
      // nosemgrep
      path.join(this.context.workingDir, '.venv', 'bin', PYTHON_LICENSE_CHECKER_TOOL),
      commandArgs,
      options,
    );

    if (commandResults.status !== 0) {
      logger.error(`Module ${projectInfo.name} failed the license check.`);
      // Suppressed as no user input it used to manage the path and child_process
      // nosemgrep
      logger.debug(
        'CMD:',
        path.join(this.context.workingDir, '.venv', 'bin', PYTHON_LICENSE_CHECKER_TOOL),
        ...commandArgs,
      );
      throw new Error(`Module ${projectInfo.name} failed the license check.`);
    }

    const csvValues = parse(readFileSync(projectInfo.summaryFile, { encoding: 'utf8' }), {
      delimiter: ',',
      columns: true,
      quote: true,
    });

    let output = '#########################\n';
    output += `# Python module: ${projectInfo.name}\n`;
    output += '#########################\n';
    output += stringify(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.entries(csvValues).map((row: any) => ({
        License: row[1].License,
        Count: row[1].Count,
      })),
      { header: true, quoted: true },
    );
    writeFileSync(projectInfo.summaryFile, output);
  }

  /**
   * Generates the temporary NOTICE file based on the dependencies used in the Python project
   */
  private generatePythonNotice(projectInfo: ProjectInfo) {
    const commandArgs = [
      // Suppressed as no user input it used to manage the path and child_process
      // nosemgrep
      `--python=${path.join(this.venvLocation, 'bin', 'python')}`,
      '--format=plain-vertical',
      '--with-license-file',
      '--no-license-path',
    ];

    this.addPythonPackageExclusion(commandArgs);

    const options: SpawnSyncOptions = {
      encoding: 'utf8',
      stdio: ['ignore', openSync(projectInfo.noticeFile, 'w'), 0],
      timeout: this.config.timeout,
    };

    const commandResults = spawnSync(
      // Suppressed as no user input it used to manage the path and child_process
      // nosemgrep
      path.join(this.context.workingDir, '.venv', 'bin', PYTHON_LICENSE_CHECKER_TOOL),
      commandArgs,
      options,
    );

    if (commandResults.status !== 0) {
      logger.error(`Module ${projectInfo.name} failed the license check.`);
      // Suppressed as no user input it used to manage the path and child_process
      // nosemgrep
      logger.debug(
        'CMD:',
        path.join(this.context.workingDir, '.venv', 'bin', PYTHON_LICENSE_CHECKER_TOOL),
        ...commandArgs,
      );
      throw new Error(`Module ${projectInfo.name} failed the license check.`);
    }
  }
}
