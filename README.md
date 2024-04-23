# Welcome to the CI/CD Wrapper

The CI/CD Wrapper gives you an easy way to deliver your CDK applications like a PRO.
This repository contains all the tools to build, deliver and test any CDK Applications through multiple stages, and AWS accounts to have high level of quality and confidence.

The documentation for the CDK CI/CD Wrapper Core is stored under the docs/ (index file: index.md) and is designed to be viewed as an MkDocs html site. Before heading to the documentation we highly recommend you:

- Run the build docs script `./scripts/build-docs` using you UNIX cli
- Start the local mkdocs webserver to view locally the ConfigBuilder documentation site with the `mkdocs serve` command; the documentation will then be available at https://localhost:8000

## Use cases

The CDK CI/CD Wrapper is the next step on road to standardize and simplify the multi-stage CI/CD process that the successful [aws-cdk-cicd-boot-sample](https://github.com/aws-samples/aws-cdk-cicd-boot-sample) started. Thus the use cases for the CDK CI/CD Wrapper are the same as for the [aws-cdk-cicd-boot-sample](https://github.com/aws-samples/aws-cdk-cicd-boot-sample).

- Multi staged CI/CD pipeline for IaaC projects

On top of that the CDK CI/CD Wrapper has arbitrary scripts that can be leveraged in any projects involving TypeScript, NPM, and/or Python.

- CI/CD execution by AWS Code Pipeline in VPC, Private VPC with NAT Gateway, or even through an HTTP Proxy
- Security scanning on dependencies and on your project code base as well
- License management over NPM and Python dependencies 
- Support for private NPM registry to interact with your libraries
- Customizable CI/CD pipeline to form the process to your needs with built-in dependency injection

## Intended usage

You should not fork this repository and expect to reproduce the same in your AWS Accounts, this repository is only used for preparing, testing and shipping all the packages used by the CDK CI/CD Wrapper. Using the CDK CI/CD Wrapper Core brings you the following benefits:

- :white_check_mark: Automated Open Source License checking (we have provided a list of licenses which you don't want to have them present in your PRODUCTION workloads)
- :white_check_mark: Pre/Post deploy hooks during the deployment in each of the stages (DEV/INT/PROD)
  - :white_check_mark: PRE -> Unit Tests
  - :white_check_mark: POST -> Functional Tests, Load Testing
- :white_check_mark: Flexible definition of stages, the default (DEV/INT/PROD) stages can be extended with new custom stages like EXP.
- :white_check_mark: Stacks deployment can be specified for each stages separately
- :white_check_mark: Customizable CI steps to meet project requirements
- :white_check_mark: Centrally store compliance logs in S3 Buckets which are pre-configured on a per-stage/environment basis
- :white_check_mark: Build Lambda Layers for Python and scan dependencies in the CI/CD (in case of CVE findings, block the pipeline)

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This project is licensed under the Apache-2.0 License.

## Requirements

You need to have the following dependencies in place:

- AWS Account (RES/DEV/INT/PROD)
- Mac OS / Cloud9 with Ubuntu Server 22.04 LTS Platform in RES Account
- Bash/ZSH terminal
- Docker version 24.0.x
- aws-cli v2 [here](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- AWS credentials and profiles for each environment under ~/.aws/config [here](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html)
- Node v18.17._ && NPM v10.2._
- jq command line JSON processor jq-1.5

For developing Python Lambdas you need to have the following dependencies additionally:

- Python >= 3.11
- Pipenv 2023.\* [here](https://pipenv.pypa.io/en/latest/)
