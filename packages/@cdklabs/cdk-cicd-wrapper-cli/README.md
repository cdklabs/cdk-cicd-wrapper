# CDK CI/CD Wrapper CLI

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

The [CDK CI/CD Wrapper](https://cdklabs.github.io/cdk-cicd-wrapper) CLI is a command-line interface (CLI) tool designed to streamline and automate various tasks related to AWS Cloud Development Kit (CDK) projects. It provides developers with a set of utilities to manage compliance, security, licensing, and dependency management, all within a single interface.

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

To install the CDK CI/CD Wrapper, you'll need to have Node.js and npm (Node Package Manager) installed on your system. Once you have those prerequisites, you can install the Wrapper globally using the following command:

```bash
npm install -g @cdklabs/cdk-cicd-wrapper-cli
```

Alternatively, you can use the `npx` command to run the Wrapper without installing it globally:

```bash
npx @cdklabs/cdk-cicd-wrapper-cli [command]
```

## Usage

The CDK CI/CD Wrapper CLI provides several commands to help you manage various aspects of your CDK project. Here are the available commands and their descriptions:

### Compliance Bucket

The `npx @cdklabs/cdk-cicd-wrapper-cli compliance-bucket` command creates S3 buckets to hold logs for compliance purposes.

### Security Scanning

The `npx @cdklabs/cdk-cicd-wrapper-cli security-scan` command scans your codebase for security vulnerabilities. You can read more about the built-in security functionalities in the [Security Developer Guide](https://cdklabs.github.io/cdk-cicd-wrapper/developer_guides/security).

### License Management

The `npx @cdklabs/cdk-cicd-wrapper-cli license` command can validate and generate a NOTICE file for your project. The NOTICE file consistency is tested by this command and is included in the CodePipeline Build step to ensure the file is always up-to-date.

To update the NOTICE file, run the following command:

```bash
npx @cdklabs/cdk-cicd-wrapper-cli license --fix
```

### License Management Configuration

The license management script configuration can be specified in the `licensecheck.json` file. Here's an example configuration:

```json
{
  "failOnLicenses": ["MIT License"],
  "npm": {
    "excluded": [],
    "excludedSubProjects": ["./example/package.json"]
  },
  "python": {
    "excluded": [],
    "excludedSubProjects": ["./example/Pipfile"]
  }
}
```

- Banned licenses can be listed on the `failOnLicenses` attribute. The license name match is case-sensitive.
- Subfolders whose `Pipfile` or `package.json` file should be excluded from the license check should be listed under the `npm.excludedSubProjects` or `python.excludedSubProjects` attributes.
- For NPM packages, the subfolder also needs to contain a `package-lock.json` file to ensure the correct dependencies are installed and checked.
- Dependencies can be excluded from the license verification for NPM and Python as well.

For more information on license management configuration options, refer to the [License Management Configuration](#license-management-configuration) section.

### Check Dependencies

The `npx @cdklabs/cdk-cicd-wrapper-cli check-dependencies` command audits your project's dependencies.

### Validate

The `npx @cdklabs/cdk-cicd-wrapper-cli validate` command ensures that the `package-lock.json` file has not been tampered with.


## Contributing
Contributions to the CDK CI/CD Wrapper are welcome! If you'd like to contribute, please follow the guidelines outlined in the [CONTRIBUTING.md](CONTRIBUTING.md) file.

## License

The CDK CI/CD Wrapper CLI is licensed under the [Apache 2.0 License](https://opensource.org/licenses/Apache-2.0).