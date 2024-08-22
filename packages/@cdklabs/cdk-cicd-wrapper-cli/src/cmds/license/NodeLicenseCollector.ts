// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { SpawnSyncOptions, spawnSync } from 'child_process';
import { existsSync, readFileSync, openSync, writeFileSync } from 'fs';
import * as path from 'path';
import { parse, stringify } from 'csv/sync';

import { LicenseCollector, LicenseConfig, ScanningContext } from './Types';
import { logger } from '../../utils/Logging';

const NPM_LICENSE_CHECKER_TOOL = 'license-checker-rseidelsohn';

enum ProjectType {
  NPM,
  YARN,
}

interface ProjectInfo {
  name: string;
  projectPath: string;
  projectFilePath: string;
  projectRelativePath: string;
  noticeFile: string;
  summaryFile: string;
  projectType: ProjectType;
}

export class NodeLicenseCollector implements LicenseCollector {
  constructor(
    private config: LicenseConfig,
    private context: ScanningContext,
    private projectFiles: string[],
  ) {}

  collectLicenses() {
    logger.info('Checking NPM dependencies');
    for (const projectFile of this.projectFiles) {
      const projectInfo = this.getProjectInfo(projectFile);
      this.runNPMLicenseCheck(projectInfo);
    }
  }

