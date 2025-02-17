# Security on {{ project_name }}

{{ project_name }} brings the IaaC security to a new level with its built-in toolsets based on AWS best practices and industry wide standards. It includes Static Application Security Testing (SAST), Dependency Vulnerability Scanning, and AI based vulnerability scanning.

## Reference sheet of Security controls

| Security Tool                                         | Type                                    | Status   | Limitations                                                                                        | Description                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------- | --------------------------------------- | -------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AWS CDK NAG](#aws-cdk-nag)                           | Static Application Security Testing     | Enabled  |                                                                                                    | **cdk-nag** integrates directly into AWS Cloud Development Kit (AWS CDK) applications to provide identification and reporting mechanisms similar to SAST tooling. []                                                                                                                                                                                     |
| [Amazon CodeGuru Reviewer](#amazon-codeguru-reviewer) | Static Application Security Testing     | Enabled  | Supported with AWS CodeCommit repository only.<br> Verify Pull Requests only and users can by pass | [Amazon CodeGuru Reviewer](https://aws.amazon.com/codeguru/reviewer) detect vulnerabilities and automate code reviews with machine-learning powered recommendations.                                                                                                                                                                                     |
| [Amazon CodeGuru Security](#amazon-codeguru-security) | Static Application Security Testing     | Disabled | Amazon CodeGuru Security is in preview release and is subject to change.                           | [Amazon CodeGuru Security](https://aws.amazon.com/codeguru/) is a static application security testing (SAST) tool that combines machine learning (ML) and automated reasoning to identify vulnerabilities in your code, provide recommendations on how to fix the identified vulnerabilities, and track the status of the vulnerabilities until closure. |
| [Better-NPM-Audit](#better-npm-audit)                 | Dependency Scanning for Vulnerabilities | Enabled  | Verifies NPM dependencies                                                                          | Scans the dependencies for known vulnerabilities CVEs.                                                                                                                                                                                                                                                                                                   |
| [pip-audit](#pip-audit)                               | Dependency Scanning for Vulnerabilities | Enabled  | Verifies Python dependencies based on the provided Pipfiles.                                       | Scans the dependencies for known vulnerabilities CVEs.                                                                                                                                                                                                                                                                                                   |
| [semgrep](#semgrep)                                   | Static Security Code Scanner            | Enabled  |                                                                                                    | Scans the codebase for vulnerabilities.                                                                                                                                                                                                                                                                                                                  |
| [shellcheck](#shellcheck)                             | Static Security Code Scanner            | Enabled  | Analyses Shell Scripts                                                                             | Scans the codebase for vulnerabilities.                                                                                                                                                                                                                                                                                                                  |
| [Bandit](#bandit)                                     | Static Security Code Scanner            | Enabled  | Analyses Python source codes                                                                       | Scans the codebase for vulnerabilities.                                                                                                                                                                                                                                                                                                                  |

## Tools description

### AWS CDK Nag

**cdk-nag** integrates directly into AWS Cloud Development Kit (AWS CDK) applications to provide identification and reporting mechanisms similar to SAST tooling.

CDK Nag is applied as a CDK Aspect and it looks for patterns in the CDK Application that may indicate insecure infrastructure. Roughly speaking, it will look for:

- IAM rules that are too permissive (wildcards)
- Security group rules that are too permissive (wildcards)
- Access logs that aren't enabled
- Encryption that isn't enabled
- Password literals
- and many more

The CDK Nag verification is executed to during the `cdk synth` phase. <<!—did mean “also” with the “to” ->>

If you have assessed the risk of new finding and want to suppress these CDK Nag rules to prevent them from failing the CDK Deploymen then you should do so in their own dedicated stacks rather than doing it centrally.

More information about the CDK Nag can be found on these locations:

- [AWS CDK NAG](https://github.com/cdklabs/cdk-nag)
- [Manage application security and compliance with the AWS Cloud Development Kit and cdk-nag](https://aws.amazon.com/blogs/devops/manage-application-security-and-compliance-with-the-aws-cloud-development-kit-and-cdk-nag/)

#### How to enable / disable

The AWS CDK Nag is such an essential part of ensuring the security of the IaaC project that it’s use is mandatory.

### Amazon CodeGuru Reviewer

[Amazon CodeGuru Reviewer](https://aws.amazon.com/codeguru/reviewer) detects vulnerabilities and automates code reviews with machine-learning powered recommendations.

Amazon CodeGuru Reviewer is included in pipelines created with AWS CodeCommit as VCS and it automatically reviews the created Pull Requests and provides actionable recommendations on the changes.

Amazon CodeGuru Reviewer recommendations are available directly on the Pull Requests or on the AWS Console / Amazon CodeGuru / Reviewer / Code Reviews.

#### How to enable / disable

The scanning can be enabled/disabled with the `AppConfig.repositoryConfig.CODECOMMIT.codeGuruReviewer` configuration. If the configuration value is true then it is enabled. If the configuration false then it is disabled.

### Amazon CodeGuru Security

[Amazon CodeGuru Security](https://aws.amazon.com/codeguru/) is a static application security testing (SAST) tool that combines machine learning (ML) and automated reasoning to identify vulnerabilities in your code, providing recommendations on how to fix the identified vulnerabilities, and tracking the status of the vulnerabilities until closure.

Amazon Code Guru is applied on the pipeline as part of the Build stage to ensures the solution security meets with the highest standard. The scanning stops the pipeline in case there is any findings that have higher severity than `High` default. The threshold level can be adjusted by the `AppConfig.codeGuruScanThreshold` configuration option.

The Amazon Code Guru findings and recommendations can be found on the AWS Console / Amazon CodeGuru / Security / Findings . The Findings page provides a holistic view about the security recommendations. Information about each Scan can be found on the AWS Console / Amazon CodeGuru / Security / Scans page.

#### How to enable / disable

The scanning can be enabled/disabled with the `AppConfig.codeGuruScanThreshold` configuration. If the configuration is present than it is enabled. If the configuration is missing the scan will be disabled.

### Better NPM Audit

The goal of this project is to provide additional features on top of the existing npm audit options. We hope to encourage more people to do security audits for their projects.

More information about [Better NPM Audit](https://www.npmjs.com/package/better-npm-audit).

#### How to disable

Remove the `audit:deps:nodejs` script from the `package.json`.

### pip-audit

pip-audit is a tool for scanning Python environments for packages with known vulnerabilities. It uses the Python Packaging Advisory Database (https://github.com/pypa/advisory-database) via the PyPI JSON API as a source of vulnerability reports.

More information about [pip-audit](https://pypi.org/project/pip-audit/).

#### How to disable

Remove the `audit:deps:python` script from the `package.json`.

### Semgrep

Semgrep accelerates your security journey by swiftly scanning code and package dependencies for known issues, software vulnerabilities, and detected secrets with unparalleled efficiency. Semgrep offers:

- Code to find bugs & vulnerabilities using custom or pre-built rules
- Supply Chain to find dependencies with known vulnerabilities
- Secrets to find hard-coded credentials that shouldn't be checked into source code

More information about [Semgrep](https://github.com/returntocorp/semgrep).

#### How to enable / disable

Add/remove the `semgrep` entry to/from the `SECURITY_SCANNERS` list in the `scripts/check-code-scan-security.sh`.

### Shellcheck

ShellCheck is a static analysis tool for shell scripts.

More information about [ShellCheck](https://www.shellcheck.net/wiki/Home).

#### How to enable / disable

Add/remove the `shellcheck` entry to/from the `SECURITY_SCANNERS` list in the `scripts/check-code-scan-security.sh`.

### Bandit

Bandit is a tool designed to find common security issues in Python code. To do this, Bandit processes each file, builds an AST from it, and runs appropriate plugins against the AST nodes.

More information about [Bandit](https://bandit.readthedocs.io/en/latest/).

#### How to enable / disable

Add/remove the `bandit` entry to/from the `SECURITY_SCANNERS` list in the `scripts/check-code-scan-security.sh`.

## Security checks on GitHub Actions

GitHub Actions executes the enabled security checks as part of the pull requests checks. In case any of the enabled security tools identify a security issue the corresponding check fails and protect the codebase.

For Bandit, Shellcheck, and Semgrep tools the Github Actions integration converts the security findings to Junit and Checkstyle outputs that Github can present in the `Files changed` tab to help the troubleshooting.

If there is no security findings from these tools:

- the `Checkstyle Source Code Analyzer report` will report `0 violation(s) found` that means the Shellcheck tool has not found any issue
- the `JUnit Test Report` will report `No test results found!` that means neither the Semgrep nor the Bandit tools have not found any issue

Notice: As the actual security scanning is not part of the `Checkstyle Source Code Analyzer` or `JUnit` these reports will report 0s as execution time. The scanning of these tools are executed as part of the `Security Scans`
