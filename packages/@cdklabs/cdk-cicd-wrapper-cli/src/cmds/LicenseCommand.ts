// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// ESLint must be disabled while the https://github.com/adaltas/node-csv/issues/323 has not been solved
/* eslint-disable */
import { existsSync, mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import * as globby from 'globby';
import * as os from 'os';
import * as path from 'path';
import * as yargs from 'yargs';
import { LicenseCollectorConstructor, LicenseConfig, ScanningContext } from './license/Types';
import { Projects } from './license/Projects';
import { NodeLicenseCollector } from './license/NodeLicenseCollector';
import { PythonLicenseCollector } from './license/PythonLicenseCollector';
import { logger } from '../utils/Logging';

// 5 min timeout
const GLOBAL_TIMEOUT = { timeout: 5 * 60 * 1000 };
const DEFAULT_EXCLUDED_FOLDERS = ['**/node_modules/**', '**/cdk.out/**', '.git/**', '**/dist/**', 'docs/**', '**/bin/**', '**/tmp/**'];

const VERIFICATION_FILE = './package-verification.json';

const DEFAULT_LICENSE_FILE = {
  failOnLicenses: [
    'AGPL',
    'GNU AGPL',
    'APPLE PUBLIC SOURCE LICENSE',
    'APSL-2.0',
    'CDLA-Sharing-1.0',
    'CPAL-1.0',
    'MIT-enna',
    'EUPL-1.1',
    'EUPL-1.2',
    'LGPL-3.0-only',
    'LGPL-3.0-or-later',
    'GPL-3.0-only',
    'GPL-3.0-or-later',
    'HPL',
    'NASA-1.3',
    'ODbL-1.0',
    'OSL-3.0',
    'Parity-7.0.0',
    'RPSL-1.0',
    'SSPL-1.0',
    'BUSL-1.1',
    'Commons Clause',
    'CRAPL',
    'CC-BY-NC-1.0',
    'CC-BY-NC-2.0',
    'CC-BY-NC-2.5',
    'CC-BY-NC-3.0',
    'CC-BY-NC-4.0',
    'Elastic-2.0',
    'Hugging Face Optimized Inference',
    'HFOILv1.0',
    'Prosperity Public',
    'Redis Source Available',
    'UC Berkeley',
  ],
  npm: {
    cleanInstall: false,
    excluded: [],
    excludedSubProjects: [],
  },
  python: {
    allowedTypes: ["Pipenv"],
    excluded: [],
    excludedSubProjects: [],
  },
};


const COLLECTORS : Record<string, LicenseCollectorConstructor> = {
  'npm': NodeLicenseCollector,
  'python': PythonLicenseCollector,
}

/**
 * Class to check licenses of NPM and Python projects.
 */
class LicenseChecker {
  private context?: ScanningContext;

  private static loadConfig(configFile: string): LicenseConfig {
    if (!existsSync(configFile)) {
      logger.info(`License checker configuration file ${configFile} does not exist. Creating one ...`);
      writeFileSync(configFile, JSON.stringify(DEFAULT_LICENSE_FILE));
    }
    return JSON.parse(readFileSync(configFile, { encoding: 'utf8' }));
  }

  /**
   * Constructor to initialize the LicenseChecker.
   *
   * @param configFile - Path to the license checker configuration file. Default is './licensecheck.json'.
   * @param force - Flag to force license file regeneration. Default is false.
   * @param fix - Flag to generate a new Notice file. Default is true.
   * @param debug - Flag to allow debug information. Default is false.
   */
  constructor(
    readonly configFile: string = './licensecheck.json',
    readonly force: boolean = false,
    readonly fix: boolean = true,
    readonly debug: boolean = false,
    readonly config: LicenseConfig = LicenseChecker.loadConfig(configFile)
  ) {
    this.initializeConfig();
  }

  private initializeConfig() {
    this.config.excludeFolders = [
      ...DEFAULT_EXCLUDED_FOLDERS,
      ...(this.config.excludeFolders || []),
    ];

    this.config.python.allowedTypes = [
      ...(this.config.python.allowedTypes || ["Pipenv"])
    ];

    this.config.npm.cleanInstall = this.config.npm.cleanInstall || false;
    this.config.timeout = this.config.timeout || GLOBAL_TIMEOUT.timeout;
    this.config.verificationFile = this.config.verificationFile || VERIFICATION_FILE;
  }

  /**
   * Scans the project for NPM and Python packages and checks their licenses.
   *
   * @returns 0 if successful, 1 if failed.
   */
  scan() {
    var result = 0;
    try {

      this.initScanningEnvironment();

      var projects = this.collect();

      const hasChanged = projects.hasChanged();
  
      if (hasChanged) {
        logger.info('Licenses are out of sync.');
      }

      if (this.force || (hasChanged && this.fix)) {
        logger.info('Licenses are regenerating ...');
        this.runLicenseCheckers(projects);

        this.mergeLicenseFiles();

        projects.updateVerificationJson();
        logger.info('Licenses have been regenerated.');
      } else if (hasChanged) {
        logger.info('Licenses check failed.');
        return 1;
      } else {
        logger.info('Licenses are up to date.');
      }
      return 0;
    } catch (error) {
      logger.error(error);
      logger.error('License scan failed');
      result = 1;
    } finally {
      this.demolishScanningEnvironment();
    }
    
    return result;
  }

  private initScanningEnvironment() {
    let workingDir;
    if (this.debug) {
      workingDir = path.join(process.cwd(), 'license-debug');

      if (existsSync(workingDir)) {
        rmSync(workingDir, { recursive: true });
      }

      mkdirSync(workingDir);
    } else {
      workingDir = mkdtempSync(path.join(os.tmpdir(), 'license'));
    }

    this.context = {
      projectRoot: process.cwd(),
      workingDir: workingDir,
    };
  }

  private demolishScanningEnvironment() {
    if (this.context?.workingDir && !this.debug) {
      rmSync(this.context.workingDir, { recursive: true });
    }
  }

  private collect() {
    var projects = new Projects(this.config, this.context!);

    projects.collectProjects('npm', '**/package.json');
    projects.collectProjects('python', this.pythonFileGlobs());

    return projects;
  }

  private pythonFileGlobs() {
    return this.config.python.allowedTypes.map((pkgType) => { switch(pkgType) {
      case "Pipenv": return '**/Pipfile';
      case "requirements.txt": return '**/requirements.txt';
      default: throw new Error(`Unsupported type ${pkgType}.`)
    }});
  }

  /**
   * Orchestrates the license checking of the projects.
   *
   * @param context - Scanning environment context.
   * @param npmProjectsToCheck - List of NPM projects to verify.
   * @param pythonProjectsToCheck - List of Python projects to verify.
   */
  private runLicenseCheckers(project: Projects) {
    logger.debug('Scanning projects ...');

    Object.entries(COLLECTORS).map(([type, collectorCtor]) =>
      new collectorCtor(this.config, this.context!, project.getProjects(type))
    ).forEach((collector) => collector.collectLicenses());
  }

  /**
   * Merging temporary files together to provide the final files
   *
   * @param context scanning environment context
   */
  private mergeLicenseFiles() {
    const { workingDir, projectRoot } = this.context!;
    // Suppressed as no user input it used to manage the path and child_process
    // nosemgrep
    const licenseFiles = globby.sync(path.join(workingDir, 'NOTICE.*'));

    let output = '';

    licenseFiles.sort().forEach((file) => {
      const fileContent = readFileSync(file, { encoding: 'utf8' });
      output += fileContent;
    });

    // Suppressed as no user input it used to manage the path and child_process
    // nosemgrep
    writeFileSync(path.join(projectRoot, 'NOTICE'), output);

    // Suppressed as no user input it used to manage the path and child_process
    // nosemgrep
    const licenseSummaryFiles = globby.sync(path.join(workingDir, 'OSS_License_Summary.*'));

    let outputSummary = '';

    licenseSummaryFiles.sort().forEach((file) => {
      const fileContent = readFileSync(file, { encoding: 'utf8' });
      outputSummary += fileContent;
    });

    // Suppressed as no user input it used to manage the path and child_process
    // nosemgrep
    writeFileSync(path.join(projectRoot, 'OSS_License_Summary.csv'), outputSummary);
  }
}

class Command implements yargs.CommandModule {
  command = 'license';

  describe = 'check the projects NOTICE file';

  builder(args: yargs.Argv) {
    args.option('fix', {
      type: 'boolean',
      default: false,
      description: 'Generates a new Notice file',
    });

    args.option('debug', {
      type: 'boolean',
      default: false,
      description: 'Allows to get debug information.',
    });

    args.option('force', {
      type: 'boolean',
      default: false,
      description: 'Force the license files regeneration.',
    });

    args.option('config', {
      type: 'string',
      default: 'licensecheck.json',
      description: 'Config file location.',
    });

    return args;
  }
  handler(args: yargs.Arguments) {

    logger.settings.minLevel = args.debug ? 2 : 3;
    const result = new LicenseChecker(
      args.config as string,
      args.force as boolean,
      args.fix as boolean,
      args.debug as boolean,
    ).scan();

    if (result) {
      yargs.exit(1, new Error('License validation failed.'));
    }
  }
}

export default new Command();
