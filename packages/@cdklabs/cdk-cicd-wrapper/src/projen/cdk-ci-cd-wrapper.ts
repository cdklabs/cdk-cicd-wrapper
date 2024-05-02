// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// eslint-disables-next-line
import * as projen from 'projen';

export type REPOSITORY_TYPE = 'GITHUB' | 'CODECOMMIT';

export interface CdkCICDWrapperOptions {
  /**
   * CDK Qualifier use to bootstrap your project
   */
  cdkQualifier: string;

  /**
   * default: is project Name
   */
  repositoryName?: string;

  /**
   * default: CodeCommit
   */
  repositoryType?: REPOSITORY_TYPE;
}

export class CdkCICDWrapper extends projen.Component {
  readonly cdkQualifier: string;

  readonly repositoryName: string;

  readonly repositoryType: REPOSITORY_TYPE;

  constructor(project: projen.awscdk.AwsCdkTypeScriptApp, options: CdkCICDWrapperOptions) {
    super(project);

    this.cdkQualifier = options.cdkQualifier;
    this.repositoryName = options.repositoryName ?? project.name;
    this.repositoryType = options.repositoryType ?? 'CODECOMMIT';

    project.addDeps('@cdklabs/cdk-cicd-wrapper', '@cdklabs/cdk-cicd-wrapper-cli');

    project.cdkConfig.json.patch(projen.JsonPatch.add('/toolkitStackName', `CdkToolkit-${this.cdkQualifier}`));
    project.cdkConfig.json.patch(
      projen.JsonPatch.add('/context', {
        '@aws-cdk/core:bootstrapQualifier': this.cdkQualifier,
      }),
    );

    project.package.addField('config', {
      cdkQualifier: this.cdkQualifier,
      repositoryName: this.repositoryName,
      repositoryType: this.repositoryType,
      cicdVpcType: 'NO_VPC',
    });

    project
      .addTask('update-cdk-cicd-wrapper')
      .exec('npm update @cdklabs/cdk-cicd-wrapper @cdklabs/cdk-cicd-wrapper-cli --force');

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

    const securityScan = project.addTask('security-scan', {
      description: 'Notice file checking and generation',
    });
    securityScan.exec('cdk-cicd security-scan --bandit --semgrep --shellcheck --ci', {
      receiveArgs: true,
      condition: '[ -n "$CI" ]',
    });
    securityScan.exec('cdk-cicd security-scan --bandit --semgrep --shellcheck', {
      receiveArgs: true,
      condition: '[ ! -n "$CI" ]',
    });

    const audit = project.addTask('audit');
    audit.spawn(checkDependencies);
    audit.spawn(securityScan);
    audit.spawn(license);

    const lint = project.addTask('lint');
    lint.spawn(project.tasks.tryFind('eslint')!);

    project
      .addTask('sandbox')
      .spawn(project.tasks.tryFind('deploy')!, { args: ['-c', 'sandbox=true'], receiveArgs: true });

    project.addTask('cdkls').exec('cdk ls');
  }
}
