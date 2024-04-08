import { javascript, typescript, JsonPatch, Component, Project, TaskStep } from 'projen';
import { yarn, CdklabsConstructLibrary, JsiiLanguage } from 'cdklabs-projen-project-types';

const cdkVersion = '2.132.0';
const constructsVersion = '10.3.0';
const repositoryUrl = 'https://github.com/cdklabs/ci-cd-boot.git';

const root = new yarn.CdkLabsMonorepo({
  defaultReleaseBranch: 'main',
  devDeps: ['cdklabs-projen-project-types', '@typescript-eslint/eslint-plugin@^7', '@typescript-eslint/parser@^7'],
  name: 'root',
  authorName: 'Amazon Web Services',
  authorEmail: 'aws-avp-cdk-dev@amazon.com',
  description: 'This repository contains the infrastructure as code to bootstrap your next CI/CD project.',
  buildWorkflow: true,
  clobber: true,
  prettier: true,

  autoMerge: true,

  prettierOptions: {
    settings: {
      singleQuote: true,
      semi: true,
      trailingComma: javascript.TrailingComma.NONE,
      printWidth: 120
    }
  },

  pullRequestTemplate: true,
  homepage: repositoryUrl,
  gitignore: [
    'docs/build',
    'docs/dist',
    '.DS_Store',
    'junit-reports',
    '.npmrc',
    'tmp',
    '.devbox',
    '.task',
    'node_modules'
  ]
});

//============================================
//
//  CI/CD Wrapper package
//
//============================================

const pipeline = new CdklabsConstructLibrary({
  parent: root,
  outdir: './packages/cdk-cicd-wrapper',
  author: 'Amazon Web Services',
  authorAddress: 'aws-avp-cdk-dev@amazon.com',
  description: 'This repository contains the infrastructure as code to bootstrap your next CI/CD project.',
  keywords: ['cdk', 'aws-cdk', 'awscdk', 'aws', 'ci-cd-boot'],
  cdkVersion,
  constructsVersion,
  defaultReleaseBranch: 'main',
  name: '@cdklabs/cdk-cicd-wrapper',
  projenrcTs: true,
  prerelease: 'alpha',
  stability: 'experimental',
  releaseToNpm: true,
  jsiiTargetLanguages: [JsiiLanguage.PYTHON, JsiiLanguage.JAVA, JsiiLanguage.DOTNET],
  private: false,

  // Use same settings from root project
  packageManager: root.package.packageManager,
  projenCommand: root.projenCommand,
  minNodeVersion: root.minNodeVersion,

  prettierOptions: {
    settings: root.prettier?.settings
  },

  devDeps: [`@aws-cdk/integ-runner@${cdkVersion}-alpha.0`, `@aws-cdk/integ-tests-alpha@${cdkVersion}-alpha.0`],

  peerDeps: ['cdk-nag'],
  bundledDeps: ['@cloudcomponents/cdk-pull-request-approval-rule', '@cloudcomponents/cdk-pull-request-check'],
  jest: true,

  tsconfig: {
    extends: javascript.TypescriptConfigExtends.fromTypescriptConfigs([root.tsconfig!]),
    compilerOptions: {}
  },
  disableTsconfig: true,

  repositoryUrl: 'https://github.com/cdklabs/ci-cd-boot.git'
});

// Copy non TS sources to the package
pipeline.addDevDeps('copyfiles');
pipeline.tasks.tryFind('post-compile')!.exec('copyfiles -u 1 -E src/**/*.py src/**/Pipfile src/**/Pipfile.lock lib');

// Copy bundle dependencies to the package
const postCompile = pipeline.tasks.tryFind('post-compile')!;
postCompile.exec("export DEP='@cloudcomponents';cp -rf ../../node_modules/$DEP ./node_modules/ 2>/dev/null;");

root.register(convertToSubProject(pipeline, './packages/cdk-cicd-wrapper'));

//============================================
//
//  CLI package
//
//============================================
const cli = new typescript.TypeScriptProject({
  parent: root,
  outdir: './packages/cli',
  authorName: 'Amazon Web Services',
  authorEmail: 'aws-avp-cdk-dev@amazon.com',
  description: 'This repository contains the infrastructure as code to bootstrap your next CI/CD project.',
  keywords: ['cli', 'aws-cdk', 'awscdk', 'aws', 'ci-cd-boot'],
  defaultReleaseBranch: 'main',
  name: '@cdklabs/cdk-cicd-wrapper-cli',
  projenrcTs: true,
  prerelease: 'alpha',
  stability: 'experimental',

  bin: {
    'ci-cd-boot-cli': './bin/ci-cd-boot-cli'
  },

  // Use same settings from root project
  packageManager: root.package.packageManager,
  projenCommand: root.projenCommand,
  minNodeVersion: root.minNodeVersion,

  prettierOptions: {
    settings: root.prettier?.settings
  },

  deps: [
    'yargs',
    '@types/yargs',
    'globby@11.1.0', // globby version 12+ only support ESM
    'fs-extra',
    '@types/fs-extra',
    'csv',
    '@aws-sdk/client-s3',
    '@aws-sdk/credential-providers'
  ],
  jest: false,

  tsconfig: {
    extends: javascript.TypescriptConfigExtends.fromTypescriptConfigs([root.tsconfig!]),
    compilerOptions: {
      skipLibCheck: true
    }
  },

  homepage: 'https://github.com/cdklabs/ci-cd-boot.git'
});

