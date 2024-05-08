## CDK CI/CD Wrapper

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

The CDK CI/CD Wrapper is a comprehensive solution that streamlines the delivery of your AWS Cloud Development Kit (CDK) applications. It provides a robust and standardized multi-stage CI/CD pipeline, ensuring high quality and confidence throughout the development and deployment process.

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
- jq command-line JSON processor (jq-1.5)

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

The CDK CI/CD Wrapper provides two main features: a CI/CD pipeline and a workbench deployment.

### CI/CD Pipeline

The CI/CD pipeline automates the build, testing, and deployment of your CDK applications across multiple stages and AWS accounts. To use the pipeline, follow these steps:

1. Configure the pipeline according to your project requirements.
2. Commit and push your changes to the repository.
3. The pipeline will automatically trigger and deploy your application through the configured stages.

### Workbench Deployment

The workbench deployment feature allows you to develop and experiment with your solutions in an isolated environment before introducing them to the delivery pipeline. This is particularly useful for testing and validating changes before deploying them to production. To use the workbench deployment, follow these steps:

1. Configure the workbench deployment settings.
2. Run the workbench deployment script.
3. Develop and test your changes in the workbench environment.
4. Once satisfied, merge your changes into the main branch to trigger the CI/CD pipeline.

### Defining Stages

The CDK CI/CD Wrapper comes with a default set of stages (DEV, INT, PROD), but you can easily extend or modify these stages to suit your project's needs. Follow the step-by-step guide in the documentation to define your desired stages.

### Configuring Stacks

Configure the CDK stacks you want to deploy in each stage. The CDK CI/CD Wrapper allows you to specify which stacks should be deployed in each stage, giving you granular control over your deployment process.

### Customizing CI/CD Steps

Tailor the CI/CD pipeline to meet your project's specific requirements. The CDK CI/CD Wrapper provides built-in dependency injection, allowing you to customize the CI/CD steps seamlessly.

## Contributing

Contributions to the CDK CI/CD Wrapper are welcome! If you'd like to contribute, please follow the guidelines outlined in the [CONTRIBUTING.md](CONTRIBUTING.md) file.

## Security

If you discover a potential security issue in this project, please follow the guidelines outlined in the [CONTRIBUTING.md](CONTRIBUTING.md#security-issue-notifications) file.

## License

This project is licensed under the [Apache 2.0 License](LICENSE).