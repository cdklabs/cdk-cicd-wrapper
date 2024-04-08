# Welcome to the CI/CD Wrapper

The CI/CD Wrapper enables your CDK applications to be deployed with 
This repository contain all the construct provided and used in the Vanilla Pipelin to build, test and deliver the packages through Private NPM Registries such as JFrog Artifactory or AWS CodeArtifact.

The documentation for the {{ project_name }} Core is stored under the docs/ (index file: index.md) and is designed to be viewed as an MkDocs html site. Before heading to the documentation we highly recommend you:

- Run the build docs script `./scripts/build-docs` using you UNIX cli
- Start the local mkdocs webserver to view locally the ConfigBuilder documentation site with the `mkdocs serve` command; the documentation will then be available at https://localhost:8000

## Intended usage

You should not fork this repository and expect to reproduce the same in your AWS Accounts, this repository is only used for preparing, testing and shipping all the packages used by the {{ project_name }}. Using the {{ project_name }} Core brings you the following benefits:

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

## Debugging

\_\_Fill_what_is_missing_by_explaining here the debugging of the packages after the installation

## Use cases

The {{ project_name }} Core is the next step on road to standardize and simplify the multi-stage CI/CD process that the successful {{ project_name }} started. Thus the use cases for the {{ project_name }} Core are the same as for the {{ project_name }}.

- Multi staged CI/CD pipeline for IaaC projects

On top of that the {{ project_name }} Core has arbitrary scripts that can be leveraged in any projects involving TypeScript, NPM, and/or Python.

- License validation
- License header management on source files


## License Notes
Although this repository is released under the Apache-2.0 license, its license validation functionality
use the third party `jackspeak` project. The `jackspeak` project's licensing includes the BlueOak-1.0.0 license.

Although this repository is released under the Apache-2.0 license, its license validation functionality
use the third party `path-scurry` project. The `path-scurry` project's licensing includes the BlueOak-1.0.0 license.