## CDK CI/CD Wrapper

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

The [CDK CI/CD Wrapper](https://cdklabs.github.io/cdk-cicd-wrapper/) is a comprehensive solution that streamlines the delivery of your AWS Cloud Development Kit (CDK) applications. It provides a robust and standardized multi-stage CI/CD pipeline, ensuring high quality and confidence throughout the development and deployment process.

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [Usage](#usage)
  - [Defining Stages](#defining-stages)
  - [Configuring Stacks](#configuring-stacks)
  - [Customizing CI/CD Steps](#customizing-cicd-steps)
- [Autopilot Deployment Contracts](#autopilot-deployment-contracts)
- [Contributing](#contributing)
- [License](#license)

## Introduction

The CDK CI/CD Wrapper builds upon the success of the [aws-cdk-cicd-boot-sample](https://github.com/aws-samples/aws-cdk-cicd-boot-sample) and takes it a step further by providing additional tools and features to simplify and standardize the multi-stage CI/CD process for your Infrastructure as Code (IaC) projects.

## Features

- **Multi-staged CI/CD Pipeline**: Seamlessly deploy your CDK applications across multiple stages (e.g., DEV, INT, PROD) and AWS accounts.
- **Security Scanning**: Perform security scanning on dependencies and codebase, blocking the pipeline in case of CVE findings.
- **License Management**: Manage licenses for NPM and Python dependencies, ensuring compliance with your organization's policies.
- **Private NPM Registry**: Securely store and utilize private NPM libraries.
- **Customizable Pipeline**: Tailor the CI/CD pipeline to your project's specific needs with built-in dependency injection.
- **Workbench Deployment**: Develop and experiment with your solutions in isolation before introducing them to the delivery pipeline.
- **Pre/Post Deploy Hooks**: Execute custom scripts before and after deployments in each stage (e.g., unit tests, functional tests, load testing).
- **Centralized Compliance Logs**: Store compliance logs in pre-configured S3 buckets on a per-stage/environment basis.
- **Lambda Layer Support**: Build and scan dependencies for Python Lambda Layers.

## Getting Started

### Prerequisites

Before you begin, ensure that you have the following dependencies installed:

- AWS Account (RES/DEV/INT/PROD)
- macOS or Cloud9 with Ubuntu Server 22.04 LTS Platform in the RES Account
- Bash/ZSH terminal
- Docker version >= 24.0.x
- AWS CLI v2 ([installation guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html))
- AWS credentials and profiles for each environment in `~/.aws/config` ([configuration guide](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html))
- Node.js >= v18.17._ && NPM >= v10.2._
- jq command-line JSON processor (jq-1.7)

For developing Python Lambdas, you'll also need:

- Python >= 3.11
- Pipenv 2023.* ([installation guide](https://pipenv.pypa.io/en/latest/))

### Installation

1. Clone the CDK CI/CD Wrapper repository:

   ```bash
   git clone https://github.com/your-repo/cdk-cicd-wrapper.git
   cd cdk-cicd-wrapper
   ```

2. Install the required dependencies:

   ```bash
   npm install
   ```

## Usage

### Defining Stages

The CDK CI/CD Wrapper comes with a default set of stages (DEV, INT, PROD), but you can easily extend or modify these stages to suit your project's needs. Follow the step-by-step guide in the documentation to define your desired stages.

### Configuring Stacks

Configure the CDK stacks you want to deploy in each stage. The CDK CI/CD Wrapper allows you to specify which stacks should be deployed in each stage, giving you granular control over your deployment process.

### Customizing CI/CD Steps

Tailor the CI/CD pipeline to meet your project's specific requirements. The CDK CI/CD Wrapper provides built-in dependency injection, allowing you to customize the CI/CD steps seamlessly.

## Autopilot Deployment Contracts

| Area                          | Contract                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_STAGING`                 | Valid for direct/local `cdk deploy` (including local `cdk-cicd deploy --from-image`) and Repo 1 container-image synthesis. Wrapper-generated deployment pipelines—flat `CODEPIPELINE`, Repo 2, `CDK_PIPELINES`, and `GITHUB_ACTIONS`—reject it. On direct/local paths, custom deploy and CloudFormation execution roles govern application stacks; staging support resources use caller/base credentials. |
| Deploy-role `ExternalId`      | `CDK_PIPELINES` and `GITHUB_ACTIONS` reject configured deploy-role ExternalIds rather than silently dropping them. `APP_STAGING` accepts custom deployment identities but rejects a deploy-role ExternalId because the alpha API does not expose one.                                                                                                                               |
| CloudFormation execution role | CodeBuild assumes the deployment role; that assumed role passes the configured CloudFormation execution role to CloudFormation. Grant `iam:PassRole` to the deployment role, not directly to the CodeBuild project role.                                                                                                                                                      |
| Custom CodeBuild ECR image    | A private ECR environment image must be in the CodeBuild project's Region; flat CodePipeline and CDK Pipelines also require the pipeline account. Repo 2 supports its explicit cross-account image path only after the owner-side repository policy is configured and `crossAccountEcrRepositoryPolicyConfigured` is acknowledged; the build-image Region rule still applies. |
| GitHub manual approval        | Configure required reviewers on each generated GitHub Environment, then set `githubActions.environmentProtectionConfigured: true`. Referencing an environment in workflow YAML does not configure its protection rules.                                                                                                                                                       |

## Contributing

Contributions to the CDK CI/CD Wrapper are welcome! If you'd like to contribute, please follow the guidelines outlined in the [CONTRIBUTING.md](CONTRIBUTING.md) file.

## License

This project is licensed under the [Apache 2.0 License](LICENSE).
