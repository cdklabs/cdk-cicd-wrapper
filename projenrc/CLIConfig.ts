import { yarn } from 'cdklabs-projen-project-types';
import { RootConfig } from './RootConfig';

export class CLIConfig extends yarn.TypeScriptWorkspace {
  constructor(root: RootConfig) {
    super({
      parent: root,
      name: '@cdklabs/cdk-cicd-wrapper-cli',
      description:
        'This repository contains the infrastructure as code to wrap your AWS CDK project with CI/CD around it.',
      keywords: ['cli', 'aws-cdk', 'awscdk', 'aws', 'ci-cd-boot', 'ci-cd', 'vanilla-pipeline'],
      projenrcTs: true,
      bin: {
        'cdk-cicd': './bin/cdk-cicd',
      },
      deps: [
        'yargs',
        '@types/yargs',
        'globby@11.1.0', // globby version 12+ only support ESM
        'fs-extra',
        '@types/fs-extra',
        'csv',
        '@aws-sdk/client-s3',
        '@aws-sdk/credential-providers',
        'tslog',
      ],
      jest: false,
    });

    this.addPackageIgnore('*.ts');
    this.addDevDeps(...root.eslintDeps);

    const cliExec = this.addTask('cli-exec');
    cliExec.spawn(this.tasks.tryFind('compile')!);
    cliExec.exec('./packages/@cdklabs/cdk-cicd-wrapper-cli/bin/cdk-cicd', { receiveArgs: true, cwd: '../../..' });
  }
}
