import * as pj from 'projen';
import { yarn } from 'cdklabs-projen-project-types';

export class RootConfig extends yarn.Monorepo {
  public readonly repositoryUrl = 'https://github.com/cdklabs/cdk-cicd-wrapper.git';
  public readonly eslintDeps = [
    'eslint@^8',
    '@typescript-eslint/eslint-plugin@^7',
    '@typescript-eslint/parser@^7',
    '@typescript-eslint/typescript-estree@^7',
  ];
  public readonly workflowRunsOn = ['ubuntu-latest'];
  public readonly cdkVersion = '2.149.0';
  public readonly cdkNagVersion = '2.28.0';
  public readonly constructsVersion = '10.3.0';
  public readonly authorName = 'CDK CI/CD Wrapper Team';

  public readonly licenseTask: pj.Task;
  public readonly validateTask: pj.Task;
  public readonly upgradeTask: pj.Task;
  public readonly securityScanTask: pj.Task;
  public readonly checkDependenciesTask: pj.Task;
  public readonly auditTask: pj.Task;

  constructor() {
    super({
      name: 'cdk-cicd-wrapper',
      authorName: 'CDK CI/CD Wrapper Team',
      description:
        'This repository contains the infrastructure as code to wrap your AWS CDK project with CI/CD around it.',
      repository: 'https://github.com/cdklabs/cdk-cicd-wrapper.git',
      homepage: 'https://github.com/cdklabs/cdk-cicd-wrapper.git',
      keywords: ['cli', 'aws-cdk', 'awscdk', 'aws', 'ci-cd-boot', 'ci-cd', 'vanilla-pipeline'],
      projenrcTs: true,
      defaultReleaseBranch: 'main',
      devDeps: [
        'cdklabs-projen-project-types',
        `constructs@10.3.0`,
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
      workflowRunsOn: ['ubuntu-latest'],
      pullRequestTemplate: true,
      autoApproveOptions: {
        allowedUsernames: ['aws-cdk-automation', 'dependabot[bot]'],
      },
      autoApproveUpgrades: true,
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
        '.venv',
      ],
    });

    this.configureLinting();
    this.validateTask = this.configureValidate();
    this.licenseTask = this.configureLicense();
    this.upgradeTask = this.configureUpgrade();

    this.securityScanTask = this.configureSecurityScan();
    this.checkDependenciesTask = this.configureCheckDependencies();
    this.auditTask = this.configureAudit();

    this.configureCommitLinting();

    this.configureHusky();
    this.configureContributors();
  }

  private configureLinting() {
    const lint = this.addTask('lint', {
      description: 'Lint all code',
    });
    lint.spawn(this.tasks.tryFind('fmt')!);
    lint.exec('yarn workspaces run eslint');
  }

  private configureValidate() {
    const validate = this.addTask('validate', {
      description: 'Validate the lock files',
    });
    validate.exec('yarn workspace @cdklabs/cdk-cicd-wrapper-cli run cli-exec validate', { receiveArgs: true });

    const validateFix = this.addTask('validate:fix', {
      description: 'Fixes the lock files',
    });
    validateFix.exec('yarn workspace @cdklabs/cdk-cicd-wrapper-cli run cli-exec validate --fix', { receiveArgs: true });

    return validate;
  }

  private configureLicense() {
    const license = this.addTask('license', {
      description: 'Notice file checking and generation',
    });
    license.exec('yarn workspace @cdklabs/cdk-cicd-wrapper-cli run cli-exec license', { receiveArgs: true });

    return license;
  }

  private configureUpgrade() {
    const upgrade = this.tasks.tryFind('upgrade')!;
    upgrade.spawn(this.licenseTask, { args: ['--fix'] });
    upgrade.spawn(this.validateTask, { args: ['--fix'] });

    return upgrade;
  }

  private configureCheckDependencies() {
    const checkDependencies = this.addTask('check-dependencies', {
      description: 'Notice file checking and generation',
    });
    checkDependencies.exec('yarn workspace @cdklabs/cdk-cicd-wrapper-cli run cli-exec check-dependencies', {
      receiveArgs: true,
    });

    return checkDependencies;
  }

  private configureSecurityScan() {
    const securityScan = this.addTask('security-scan', {
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

    return securityScan;
  }

  private configureAudit() {
    const audit = this.addTask('audit');

    audit.spawn(this.checkDependenciesTask);
    audit.spawn(this.securityScanTask);
    audit.spawn(this.licenseTask);

    return audit;
  }

  private configureCommitLinting() {
    this.package.addDevDeps('@commitlint/cli', '@commitlint/config-conventional');
    this.package.file.patch(
      pj.JsonPatch.add('/commitlint', {
        extends: ['@commitlint/config-conventional'],
      }),
    );

    const commitlint = this.addTask('commitlint');
    commitlint.exec('commitlint --edit', { receiveArgs: true });
  }

  private configureHusky() {
    // husky
    this.package.addDevDeps('husky');

    const prepare = this.addTask('husky');
    prepare.exec('husky', { condition: '[ ! -n "$CI" ]' });
  }

  private configureContributors() {
    this.addDevDeps('all-contributors-cli');
    this.addTask('contributors:update', {
      exec: 'all-contributors check | grep "Missing contributors" -A 1 | tail -n1 | sed -e "s/,//g" | xargs -n1 | grep -v "\\[bot\\]" | grep -v "cdklabs-automation" | grep -v "amazon-auto" | xargs -n1 -I{} all-contributors add {} code',
    });
    this.npmignore?.exclude('/.all-contributorsrc');
  }
}
