// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Interface representing the scanning context.
 */
export interface ScanningContext {
  readonly projectRoot: string;
  readonly workingDir: string;
  // readonly pip: string;
  // readonly python: string;
}

/**
 * Interface representing the license configuration.
 */
export interface LicenseConfig {
  readonly failOnLicenses: string[];
  readonly npm: {
    cleanInstall: boolean;
    projectFiles?: string[];
    excluded: string[];
    excludedSubProjects: string[];
  };
  readonly python: {
    allowedTypes: string[];
    projectFiles?: string[];
    excluded: string[];
    excludedSubProjects: string[];
  };
  timeout: number;
  verificationFile: string;
  excludeFolders: string[];
}

export interface LicenseCollectorConstructor {
  new (config: LicenseConfig, context: ScanningContext, projectFiles: string[]): LicenseCollector;
}

export interface LicenseCollector {
  collectLicenses: () => void;
}
