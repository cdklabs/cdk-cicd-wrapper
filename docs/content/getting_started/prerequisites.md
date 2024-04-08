# Prerequisites

You need to have the following dependencies in place:

- AWS Account (RES/DEV/INT/PROD)
- Mac OS / Linux / Windows use Linux on WSL / Cloud9 with Ubuntu Server 22.04 LTS Platform in RES Account
- Bash/ZSH terminal
- Docker version 24.0.x
- aws-cli v2 [here](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- AWS credentials and profiles for each environment under ~/.aws/config [here](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html)
- Node v18.17.* && NPM v10.2.*
- jq command line JSON processor jq-1.5

For developing Python Lambdas you need to have the following dependencies additionally:
- Python >= 3.11
- Pipenv 2023.* [here](https://pipenv.pypa.io/en/latest/)