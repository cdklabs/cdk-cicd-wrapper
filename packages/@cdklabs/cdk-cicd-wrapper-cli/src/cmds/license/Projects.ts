// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// ESLint must be disabled while the https://github.com/adaltas/node-csv/issues/323 has not been solved
/* eslint-disable */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import * as path from 'path';
import * as globby from 'globby';
import { LicenseConfig, ScanningContext } from './Types';
import { CliHelpers } from '../../utils/CliHelpers';
import { logger } from '../../utils/Logging';

const LICENSE_FILES_SUMMARY_HASH = 'projectList';

export class Projects {

  private scannedProjects: Record<string, string[]> = {};
  private verificationJson: Record<string, any> = {};
  private licenseSection: Record<string, string> = {};
  private newLicensesSection: Record<string, string> = {};
  private verificationFilePath: string;

  constructor(readonly config: LicenseConfig, readonly context: ScanningContext) {
    this.verificationFilePath = path.resolve(this.context.workingDir, this.config.verificationFile);
  }

  public getProjects(type: string) {
    return this.scannedProjects[type] || [];
  }

  public collectProjects(type: string, pattern: string | string[]) {
    
    var typeConfig = this.config[type.toLocaleLowerCase() as keyof LicenseConfig] ?
      (this.config[type.toLocaleLowerCase() as keyof LicenseConfig] as { projectFiles?: string[]; excludedSubProjects: string[]}): { excludedSubProjects: [] };

    if (typeConfig.projectFiles) {
      this.scannedProjects[type] = typeConfig.projectFiles;
    } else {
      var excludedSubProjects = typeConfig.excludedSubProjects || [];

      this.scannedProjects[type] = globby.sync(pattern, {
        cwd: this.context.projectRoot,
        ignore: this.config.excludeFolders,
        absolute: true,
      }).filter((jsonPath) => !excludedSubProjects.find((exclude) => jsonPath.endsWith(exclude)));
    }
  }

  /**
   * Checks if there any project file (package.json, Pipfile, or requirements.txt) has been modified since the last scan.
   *
   * @returns True if any project file has been modified, false otherwise.
   */
  public hasChanged() {
    if (!existsSync(this.verificationFilePath)) {
      this.verificationJson = {};
    } else {
      this.verificationJson = JSON.parse(readFileSync(this.verificationFilePath, { encoding: 'utf8' }));
    }

    this.licenseSection = this.verificationJson.license || {};

    let result = false;

    let projectFilesList = '';
    Object.values(this.scannedProjects).flat().forEach((projectFile) => {
      const projectRelativePath = path.relative(this.context.projectRoot, projectFile);
      const verifiedHashCode = this.licenseSection[projectRelativePath];

      const currentHashCode = CliHelpers.generateChecksum(projectFile);

      this.newLicensesSection[projectRelativePath] = currentHashCode;
      if (verifiedHashCode !== currentHashCode) {
        logger.info(`File ${projectFile} has changed since last scan.`);
        result = true;
      }

      projectFilesList += projectRelativePath;
    });

    const currentHashCodeOfProjectFiles = CliHelpers.generateChecksumForText(projectFilesList);

    const verifiedHashCode = this.licenseSection[LICENSE_FILES_SUMMARY_HASH];

    this.newLicensesSection[LICENSE_FILES_SUMMARY_HASH] = currentHashCodeOfProjectFiles;
    if (verifiedHashCode !== currentHashCodeOfProjectFiles) {
      logger.info('Source of licenses has changed since last scan.');
      result = true;
    }

    return result;
  }

  /**
   * Updates the package-verification.json file with the latest license section.
   */
  public updateVerificationJson() {
    this.verificationJson.license = this.newLicensesSection;
    writeFileSync(this.verificationFilePath, JSON.stringify(this.verificationJson, null, 2), { encoding: 'utf-8' });
  }
}