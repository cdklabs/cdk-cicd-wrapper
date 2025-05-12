// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
// eslint-disable-next-line import/no-extraneous-dependencies
import { Component, Project } from 'projen';

/**
 * Options for configuring security scanning tools.
 */
export interface SecurityScanOptions {
  /**
   * Whether to enable Bandit security scanning.
   * @default - false
   */
  bandit?: boolean;

  /**
   * The version of Bandit to use for security scanning.
   */
  banditVersion?: string;

  /**
   * Whether to enable Semgrep security scanning.
   * @default - false
   */
  semgrep?: boolean;

  /**
   * The version of Semgrep to use for security scanning.
   */
  semgrepVersion?: string;

  /**
   * Whether to enable ShellCheck security scanning.
   * @default - false
   */
  shellcheck?: boolean;

  /**
   * The version of ShellCheck to use for security scanning.
   */
  shellcheckVersion?: string;
}

/**
 * Properties for configuring the CI commands.
 */
export interface CICommandsProps {
  /**
   * Whether to enable security scanning.
   * @default - false
   */
  securityScan?: boolean;

  /**
   * Options for configuring security scanning tools.
   */
  securityScanOptions?: SecurityScanOptions;
}

/**
 * Defines CI commands for the project.
 */
export class CICommands extends Component {
  constructor(project: Project, props: CICommandsProps) {
    super(project);

    project.addTask('validate').exec('cdk-cicd validate', { receiveArgs: true });

    const license = project.addTask('license', {
      description: 'Notice file checking and generation',
    });
    license.exec('cdk-cicd license', { receiveArgs: true });

    const checkDependencies = project.addTask('check-dependencies', {
      description: 'Notice file checking and generation',
    });
    checkDependencies.exec('cdk-cicd check-dependencies', {
      receiveArgs: true,
    });

    const lint = project.addTask('lint');
    lint.spawn(project.tasks.tryFind('eslint')!);

    const audit = project.addTask('audit');
    audit.spawn(checkDependencies);
    audit.spawn(license);

    if (props.securityScan) {
      const securityScan = project.addTask('security-scan', {
        description: 'Notice file checking and generation',
      });

      const securityScanArgs: string[] = [];
      this.addSecurityScanning('bandit', securityScanArgs, props.securityScanOptions);
      this.addSecurityScanning('semgrep', securityScanArgs, props.securityScanOptions);
      this.addSecurityScanning('shellcheck', securityScanArgs, props.securityScanOptions);
      securityScan.exec(`cdk-cicd security-scan`, {
        receiveArgs: true,
        args: [...securityScanArgs, '-ci'],
        condition: '[ -n "$CI" ]',
      });
      securityScan.exec('cdk-cicd security-scan --bandit --semgrep --shellcheck', {
        receiveArgs: true,
        args: securityScanArgs,
        condition: '[ ! -n "$CI" ]',
      });

      audit.spawn(securityScan);
    }
  }

  /**
   * Adds security scanning configuration for the specified tool.
   *
   * @param tool - The security scanning tool to configure.
   * @param securityArgs - An array to which the security scanning arguments will be appended.
   * @param options - The security scanning options.
   */
  private addSecurityScanning(tool: keyof SecurityScanOptions, securityArgs: string[], options?: SecurityScanOptions) {
    if (options && options[tool]) {
      console.log(`Skipping ${tool} security scanning`);
    }

    const toolVersion = `${tool}Version` as keyof SecurityScanOptions;
    securityArgs.push(`--${tool}`);
    if (options && options[toolVersion]) {
      securityArgs.push(`--${tool}-version ${options[toolVersion]}`);
    }
  }
}
