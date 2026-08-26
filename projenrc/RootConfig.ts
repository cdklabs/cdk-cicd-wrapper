import * as pj from 'projen';
import { yarn } from 'cdklabs-projen-project-types';

/**
 * Shared by the root devDep, the workspaces' peer floor and the yarn resolution below, which must
 * all agree: `constructs` types are nominal, so a second copy in the tree makes them unassignable.
 *
 * Module scope because instance fields are not readable inside `super()`.
 */
const CONSTRUCTS_VERSION = '10.5.0';

export class RootConfig extends yarn.Monorepo {
  public readonly repositoryUrl = 'https://github.com/cdklabs/cdk-cicd-wrapper.git';
  public readonly eslintDeps = [
    'eslint@^8',
    '@typescript-eslint/eslint-plugin@^7',
    '@typescript-eslint/parser@^7',
    '@typescript-eslint/typescript-estree@^7',
  ];
  public readonly workflowRunsOn = ['ubuntu-latest'];
  public readonly cdkVersion = '2.195.0';
  public readonly integVersion = '2.186.0';
  public readonly cdkNagVersion = '2.28.0';
  public readonly constructsVersion = CONSTRUCTS_VERSION;
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
      defaultReleaseBranch: 'blueprint',
      // Floor required by cdklabs-projen-project-types 0.5.x
      projenVersion: '^0.99.68',
      devDeps: [
        'cdklabs-projen-project-types@^0.5.2',
        `constructs@${CONSTRUCTS_VERSION}`,
        // The monorepo release task runs `yarn workspaces run shx rm -rf dist`, but neither
        // cdklabs-projen-project-types nor projen >=0.99 declares shx (projen 0.97 pulled it in
        // transitively). Declare it here so the hoisted bin exists.
        'shx@^0.4.0',
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
        // GitHub only forbids approving your *own* PR, so `github-actions[bot]` approving a
        // maintainer's PR is allowed. Requires the `auto-approve` label per PR, and mergify still
        // holds the merge until every condition in `strengthenMergeGate` passes.
        allowedUsernames: ['aws-cdk-automation', 'dependabot[bot]', 'gyalai-aws'],
      },
      autoApproveUpgrades: true,
      release: true,
      releaseOptions: {
        publishToNpm: true,
        releaseTrigger: pj.release.ReleaseTrigger.continuous({
          paths: ['packages/*', 'package.json'],
        }),
        // Blueprint maintenance line. Its own single-branch release workflow (triggers on the
        // `legacy-blueprint` branch), pinned to the 0.x tag line via majorVersion so it never bumps
        // off Autopilot's 1.x tags, and staying on the `latest` dist-tag so existing installs are
        // unchanged until Autopilot reaches 1.0.0.
        branchName: 'legacy-blueprint',
        majorVersion: 0,
        npmDistTag: 'latest',
        // npm's Trusted Publisher (OIDC) config on npmjs.com is keyed by workflow filename, and only
        // `release.yml` (main's) is registered. Reusing that exact filename here — instead of the
        // default `release-legacy-blueprint.yml` — lets this branch's publish jobs authenticate
        // under the same registration; GitHub's `release` environment branch policy is what actually
        // restricts which branches may use it.
        releaseWorkflowName: 'release',
      },
      githubOptions: {
        dependencyReview: true,
        dependencyReviewOptions: {
          // Fork PRs get a read-only token, so the comment step cannot post. The findings still
          // appear in the job summary and, being a merge condition, still block.
          commentSummaryInPr: 'never',
        },
        pullRequestLintOptions: {
          semanticTitleOptions: {
            types: ['feat', 'fix', 'chore', 'refactor'],
          },
        },
      },
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
        'mcp-servers/debugger-mcp/mcp-server-config.json', // generated by Taskfile
        'mcp-servers/debugger-mcp/cdk_cicd_wrapper_debugger_mcp.egg-info',
        'mcp-servers/debugger-mcp/debugger/.venv',
        'mcp-servers/debugger-mcp/debugger/__pycache__',
        'mcp-servers/debugger-mcp/debugger/tools/__pycache__',
        'mcp-servers/debugger-mcp/tests/__pycache__',
        'mcp-servers/debugger-mcp/.pytest_cache',
        'mcp-servers/debugger-mcp/.coverage',
        '.worktrees',
      ],
    });

    // projen and cdklabs-projen-project-types depend on `constructs` with differing ranges, which
    // yarn would otherwise install as separate copies.
    this.package.addPackageResolutions(`constructs@${CONSTRUCTS_VERSION}`);

    this.strengthenMergeGate();

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

  /**
   * projen's default gate is `#approved-reviews-by>=1` + `status-success=build`, which an approval
   * alone satisfies even when a reviewer has since requested changes or left unresolved threads.
   *
   * Only add conditions for checks that run on *every* PR — mergify reports a skipped job as
   * neutral rather than success, so a conditionally-skipped check stalls the queue indefinitely.
   */
  private strengthenMergeGate() {
    this.autoMerge?.addConditions(
      '#changes-requested-reviews-by=0',
      '#review-threads-unresolved=0',
      'status-success=dependency-review',
    );
  }

  private configureLinting() {
    // `yarn.Monorepo` omits this, so ESLint walks up past the repo and picks up a second
    // @typescript-eslint from any parent config — e.g. a git worktree checked out below the repo.
    this.tryFindObjectFile('.eslintrc.json')?.addOverride('root', true);

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
