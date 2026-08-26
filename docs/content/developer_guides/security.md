# Security on {{ project_name }}

{{ project_name }} brings infrastructure-as-code security to a new level with built-in toolsets based on AWS best practices and industry-wide standards. It includes Static Application Security Testing (SAST) and dependency vulnerability scanning, run through `cdk-cicd check`/`cdk-cicd security-scan`/`cdk-cicd check-dependencies` — no package.json script surgery needed.

## Reference sheet of Security controls

| Security Tool | Type | Status | Limitations | Description |
| --- | --- | --- | --- | --- |
| [AWS CDK Nag](#aws-cdk-nag) | Static Application Security Testing | Enabled | | **cdk-nag** integrates directly into AWS CDK applications to provide identification and reporting mechanisms similar to SAST tooling. |
| [Better-NPM-Audit](#better-npm-audit) | Dependency Scanning for Vulnerabilities | Enabled | Verifies NPM dependencies | Scans the dependencies for known CVEs. |
| [pip-audit](#pip-audit) | Dependency Scanning for Vulnerabilities | Enabled | Verifies Python dependencies based on the provided Pipfiles | Scans the dependencies for known CVEs. |
| [semgrep](#semgrep) | Static Security Code Scanner | Enabled | | Scans the codebase for vulnerabilities. |
| [shellcheck](#shellcheck) | Static Security Code Scanner | Enabled | Analyses Shell Scripts | Scans the codebase for vulnerabilities. |
| [Bandit](#bandit) | Static Security Code Scanner | Enabled | Analyses Python source code | Scans the codebase for vulnerabilities. |

!!! note "Amazon CodeGuru"

    Blueprint (0.x) included Amazon CodeGuru Reviewer (CodeCommit pull-request review) and Amazon
    CodeGuru Security (build-stage SAST scanning). Neither is part of zero-touch — `cdk-cicd security-scan`
    (Bandit/Semgrep/ShellCheck) and `cdk-cicd check-dependencies` (CVE scanning) are the zero-touch replacement
    for the vulnerability-scanning half; there is no zero-touch replacement for CodeGuru's pull-request-review
    automation specifically.

## Tools description

### AWS CDK Nag

**cdk-nag** integrates directly into AWS CDK applications to provide identification and reporting mechanisms similar to SAST tooling.

CDK Nag is applied as a CDK Aspect and looks for patterns in the CDK application that may indicate insecure infrastructure. Roughly speaking, it looks for:

- IAM rules that are too permissive (wildcards)
- Security group rules that are too permissive (wildcards)
- Access logs that aren't enabled
- Encryption that isn't enabled
- Password literals
- and many more

CDK Nag verification runs during `cdk synth`, which the pipeline's CI build always runs (see the [CI guide](./ci.md)).

If you have assessed the risk of a new finding and want to suppress a CDK Nag rule, do so in the stack that owns the resource rather than centrally.

More information about CDK Nag:

- [AWS CDK NAG](https://github.com/cdklabs/cdk-nag)
- [Manage application security and compliance with the AWS Cloud Development Kit and cdk-nag](https://aws.amazon.com/blogs/devops/manage-application-security-and-compliance-with-the-aws-cloud-development-kit-and-cdk-nag/)

#### How to enable / disable

CDK Nag is mandatory — it runs on every `cdk synth`, which is not skippable.

!!! warning "Known gap: `AwsSolutions-S10` can't be satisfied on any S3 bucket"
    The wrapper's own TLS-enforcement aspect denies only `s3:PutObject` over non-TLS, but cdk-nag's
    `AwsSolutions-S10` rule requires the Deny statement's action to be `s3:*`/`*` — so this rule fails on
    every bucket regardless of environment, and needs a manual `NagSuppressions` entry per bucket today.
    Tracked as `migration-encryptbuckettransit-s10-action-scope` in the repo's `findings.json`.

### Better NPM Audit

Additional features on top of the existing `npm audit` options, aimed at encouraging more people to run security audits for their projects.

More information about [Better NPM Audit](https://www.npmjs.com/package/better-npm-audit).

#### How to enable / disable

Run `cdk-cicd check-dependencies --npm` (or `cdk-cicd check` without arguments, which includes it as the `audit` check whenever an npm lock file is present). To disable it, remove it from your own `ci.steps` in `cicd.config.ts` if you have replaced the default `cdk-cicd check` step — see the [CI guide](./ci.md).

### pip-audit

Scans Python environments for packages with known vulnerabilities, using the [Python Packaging Advisory Database](https://github.com/pypa/advisory-database) via the PyPI JSON API.

More information about [pip-audit](https://pypi.org/project/pip-audit/).

#### How to enable / disable

Run `cdk-cicd check-dependencies --python`. `cdk-cicd check`'s `audit` check includes this automatically whenever a `Pipfile` is present in the project; it is skipped (not failed) otherwise.

### Semgrep

Static code scanning for common bug/vulnerability patterns, using Semgrep's free community rule sets. What
runs here is plain `semgrep scan --config p/default` — no login, no `SEMGREP_APP_TOKEN`. Semgrep's paid
Supply Chain and Secrets products (dependency-vulnerability scanning, hardcoded-credential detection) are
**not** what's wired up here; those require the logged-in `semgrep ci` workflow, which this integration
does not use. Dependency vulnerabilities are covered separately by [Better NPM Audit](#better-npm-audit)
above; there is no dedicated secrets scanner in the default `cdk-cicd check` pipeline.

More information about [Semgrep](https://github.com/returntocorp/semgrep).

#### How to enable / disable

Semgrep runs as part of `cdk-cicd security-scan --semgrep` (or `cdk-cicd check`'s `security` check, which always runs it). There is no per-scanner disable flag exposed through `cdk-cicd check` — replace the default `check` step with your own `ci.steps` (see the [CI guide](./ci.md)) if you need to opt out of an individual scanner.

### Shellcheck

A static analysis tool for shell scripts.

More information about [ShellCheck](https://www.shellcheck.net/wiki/Home).

#### How to enable / disable

Runs as part of `cdk-cicd security-scan --shellcheck` (or `cdk-cicd check`'s `security` check). See the Semgrep note above for opting out.

### Bandit

Finds common security issues in Python code by building an AST from each file and running plugins against the AST nodes.

More information about [Bandit](https://bandit.readthedocs.io/en/latest/).

#### How to enable / disable

Runs as part of `cdk-cicd security-scan --bandit` (or `cdk-cicd check`'s `security` check). See the Semgrep note above for opting out.

## Producing CI-friendly reports

`cdk-cicd security-scan --bandit --semgrep --shellcheck --ci` writes Bandit/Semgrep/ShellCheck findings as JUnit and Checkstyle reports into a `junit-reports` folder, which GitHub Actions (and most other CI systems) can render inline on a pull request's "Files changed" / checks view. Note `cdk-cicd check`'s own `security` check does **not** pass `--ci` — add `--ci` yourself if you run `security-scan` directly from a GitHub Actions workflow (in particular if you deploy with the `GITHUB_ACTIONS` engine) and want the report files.
