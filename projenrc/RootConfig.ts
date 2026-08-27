// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

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
      defaultReleaseBranch: 'main',
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
      pullRequestTemplateContents: [
        '## Description',
        '',
        'Fixes #',
        '',
        '## Changes',
        '',
        '-',
        '',
        '## Testing',
        '',
        '- [ ] Unit tests pass (`npm run test`)',
        '- [ ] Built locally (`npm run build`)',
        '',
        '## Checklist',
        '',
        '- [ ] Conventional-commit title (`feat:`/`fix:`/`chore:`/`refactor:`)',
        '- [ ] Breaking changes flagged with `feat!:` or a `BREAKING CHANGE:` footer',
        '- [ ] Docs updated if behaviour changed',
        '',
        'By submitting this pull request, I confirm that my contribution is made under the terms of the Apache-2.0 license.',
      ],
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
        // Must live here, not as a top-level project option: yarn.Monorepo always passes
        // `release: false` to the underlying TypeScriptProject regardless of this class's own
        // `release` flag, so a top-level `majorVersion`/`minMajorVersion` builds no Release/Version
        // component at all and has zero effect anywhere -- which is exactly how the Autopilot breaking
        // release shipped as 0.4.0 instead of 1.0.0. Set here, in `releaseOptions`, it reaches the
        // internal MonorepoRelease component and is inherited by every workspace (PipelineConfig,
        // CLIConfig).
        minMajorVersion: 1,
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

    // Force the picomatch under micromatch (globby > fast-glob > micromatch > picomatch, shipped by
    // the CLI) off the vulnerable 2.3.1 (GHSA-c2c7-rcm5-vvqj ReDoS + GHSA-3v7f-55p6-f55p). Scoped to
    // the micromatch edge so the unrelated picomatch@^4 line is untouched. Key '/' is escaped '~1'.
    this.package.file.patch(pj.JsonPatch.add('/resolutions/micromatch~1picomatch', '^2.3.2'));

    this.strengthenMergeGate();
    this.pinThirdPartyActions();

    this.configureLinting();
    this.validateTask = this.configureValidate();
    this.licenseTask = this.configureLicense();
    this.upgradeTask = this.configureUpgrade();

    this.securityScanTask = this.configureSecurityScan();
    this.checkDependenciesTask = this.configureCheckDependencies();
    this.auditTask = this.configureAudit();

    this.configureCommitLinting();
    this.configureAislop();

    this.configureHusky();
    this.configureContributors();
    this.configureDocsDeploy();
    this.configureSampleHarness();

    this.ignoreProofArtifacts();
  }

  /**
   * D3 (task.md), amended twice on 2026-08-26: docs/proof/ is generated and reviewed locally,
   * never committed -- not the recordings, not its README index. Everything previously tracked
   * there was removed from git (`git rm --cached`); kept on disk, not deleted.
   */
  private ignoreProofArtifacts() {
    this.addGitIgnore('docs/proof/');
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

  /**
   * Pin third-party GitHub Actions used in privileged, token-bearing workflows to a full commit
   * SHA (a moving @vN tag could be hijacked and run with pull_request_target / PROJEN_GITHUB_TOKEN
   * scope). SHAs point at the current v6 / v8 tags; bump deliberately. actions/* and aws-actions/*
   * are first-party and left on tags.
   */
  private pinThirdPartyActions() {
    // amannn/action-semantic-pull-request@v6
    this.github?.actions.set(
      'amannn/action-semantic-pull-request@v6',
      'amannn/action-semantic-pull-request@48f256284bd46cdaab1048c3721360e808335d50',
    );
    // peter-evans/create-pull-request@v8
    this.github?.actions.set(
      'peter-evans/create-pull-request@v8',
      'peter-evans/create-pull-request@5f6978faf089d4d20b00c7766989d076bb2fc7f1',
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
    const scrubCheck = this.addTask('scrub-check', {
      description: 'Fail if Amazon-internal references or non-placeholder AWS account ids reached the public tree',
      exec: 'node tools/scrub-check.js',
    });

    const audit = this.addTask('audit');

    audit.spawn(this.checkDependenciesTask);
    audit.spawn(this.securityScanTask);
    audit.spawn(this.licenseTask);
    audit.spawn(scrubCheck);

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

  /**
   * aislop (https://github.com/scanaislop/aislop) — a deterministic scanner that catches the
   * code-quality problems AI coding agents leave behind (narrative comments, swallowed exceptions,
   * `as any` casts, dead stubs, ...). Wired two ways off the SAME pinned dev-dep, so local and CI
   * run byte-identical:
   *   - locally as a pre-commit gate on staged files, invoked from the hand-maintained
   *     `.husky/pre-commit` as `npm run aislop` (this task) — blocks the commit on a failing score,
   *     just like `lint`/`validate` already do;
   *   - in CI as a quality gate on every PR and push to `main` (the workflow below), which installs
   *     the workspace and runs the pinned binary rather than fetching `@latest`.
   * The CI workflow is intentionally left OUT of `strengthenMergeGate` for now — it reports the score
   * on each PR but does not yet block the merge queue, until the maintainer tunes a threshold
   * (`.aislop/config.yml`).
   */
  private configureAislop() {
    this.package.addDevDeps('aislop');

    const aislop = this.addTask('aislop', {
      description: 'Gate staged changes on the aislop code-quality score',
      exec: 'aislop ci --staged --human',
    });

    const workflow = this.github!.addWorkflow('aislop');
    workflow.on({ pullRequest: {}, push: { branches: ['main'] } });
    workflow.addJob('quality-gate', {
      runsOn: this.workflowRunsOn,
      permissions: { contents: pj.github.workflows.JobPermission.READ },
      steps: [
        { uses: 'actions/checkout@v6' },
        { uses: 'actions/setup-node@v4', with: { 'node-version': '24' } },
        { name: 'Install dependencies', run: 'yarn install --check-files' },
        // Runs the pinned dev-dep (not `@latest`), so a CI failure always reproduces locally.
        { name: 'aislop quality gate', run: 'npx aislop ci --human' },
      ],
    });

    return aislop;
  }

  /**
   * The sample-app harness: audits every app under `samples/` for dependency vulnerabilities and for
   * Lambda runtimes that are past their AWS deprecation date. Fails on an EOL runtime (unless a sample
   * explicitly opts out with a `cdk-cicd:allow-runtime` marker) or a high/critical dependency advisory,
   * and warns on a not-latest runtime or an outdated `aws-cdk-lib` floor. The policy lives in
   * `test/harness/runtime-policy.json`; the logic is unit-tested in `test/harness/check-samples.test.mjs`.
   */
  private configureSampleHarness() {
    this.addTask('check:samples', {
      description: 'Audit samples/ for dependency CVEs and EOL/not-latest Lambda runtimes',
      exec: 'bash test/harness/check-samples.sh',
    });
    // Also run the fast, offline unit test of the policy logic as part of it.
    this.addTask('check:samples:test', {
      description: 'Unit-test the sample-harness runtime policy logic',
      exec: 'node --test test/harness/check-samples.test.mjs',
    });

    const workflow = this.github!.addWorkflow('sample-harness');
    workflow.on({
      pullRequest: { paths: ['samples/**', 'test/harness/**'] },
      push: { branches: ['main'], paths: ['samples/**', 'test/harness/**'] },
      workflowDispatch: {},
    });
    workflow.addJob('harness', {
      runsOn: this.workflowRunsOn,
      permissions: { contents: pj.github.workflows.JobPermission.READ },
      steps: [
        { uses: 'actions/checkout@v6' },
        { uses: 'actions/setup-node@v4', with: { 'node-version': '24' } },
        { uses: 'actions/setup-python@v5', with: { 'python-version': '3.12' } },
        // pip-audit powers the Python-sample security scan; harmless when a sample has no requirements.txt.
        { name: 'Install pip-audit', run: 'python3 -m pip install pip-audit' },
        { name: 'Unit-test the runtime policy', run: 'node --test test/harness/check-samples.test.mjs' },
        { name: 'Run the sample harness', run: 'bash test/harness/check-samples.sh' },
      ],
    });
  }

  /**
   * Build the mkdocs site and publish it to GitHub Pages on every push to `main` that touches the
   * docs (or on a manual dispatch). Runs the same two steps as the `docs` + `docs:deploy` Taskfile
   * targets -- `docs/scripts/build-docs` then `mkdocs gh-deploy` -- so CI publishes exactly what a
   * maintainer would from their machine. `gh-deploy` builds from `build/docs/mkdocs.yml` and
   * force-pushes the rendered site to the `gh-pages` branch, which is where Pages already serves from.
   */
  private configureDocsDeploy() {
    const workflow = this.github!.addWorkflow('docs');
    workflow.on({
      push: {
        branches: ['main'],
        // Only rebuild when something the site is built from changes.
        paths: ['docs/**', 'CONTRIBUTING.md', '.github/workflows/docs.yml'],
      },
      workflowDispatch: {},
    });
    workflow.addJob('deploy', {
      runsOn: this.workflowRunsOn,
      // gh-deploy commits the rendered site to the `gh-pages` branch, so the job needs write access
      // to repository contents. fetch-depth: 0 gives gh-deploy the full history it pushes onto.
      permissions: { contents: pj.github.workflows.JobPermission.WRITE },
      steps: [
        { uses: 'actions/checkout@v6', with: { 'fetch-depth': 0 } },
        { uses: 'actions/setup-node@v4', with: { 'node-version': '24' } },
        { uses: 'actions/setup-python@v5', with: { 'python-version': '3.12' } },
        // build-docs runs generate-markdown then mkdocs build; it also creates the venv gh-deploy uses.
        { name: 'Build docs', run: './scripts/build-docs', workingDirectory: 'docs' },
        // Same command as the `docs:deploy` Taskfile target; --force so CI can update the branch head.
        {
          name: 'Publish to gh-pages',
          run: '.venv/bin/mkdocs gh-deploy --force',
          workingDirectory: 'docs/build/docs',
        },
      ],
    });
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
