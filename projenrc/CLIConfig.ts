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
      npmTrustedPublishing: true,
      releaseEnvironment: 'release',
      bin: {
        'cdk-cicd': './bin/cdk-cicd',
      },
      deps: [
        // Pinned to the v17 line: the CLI's yargs usage (namespace `ya.command(...)`) is not
        // compatible with the v18 major, which floated in on a regen and broke the whole CLI.
        // See finding code-review-cli-yargs18-incompatible.
        'yargs@^17.7.3',
        '@types/yargs@^17.0.33',
        'globby@11.1.0', // globby version 12+ only support ESM
        'fs-extra',
        '@types/fs-extra',
        'csv',
        '@aws-sdk/client-s3',
        '@aws-sdk/credential-providers',
        'tslog',
        // v3 `cdk-cicd exec` resolves the register preload and reuses the config loader from the
        // constructs package. Kept a workspace dependency, NOT folded into the jsii package (D5).
        '@cdklabs/cdk-cicd-wrapper',
      ],
      // Enabled for v3: `cdk-cicd exec`'s pure logic (stage->env resolution, the non-clobbering
      // CDK_CONTEXT_JSON merge) is unit-tested here; the spawn itself is proven by the harness.
      jest: true,
    });

    this.addPackageIgnore('*.ts');
    this.addDevDeps(...root.eslintDeps);

    const cliExec = this.addTask('cli-exec');
    cliExec.spawn(this.tasks.tryFind('compile')!);
    cliExec.exec('./packages/@cdklabs/cdk-cicd-wrapper-cli/bin/cdk-cicd', { receiveArgs: true, cwd: '../../..' });
  }
}
