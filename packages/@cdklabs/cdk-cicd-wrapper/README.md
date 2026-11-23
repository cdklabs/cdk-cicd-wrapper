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

- CodeBuild in a VPC, in a private VPC with a NAT gateway, or behind an HTTP proxy.
- Dependency and code security scanning (npm audit, pip-audit, Bandit, Semgrep, ShellCheck) and open-source
  license checks over npm and Python dependencies.
- A private npm registry or CodeArtifact for your own packages.
- Default-on security hardening (cdk-nag and hardening aspects) applied to every stack.
- TypeScript and Python CDK apps.

## Getting Started

### Prerequisites

Before you begin, ensure that you have the following dependencies installed:

- AWS Account (RES/DEV/INT/PROD)
- macOS or Cloud9 with Ubuntu Server 22.04 LTS Platform in the RES Account
- Bash/ZSH terminal
- Docker version >= 24.0.x
- AWS CLI v2 ([installation guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html))
- AWS credentials and profiles for each environment in `~/.aws/config` ([configuration guide](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html))
- Node.js >= 20.19.0
- jq command-line JSON processor (jq-1.7)

For developing Python Lambdas, you'll also need:

- Python >= 3.11
- Pipenv 2023.* ([installation guide](https://pipenv.pypa.io/en/latest/))

### Installation

In your CDK app, install the library and the CLI, then let `init` write `cicd.config.ts` and point `cdk.json` at
`cdk-cicd exec`:

```bash
npm i @cdklabs/cdk-cicd-wrapper @cdklabs/cdk-cicd-wrapper-cli
npx cdk-cicd init
```

The [Getting Started guide](https://cdklabs.github.io/cdk-cicd-wrapper/getting_started/index.html) covers the
next steps: bootstrapping, `cdk-cicd deploy-ci` and the first push.

## Usage

### Defining Stages

List the stages in `cicd.config.ts`, in deployment order: `stages: ['dev', 'prod']`. `dev` and `res` deploy without approval; every other stage waits for a manual approval by default. A stage can also name its own account and Regions: `{ name: 'prod', env: { account: '111111111111', region: 'eu-west-1' } }`.

### Configuring Stacks

Configure the CDK stacks you want to deploy in each stage. The CDK CI/CD Wrapper allows you to specify which stacks should be deployed in each stage, giving you granular control over your deployment process.

### Customizing CI/CD Steps

With no `ci.steps`, the Build runs `npm ci`, then your project's `npm run audit`, `build` and `test`, each only when the script exists. Set `ci.steps` in `cicd.config.ts` to replace those commands; the synth step is always added. See the [CI guide](https://cdklabs.github.io/cdk-cicd-wrapper/developer_guides/ci.html).

## Autopilot Deployment Contracts

| Area                          | Contract                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_STAGING`                 | Valid for direct/local `cdk deploy` (including local `cdk-cicd deploy --from-image`) and Repo 1 container-image synthesis. Wrapper-generated deployment pipelines—flat `CODEPIPELINE`, Repo 2, `CDK_PIPELINES`, and `GITHUB_ACTIONS`—reject it. On direct/local paths, custom deploy and CloudFormation execution roles govern application stacks; staging support resources use caller/base credentials. |
| Deploy-role `ExternalId`      | `CDK_PIPELINES` and `GITHUB_ACTIONS` reject configured deploy-role ExternalIds rather than silently dropping them. `APP_STAGING` accepts custom deployment identities but rejects a deploy-role ExternalId because the alpha API does not expose one.                                                                                                                               |
| CloudFormation execution role | CodeBuild assumes the deployment role; that assumed role passes the configured CloudFormation execution role to CloudFormation. Grant `iam:PassRole` to the deployment role, not directly to the CodeBuild project role.                                                                                                                                                      |
| Custom CodeBuild ECR image    | A private ECR environment image must be in the CodeBuild project's Region; flat CodePipeline and CDK Pipelines also require the pipeline account. Repo 2 supports its explicit cross-account image path only after the owner-side repository policy is configured and `crossAccountEcrRepositoryPolicyConfigured` is acknowledged; the build-image Region rule still applies. |
| GitHub manual approval        | Configure required reviewers on each generated GitHub Environment, then set `githubActions.environmentProtectionConfigured: true`. Referencing an environment in workflow YAML does not configure its protection rules.                                                                                                                                                       |

## Contributing

Contributions to the CDK CI/CD Wrapper are welcome! If you'd like to contribute, please follow the guidelines outlined in the [CONTRIBUTING.md](https://github.com/cdklabs/cdk-cicd-wrapper/blob/main/CONTRIBUTING.md) file.

## License

This project is licensed under the [Apache 2.0 License](LICENSE).
