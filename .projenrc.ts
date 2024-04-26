import * as pj from 'projen';
import { YarnMonorepo } from './projenrc/monorepo';
import { TypeScriptWorkspace } from './projenrc/workspace';

const cdkVersion = '2.132.0';
const repositoryUrl = 'https://github.com/cdklabs/cdk-cicd-wrapper.git';

const eslintDeps = [
  'eslint@^8',
  '@typescript-eslint/eslint-plugin@^7',
  '@typescript-eslint/parser@^7',
  '@typescript-eslint/typescript-estree@^7',
];

const workflowRunsOn = ['ubuntu-latest'];

const root = new YarnMonorepo({
  name: 'cdk-cicd-wrapper',
  description: 'This repository contains the infrastructure as code to bootstrap your next CI/CD project.',
  repository: repositoryUrl,
  homepage: repositoryUrl,
  keywords: ['cli', 'aws-cdk', 'awscdk', 'aws', 'ci-cd-boot'],

  defaultReleaseBranch: 'main',
  devDeps: [
    'cdklabs-projen-project-types',
    'node-fetch@^2',
    'eslint@^8',
    '@typescript-eslint/eslint-plugin@^7',
    '@typescript-eslint/parser@^7',
    '@typescript-eslint/typescript-estree@^7',
  ],

  buildWorkflow: true,
  clobber: true,
  autoMerge: true,

  vscode: false,

  prettier: true,
  prettierOptions: {
    settings: {
      singleQuote: true,
      semi: true,
      trailingComma: pj.javascript.TrailingComma.ALL,
      printWidth: 120,
    },
  },

  workflowRunsOn,

  pullRequestTemplate: true,

  autoApproveOptions: {
    allowedUsernames: ['aws-cdk-automation', 'dependabot[bot]'],
  },

  release: true,
  releaseOptions: {
    publishToNpm: true,
    releaseTrigger: pj.release.ReleaseTrigger.scheduled({
      schedule: '11 8 * * 5',
    }),
  },

  githubOptions: {
    pullRequestLintOptions: {
      semanticTitleOptions: {
        types: ['feat', 'fix', 'chore', 'refactor'],
      },
    },
  },

  prerelease: 'alpha',
  stability: 'experimental',
  gitignore: [
    'docs/build',
    'docs/dist',
    '.DS_Store',
    'junit-reports',
    '.npmrc',
    'development',
    '.devbox',
    '.task',
    'node_modules',
    '.env',
  ],
});

//============================================
//
//  CI/CD Wrapper package
//
//============================================

const pipeline = new TypeScriptWorkspace({
  parent: root,
  name: '@cdklabs/cdk-cicd-wrapper',
  description: 'This repository contains the infrastructure as code to bootstrap your next CI/CD project.',
  keywords: ['cdk', 'aws-cdk', 'awscdk', 'aws', 'ci-cd-boot'],
  releasableCommits: pj.ReleasableCommits.featuresAndFixes('.'),

  devDeps: [
    `@aws-cdk/integ-runner@${cdkVersion}-alpha.0`,
    `@aws-cdk/integ-tests-alpha@${cdkVersion}-alpha.0`,
    'eslint@^8',
    '@typescript-eslint/eslint-plugin@^7',
    '@typescript-eslint/parser@^7',
    '@typescript-eslint/typescript-estree@^7',
  ],

  peerDeps: ['cdk-nag', 'aws-cdk-lib', 'constructs'],
  bundledDeps: ['@cloudcomponents/cdk-pull-request-approval-rule', '@cloudcomponents/cdk-pull-request-check'],
  jest: true,
});

// Copy non TS sources to the package
pipeline.addDevDeps('copyfiles');
pipeline.addDevDeps(...eslintDeps);
pipeline.tasks.tryFind('post-compile')!.exec('copyfiles -u 1 -E src/**/*.py src/**/Pipfile src/**/Pipfile.lock lib');

// Copy bundle dependencies to the package
const postCompile = pipeline.tasks.tryFind('post-compile')!;
postCompile.exec("export DEP='@cloudcomponents';cp -rf ../../../node_modules/$DEP ./node_modules/ 2>/dev/null;");

//============================================
//
//  CLI package
//
//============================================
const cli = new TypeScriptWorkspace({
  parent: root,
  name: '@cdklabs/cdk-cicd-wrapper-cli',
  description: 'This repository contains the infrastructure as code to bootstrap your next CI/CD project.',

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
  ],
  jest: false,
});

// Don't need to include the TypeScript source files in the tarball; the transpiled JS files are sufficient.
cli.addPackageIgnore('*.ts');

cli.addDevDeps(...eslintDeps);

const cliExec = cli.addTask('cli-exec');
cliExec.spawn(cli.tasks.tryFind('compile')!);
cliExec.exec('./packages/@cdklabs/cdk-cicd-wrapper-cli/bin/cdk-cicd', { receiveArgs: true, cwd: '../../..' });

//============================================
//
//  Repository level configurations
//
//============================================
const lint = root.addTask('lint', {
  description: 'Lint all code',
});
lint.spawn(root.tasks.tryFind('fmt')!);
lint.exec('yarn workspaces run eslint');

const validate = root.addTask('validate', {
  description: 'Validate the lock files',
});
validate.exec('yarn workspace @cdklabs/cdk-cicd-wrapper-cli run cli-exec validate', { receiveArgs: true });

const validateFix = root.addTask('validate:fix', {
  description: 'Fixes the lock files',
});
validateFix.exec('yarn workspace @cdklabs/cdk-cicd-wrapper-cli run cli-exec validate --fix', { receiveArgs: true });

const license = root.addTask('license', {
  description: 'Notice file checking and generation',
});
license.exec('yarn workspace @cdklabs/cdk-cicd-wrapper-cli run cli-exec license', { receiveArgs: true });

// upgrade
const upgrade = root.tasks.tryFind('upgrade')!;
upgrade.spawn(license, { args: ['--fix'] });
upgrade.spawn(validate, { args: ['--fix'] });

const checkDependencies = root.addTask('check-dependencies', {
  description: 'Notice file checking and generation',
});
checkDependencies.exec('yarn workspace @cdklabs/cdk-cicd-wrapper-cli run cli-exec check-dependencies', {
  receiveArgs: true,
});

const securityScan = root.addTask('security-scan', {
  description: 'Notice file checking and generation',
});

securityScan.exec(
  'yarn workspace @cdklabs/cdk-cicd-wrapper-cli run cli-exec security-scan  --bandit --semgrep --shellcheck --ci',
  { receiveArgs: true, condition: '[ -n "$CI" ]' },
);
securityScan.exec(
  'yarn workspace @cdklabs/cdk-cicd-wrapper-cli run cli-exec security-scan  --bandit --semgrep --shellcheck',
  { receiveArgs: true, condition: '[ ! -n "$CI" ]' },
);

const audit = root.addTask('audit');

audit.spawn(checkDependencies);
audit.spawn(securityScan);
audit.spawn(license);

// commitlint
root.package.addDevDeps('@commitlint/cli', '@commitlint/config-conventional');
root.package.file.patch(
  pj.JsonPatch.add('/commitlint', {
    extends: ['@commitlint/config-conventional'],
  }),
);

const commitlint = root.addTask('commitlint');
commitlint.exec('commitlint --edit', { receiveArgs: true });

// husky
root.package.addDevDeps('husky');

const prepare = root.addTask('husky');
prepare.exec('husky', { condition: '[ ! -n "$CI" ]' });

root.synth();