  private getProjectInfo(npmProjectToCheck: string): ProjectInfo {
    const { projectRoot, workingDir } = this.context;
    const projectFilePath = npmProjectToCheck;
    const projectPath = path.dirname(projectFilePath);
    const projectRelativePath = path.relative(projectRoot, npmProjectToCheck);
    const noticeSuffix = projectRelativePath.replace(/\//g, '-');

    return {
      name: projectRelativePath,
      projectFilePath: projectFilePath,
      projectPath: projectPath,
      projectRelativePath: projectRelativePath,
      // Suppressed as no user input it used to manage the path and child_process
      // nosemgrep
      noticeFile: path.join(workingDir, `NOTICE.npm.${noticeSuffix}`),
      // Suppressed as no user input it used to manage the path and child_process
      // nosemgrep
      summaryFile: path.join(workingDir, `OSS_License_Summary.npm.${noticeSuffix}.csv`),
      // Suppressed as no user input it used to manage the path and child_process
      // nosemgrep
      projectType: existsSync(path.join(projectPath, 'yarn.lock')) ? ProjectType.YARN : ProjectType.NPM,
    };
  }

  /**
   * Collect the licenses of the NPM dependencies of the project.
   * When the NPM project doesn't have a package-lock.json or npm-shrinkwrap.json file, it is assumed that all its dependencies are listed in a higher level package.json.
   *
   */
  private runNPMLicenseCheck(projectInfo: ProjectInfo) {
    logger.info(`Checking licenses in ${projectInfo.name}`);
    logger.debug('Project: ', projectInfo);
    if (this.isProjectLockExists(projectInfo)) {
      if (this.config.npm.cleanInstall) {
        this.runNPMCI(projectInfo);
      }

      this.checkedNPMBannedLicenses(projectInfo);
      this.generateNPMNotice(projectInfo);
      this.generateNPMSummary(projectInfo);
    } else {
      logger.info(
        `NPM project ${projectInfo.name} doesn't have a lock file (package-lock.json, yarn.lock, or npm-shrinkwrap.json).`,
      );
      logger.warn("It is assumed that their dependencies are part of another project's dependency list.");
      logger.warn('If this is not the case, please create the lock file with executing npm install.');
    }
  }

  /**
   * Installs the NPM dependencies as that is required to be locally present for the license checker tool.
   *
   * @param projectWorkingDirectory - Working directory of the folder.
   */
  private runNPMCI(projectInfo: ProjectInfo) {
    logger.info(`Fetching Node packages in folder ${projectInfo.projectPath}`);

    // Suppressed as no user input it used to manage the path and child_process
    // nosemgrep
    const commandArgs =
      projectInfo.projectType == ProjectType.YARN ? ['install', '--check-files', '--frozen-lockfile'] : ['ci'];

    // Suppressed as no user input it used to manage the path and child_process
    // nosemgrep
    const command = projectInfo.projectType == ProjectType.YARN ? 'yarn' : 'npm';

    const options: SpawnSyncOptions = {
      encoding: 'utf8',
      stdio: 'inherit',
      timeout: this.config.timeout,
      cwd: projectInfo.projectPath,
    };

    // Suppressed as no user input it used to manage the path and child_process
    // nosemgrep
    const commandResults = spawnSync(command, commandArgs, options);

    if (commandResults.status !== 0) {
      logger.error('Failed to run NPM CI.');
      logger.debug('CMD:', command, commandArgs);
      throw new Error('Failed to run NPM CI.');
    }
  }

  /**
   * Generates the summary of the various license types used in the NPM project.
   */
  private generateNPMSummary(projectInfo: ProjectInfo) {
    const commandArgs = ['-y', NPM_LICENSE_CHECKER_TOOL, '--summary', '--csv', '--start', projectInfo.projectPath];

    if (this.config.npm.excluded && this.config.npm.excluded.length != 0) {
      const excludedPackages = this.config.npm.excluded.join(';');
      commandArgs.push('--excludePackages', excludedPackages);
    }

    const options: SpawnSyncOptions = {
      encoding: 'utf8',
      stdio: ['ignore', openSync(projectInfo.summaryFile, 'a'), 'inherit'],
      timeout: this.config.timeout,
    };
    // Suppressed as no user input it used to manage the path and child_process
    // nosemgrep
    const commandResults = spawnSync('npx', commandArgs, options);

    if (commandResults.status !== 0) {
      logger.error(`Module ${projectInfo.name} failed the license check.`);
      throw new Error(`Module ${projectInfo.name} failed the license check.`);
    }

    const csvValues = parse(readFileSync(projectInfo.summaryFile, { encoding: 'utf8' }), {
      delimiter: ',',
      columns: true,
    });

    const licenseSummary: Record<string, number> = {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    csvValues.forEach((rows: { [x: string]: any }) => {
      const license = rows.license;
      if (license) {
        const count = licenseSummary[license] || 0;
        licenseSummary[license] = count + 1;
      }
    });

    let output = '#########################\n';
    output += `# NPM module: ${projectInfo.name}\n`;
    output += '#########################\n';
    output += stringify(
      Object.entries(licenseSummary)
        .sort()
        .map(([license, count]) => ({ License: license, Count: count })),
      { header: true, quoted: true },
    );
    writeFileSync(projectInfo.summaryFile, output);
  }

  /**
   * Generates the temporary NOTICE file based on the dependencies used in the NPM project
   */
  private generateNPMNotice(projectInfo: ProjectInfo) {
    const commandArgs = ['-y', NPM_LICENSE_CHECKER_TOOL, '--plainVertical'];

    if (this.config.npm.excluded && this.config.npm.excluded.length != 0) {
      const excludedPackages = this.config.npm.excluded.join(';');
      commandArgs.push('--excludePackages', excludedPackages);
    }

    const options: SpawnSyncOptions = {
      cwd: projectInfo.projectPath,
      encoding: 'utf8',
      stdio: ['ignore', openSync(projectInfo.noticeFile, 'w+'), 'inherit'],
      timeout: this.config.timeout,
    };
    // Suppressed as no user input it used to manage the path and child_process
    // nosemgrep
    const commandResults = spawnSync('npx', commandArgs, options);

    if (commandResults.status !== 0) {
      logger.error(`Module ${projectInfo.name} failed the license check.`);
      throw new Error(`Module ${projectInfo.name} failed the license check.`);
    }
  }

  /**
   * Verifies there are no banned Licenses across the dependencies used.
   */
  private checkedNPMBannedLicenses(projectInfo: ProjectInfo) {
    const commandArgs = ['-y', NPM_LICENSE_CHECKER_TOOL, '--failOn', this.config.failOnLicenses.join(';')];

    if (this.config.npm.excluded && this.config.npm.excluded.length != 0) {
      const excludedPackages = this.config.npm.excluded.join(';');
      commandArgs.push('--excludePackages', excludedPackages);
    }

    const options: SpawnSyncOptions = {
      cwd: projectInfo.projectPath,
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'inherit'],
      timeout: this.config.timeout,
    };
    // Suppressed as no user input it used to manage the path and child_process
    // nosemgrep
    const commandResults = spawnSync('npx', commandArgs, options);

    if (commandResults.status !== 0) {
      logger.error(`Project ${projectInfo.name} failed the license check. It contains dependency with banned license.`);
      throw new Error(
        `Project ${projectInfo.name} failed the license check. It contains dependency with banned license.`,
      );
    }
  }

  private isProjectLockExists(projectInfo: ProjectInfo): boolean {
    return (
      // Suppressed as no user input it used to manage the path and child_process
      // nosemgrep
      existsSync(path.join(projectInfo.projectPath, 'package-lock.json')) ||
      // Suppressed as no user input it used to manage the path and child_process
      // nosemgrep
      existsSync(path.join(projectInfo.projectPath, 'yarn.lock')) ||
      // Suppressed as no user input it used to manage the path and child_process
      // nosemgrep
      existsSync(path.join(projectInfo.projectPath, 'npm-shrinkwrap.json'))
    );
  }
}
