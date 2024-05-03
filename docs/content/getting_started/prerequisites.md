# Prerequisites

This documentation provides a step-by-step guide for setting up the necessary prerequisites to work with AWS Lambda functions and CDK (Cloud Development Kit) pipelines. Before proceeding, ensure you have the following dependencies installed and configured correctly.

## AWS Account

- You need to have access to an AWS account for the respective environments (RES/DEV/INT/PROD).

## Operating System

- The setup can be performed on macOS, Linux, or Windows. If you're using Windows, it's recommended to use the Linux Subsystem for Windows (WSL) or a Cloud9 environment with Ubuntu Server 22.04 LTS Platform in your RES account.

## Terminal

- You need to have a terminal emulator installed, such as Bash or ZSH.

## Docker

- Install Docker version 24.0.x or later.

## AWS CLI

- Install the AWS Command Line Interface (AWS CLI) version 2 by following the instructions [here](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html).

## AWS Credentials and Profiles

- Configure your AWS credentials and profiles for each environment (RES/DEV/INT/PROD) by following the instructions [here](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html). The credentials should be stored in the `~/.aws/config` file.

## Node.js and NPM

- Install Node.js version 18.17.* and NPM version 10.2.*.

## jq Command-line JSON Processor

- Install the `jq` command-line JSON processor by following the instructions for your operating system [here](https://stedolan.github.io/jq/download/).

## Additional Dependencies for Python Lambda Functions

If you're developing Python Lambda functions, you'll need the following additional dependencies:

- Install Python version 3.11 or later.
- Install Pipenv version 2023.* or later by following the instructions [here](https://pipenv.pypa.io/en/latest/).
