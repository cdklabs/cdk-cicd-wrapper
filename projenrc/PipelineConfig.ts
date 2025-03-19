import * as pj from 'projen';
import { yarn } from 'cdklabs-projen-project-types';
import { Eslint } from 'projen/lib/javascript';
import { JSIIComponent } from './jsiicomponent';
import { RootConfig } from './RootConfig';

export class PipelineConfig extends yarn.TypeScriptWorkspace {
  constructor(root: RootConfig) {
    super({
      parent: root,
      name: '@cdklabs/cdk-cicd-wrapper',
      authorName: root.authorName,
      description:
        'This repository contains the infrastructure as code to wrap your AWS CDK project with CI/CD around it.',
      keywords: ['cli', 'aws-cdk', 'awscdk', 'aws', 'ci-cd-boot', 'ci-cd', 'vanilla-pipeline'],
      releasableCommits: pj.ReleasableCommits.featuresAndFixes('.'),
      devDeps: [
        'eslint@^8',
        `@aws-cdk/integ-runner@^${root.cdkVersion}-alpha.0`,
        `@aws-cdk/integ-tests-alpha@^${root.cdkVersion}-alpha.0`,
        '@typescript-eslint/eslint-plugin@^7',
        '@typescript-eslint/parser@^7',
        '@typescript-eslint/typescript-estree@^7',
      ],
      peerDeps: [
        `cdk-nag@^${root.cdkNagVersion}`,
        `aws-cdk-lib@^${root.cdkVersion}`,
        `constructs@^${root.constructsVersion}`,
        'cdk-pipelines-github',
      ],
      bundledDeps: [
        '@cloudcomponents/cdk-pull-request-approval-rule',
        '@cloudcomponents/cdk-pull-request-check',
        'yaml',
      ],
      deps: [
        `cdk-pipelines-github`,
        '@cloudcomponents/cdk-pull-request-approval-rule',
        '@cloudcomponents/cdk-pull-request-check',
        'yaml',
      ],
      jest: true,
      disableTsconfig: true,
    });

    Eslint.of(this)?.addRules({
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: ['**/test/**', '**/build-tools/**', '**/projen/**'],
          optionalDependencies: false,
          peerDependencies: true,
        },
      ],
    });

    const packageBasename = 'cdk-cicd-wrapper';
    new JSIIComponent(this, {
      publishToPypi: {
        distName: `cdklabs.${packageBasename}`,
        module: `cdklabs.${changeDelimiter(packageBasename, '_')}`,
      },
      publishToMaven: {
        javaPackage: `io.github.cdklabs.${changeDelimiter(packageBasename, '.')}`,
        mavenGroupId: `io.github.cdklabs`,
        mavenArtifactId: packageBasename,
        mavenEndpoint: 'https://s01.oss.sonatype.org',
      },
      publishToNuget: {
        dotNetNamespace: `${upperCaseName('cdklabs')}.${upperCaseName(packageBasename)}`,
        packageId: `${upperCaseName('cdklabs')}.${upperCaseName(packageBasename)}`,
      },
    });

    root.addGitIgnore(this.workspaceDirectory + '/tsconfig.json');

    this.addDevDeps('copyfiles');
    this.addDevDeps(...root.eslintDeps);
    this.tasks
      .tryFind('post-compile')!
      .exec('copyfiles -u 1 -E src/**/*.py src/**/Pipfile src/**/Pipfile.lock src/projen/Taskfile.yaml lib');

    this.addTask('integ', {
      description: 'Run integration snapshot tests',
      exec: 'yarn integ-runner --language typescript',
      receiveArgs: true,
    });

    this.addTask('integ:update', {
      description: 'Run and update integration snapshot tests',
      exec: 'yarn integ-runner --language typescript --update-on-failed',
      receiveArgs: true,
    });

    root.addTask('integ', {
      exec: 'yarn workspace @cdklabs/cdk-cicd-wrapper run integ',
      receiveArgs: true,
    });

    const postCompile = this.tasks.tryFind('post-compile')!;
    // postCompile.exec("export DEP='@cloudcomponents';cp -rf ./node_modules/$DEP ./node_modules/ 2>/dev/null;");
    postCompile.exec("export DEP='yaml';cp -rf ../../../node_modules/$DEP ./node_modules/ 2>/dev/null;");

    // Disable packaging for other than TS
    this.tasks.tryFind('package:dotnet')?.addCondition('[ -n "$CI" ] || [ -n "$DOTNET_ENABLED" ]');
    this.tasks.tryFind('package:python')?.addCondition('[ -n "$CI" ] || [ -n "$PYTHON_ENABLED" ]');
    this.tasks.tryFind('package:go')?.addCondition('[ -n "$CI" ] || [ -n "$GO_ENABLED" ]');
    this.tasks.tryFind('package:java')?.addCondition('[ -n "$CI" ] || [ -n "$JAVA_ENABLED" ]');
  }
}

function upperCaseName(str: string) {
  let words = str.split('-');
  words = words.map((w) => w[0].toUpperCase() + w.substring(1));
  return words.join('');
}

function changeDelimiter(str: string, delim: string) {
  return str.split('-').join(delim);
}