// Don't need to include the TypeScript source files in the tarball; the transpiled JS files are sufficient.
cli.addPackageIgnore('*.ts');

const cliExec = cli.addTask('cli-exec');
cliExec.spawn(cli.tasks.tryFind('compile')!);
cliExec.exec('./packages/cli/bin/ci-cd-boot-cli', { receiveArgs: true, cwd: '../..' });

root.register(convertToSubProject(cli, './packages/cli'));

//============================================
//
//  Repository level configurations
//
//============================================
const lint = root.addTask('lint', {
  description: 'Lint all code'
});
lint.spawn(root.tasks.tryFind('fmt')!);
lint.exec('yarn workspaces run eslint');

const validate = root.addTask('validate', {
  description: 'Validate the lock files'
});
validate.exec('yarn workspace @cdklabs/cdk-cicd-wrapper-cli run cli-exec validate', { receiveArgs: true });

const validateFix = root.addTask('validate:fix', {
  description: 'Fixes the lock files'
});
validateFix.exec('yarn workspace @cdklabs/cdk-cicd-wrapper-cli run cli-exec validate --fix', { receiveArgs: true });

const license = root.addTask('license', {
  description: 'Notice file checking and generation'
});
license.exec('yarn workspace @cdklabs/cdk-cicd-wrapper-cli run cli-exec license', { receiveArgs: true });

// upgrade
const upgrade = root.tasks.tryFind('upgrade')!;
upgrade.spawn(license, { args: ['--fix'] });
upgrade.spawn(validate, { args: ['--fix'] });

const checkDependencies = root.addTask('check-dependencies', {
  description: 'Notice file checking and generation'
});
checkDependencies.exec('yarn workspace @cdklabs/cdk-cicd-wrapper-cli run cli-exec check-dependencies', {
  receiveArgs: true
});

const securityScan = root.addTask('security-scan', {
  description: 'Notice file checking and generation'
});

securityScan.exec(
  'yarn workspace @cdklabs/cdk-cicd-wrapper-cli run cli-exec security-scan  --bandit --semgrep --shellcheck --ci',
  { receiveArgs: true, condition: '[ -n "$CI" ]' }
);
securityScan.exec(
  'yarn workspace @cdklabs/cdk-cicd-wrapper-cli run cli-exec security-scan  --bandit --semgrep --shellcheck',
  { receiveArgs: true, condition: '[ ! -n "$CI" ]' }
);

const audit = root.addTask('audit');

audit.spawn(checkDependencies);
audit.spawn(securityScan);
audit.spawn(license);

// verdaccio
const verdaccio = root.addTask('verdaccio');
verdaccio.exec('verdaccio --config .verdaccio/config.yml', { receiveArgs: true });
root.addDevDeps('verdaccio');

// commitlint
root.package.addDevDeps('@commitlint/cli', '@commitlint/config-conventional');
root.package.file.patch(
  JsonPatch.add('/commitlint', {
    extends: ['@commitlint/config-conventional']
  })
);

const commitlint = root.addTask('commitlint');
commitlint.exec('commitlint --edit', { receiveArgs: true });

// husky
root.package.addDevDeps('husky');

// release
const release = root.addTask('release', {
  description: 'Release'
});
release.exec('yarn workspaces run release');

root.synth();

function convertToSubProject(project: Project, outdir: string): yarn.TypeScriptWorkspace {
  const upgrades: any = project.components.find(
    (c: Component): c is javascript.UpgradeDependencies => c instanceof javascript.UpgradeDependencies
  );

  // Remove devDependencies provided by root
  ['@typescript-eslint/eslint-plugin', '@typescript-eslint/parser'].forEach((dep) =>
    project.deps.removeDependency(dep)
  );

  project.tasks.removeTask('upgrade');
  project.tasks.removeTask('post-upgrade');
  project.tasks.addTask('check-for-updates', {
    env: { CI: '0' },
    steps: {
      toJSON: () => {
        const steps = upgrades.renderTaskSteps() as TaskStep[];
        return steps.filter(
          (step) => step.exec && typeof step.exec === 'string' && step.exec?.startsWith('npx npm-check-updates')
        );
      }
    } as any
  });

  // Install dependencies via the parent project
  /* @ts-ignore access private method */
  const originalResolve = project.package.resolveDepsAndWritePackageJson;
  /* @ts-ignore access private method */
  const pkgs = project.package;
  pkgs.installDependencies = () => {
    (project.parent! as yarn.Monorepo).requestInstallDependencies({
      resolveDepsAndWritePackageJson: () => originalResolve.apply(pkgs)
    });
  };
  /* @ts-ignore access private method */
  project.package.resolveDepsAndWritePackageJson = () => {};

  return { ...project, workspaceDirectory: outdir } as unknown as yarn.TypeScriptWorkspace;
}
