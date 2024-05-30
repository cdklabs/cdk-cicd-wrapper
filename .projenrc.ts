import * as pj from 'projen';
import { yarn } from 'cdklabs-projen-project-types';
import { Eslint } from 'projen/lib/javascript';
import { JSIIComponent } from './projenrc/jsiicomponent';

const repositoryUrl = 'https://github.com/cdklabs/cdk-cicd-wrapper.git';

const eslintDeps = [
  'eslint@^8',
  '@typescript-eslint/eslint-plugin@^7',
  '@typescript-eslint/parser@^7',
  '@typescript-eslint/typescript-estree@^7',
];

const workflowRunsOn = ['ubuntu-latest'];
const cdkVersion = '2.130.0';
const cdkNagVersion = '2.28.0';
const constructsVersion = '10.3.0';

const authorName = 'CDK CI/CD Wrapper Team';

const root = new yarn.Monorepo({
  name: 'cdk-cicd-wrapper',
  authorName,
  description: 'This repository contains the infrastructure as code to wrap your AWS CDK project with CI/CD around it.',
  repository: repositoryUrl,
  homepage: repositoryUrl,
  keywords: ['cli', 'aws-cdk', 'awscdk', 'aws', 'ci-cd-boot', 'ci-cd', 'vanilla-pipeline'],
  projenrcTs: true,

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
    releaseTrigger: pj.release.ReleaseTrigger.continuous({
      paths: ['packages/*', 'package.json'],
    }),
  },

  githubOptions: {
    pullRequestLintOptions: {
      semanticTitleOptions: {
        types: ['feat', 'fix', 'chore', 'refactor'],
      },
    },
    mergify: false,
  },

  prerelease: 'alpha',
  stability: 'experimental',
  gitignore: [
    'docs/build',
    'docs/dist',
    'docs/site',
    '.DS_Store',
    'junit-reports',
    '.npmrc',
    'development',
    'samples/**/package-lock.json', // ignore lock files
    '.devbox',
    '.task',
    'node_modules',
    '.env',
    '.env.*',
  ],
});

//============================================
//
//  CI/CD Wrapper package
//
//============================================

const pipeline = new yarn.TypeScriptWorkspace({
  parent: root,
  name: '@cdklabs/cdk-cicd-wrapper',
  authorName,
  description: 'This repository contains the infrastructure as code to wrap your AWS CDK project with CI/CD around it.',
  keywords: ['cli', 'aws-cdk', 'awscdk', 'aws', 'ci-cd-boot', 'ci-cd', 'vanilla-pipeline'],
  releasableCommits: pj.ReleasableCommits.featuresAndFixes('.'),

  devDeps: [
    'eslint@^8',
    '@typescript-eslint/eslint-plugin@^7',
    '@typescript-eslint/parser@^7',
    '@typescript-eslint/typescript-estree@^7',
  ],

  peerDeps: [`cdk-nag@^${cdkNagVersion}`, `aws-cdk-lib@^${cdkVersion}`, `constructs@^${constructsVersion}`],
  bundledDeps: ['@cloudcomponents/cdk-pull-request-approval-rule', '@cloudcomponents/cdk-pull-request-check'],
  jest: true,
  disableTsconfig: true,
});

// Keep the projen module as optional dependency, while we can leverage it in our samples
Eslint.of(pipeline)?.addRules({
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
new JSIIComponent(pipeline, {
  publishToPypi: {
    distName: `cdklabs.${packageBasename}`,
    module: `cdklabs.${changeDelimiter(packageBasename, '_')}`,
  },
  // publishToMaven: {
  //   javaPackage: `io.github.cdklabs.${changeDelimiter(packageBasename, '.')}`,
  //   mavenGroupId: `io.github.cdklabs`,
  //   mavenArtifactId: packageBasename,
  //   mavenEndpoint: 'https://s01.oss.sonatype.org',
  // },
  publishToNuget: {
    dotNetNamespace: `${upperCaseName('cdklabs')}.${upperCaseName(packageBasename)}`,
    packageId: `${upperCaseName('cdklabs')}.${upperCaseName(packageBasename)}`,
  },
  // publishToGo: {
  //   moduleName: `github.com/cdklabs/${packageBasename}-go`,
  // },
});

// Copy non TS sources to the package
pipeline.addDevDeps('copyfiles');
pipeline.addDevDeps(...eslintDeps);
pipeline.tasks
  .tryFind('post-compile')!
  .exec('copyfiles -u 1 -E src/**/*.py src/**/Pipfile src/**/Pipfile.lock src/projen/Taskfile.yaml lib');

// Copy bundle dependencies to the package
const postCompile = pipeline.tasks.tryFind('post-compile')!;
postCompile.exec("export DEP='@cloudcomponents';cp -rf ../../../node_modules/$DEP ./node_modules/ 2>/dev/null;");

//============================================
//
//  CLI package
//
//============================================
const cli = new yarn.TypeScriptWorkspace({
  parent: root,
  name: '@cdklabs/cdk-cicd-wrapper-cli',
  description: 'This repository contains the infrastructure as code to wrap your AWS CDK project with CI/CD around it.',
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
//  Projen package
//
//============================================
const projenModule = new yarn.TypeScriptWorkspace({
  parent: root,
  name: '@cdklabs/cdk-cicd-wrapper-projen',
  description: 'This repository contains the projen support for the project',

  projenrcTs: true,

  deps: ['projen'],
  jest: false,
});

projenModule.addDevDeps(...eslintDeps);

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

setupAllContributors(root);

root.synth();

function setupAllContributors(project: pj.javascript.NodeProject) {
  project.addDevDeps('all-contributors-cli');
  project.addTask('contributors:update', {
    exec: 'all-contributors check | grep "Missing contributors" -A 1 | tail -n1 | sed -e "s/,//g" | xargs -n1 | grep -v "\\[bot\\]" | grep -v "cdklabs-automation" | grep -v "amazon-auto" | xargs -n1 -I{} all-contributors add {} code',
  });
  project.npmignore?.exclude('/.all-contributorsrc');
}

function upperCaseName(str: string) {
  let words = str.split('-');
  words = words.map((w) => w[0].toUpperCase() + w.substring(1));
  return words.join('');
}

function changeDelimiter(str: string, delim: string) {
  return str.split('-').join(delim);
}
