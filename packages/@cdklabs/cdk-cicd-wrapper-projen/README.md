# CDK CI/CD Wrapper Projen

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

> [!WARNING]
> **This package is deprecated.** In v3, a project no longer needs a projen project type: the pipeline
> is described in a single **`cicd.config.ts`** and provisioned with the **`cdk-cicd`** CLI, with no
> wrapper code in your `bin/`. This package keeps building and publishing on the 0.x line until the v3.0
> major, then is removed. New projects should not adopt it; existing ones should migrate — see the
> **v2 → v3** chapter in [`MIGRATION.md`](../../../MIGRATION.md). Decision D5 in `task.md` records the
> rationale (3 packages → 2).

The [CDK CI/CD Wrapper](https://cdklabs.github.io/cdk-cicd-wrapper) Projen contains [projen](https://projen.io) components to maintain your CDK CI/CD Wrapper projects.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
  - [Compliance Bucket](#compliance-bucket)
  - [Security Scanning](#security-scanning)
  - [License Management](#license-management)
  - [Check Dependencies](#check-dependencies)
  - [Validate](#validate)
- [Contributing](#contributing)
- [License](#license)

## Installation
More information at [CDK CI/CD Wrapper with Projen](https://cdklabs.github.io/cdk-cicd-wrapper/getting_started/projen.html)

## Usage
More information at [CDK CI/CD Wrapper with Projen](https://cdklabs.github.io/cdk-cicd-wrapper/getting_started/projen.html)

## Contributing
Contributions to the CDK CI/CD Wrapper are welcome! If you'd like to contribute, please follow the guidelines outlined in the [CONTRIBUTING.md](CONTRIBUTING.md) file.

## License

The CDK CI/CD Wrapper CLI is licensed under the [Apache 2.0 License](https://opensource.org/licenses/Apache-2.0).