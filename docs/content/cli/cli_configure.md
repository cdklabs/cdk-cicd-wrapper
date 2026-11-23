# Configure

> **Blueprint (0.x) only.** `configure` belongs to the Blueprint workflow. An Autopilot project describes its
> pipeline in `cicd.config.ts` instead; `npx {{npm_cli}} init` writes that file.

The `npx {{npm_cli}} configure` script uses a series of prompts and user input to build a bash script that can be used to `source` your environment variables into your active shell/terminal. Additionally, the configure script sets values in the config section of the `package.json` file. The created `.env` can be modified or duplicated to assist developers moving between potentially different test environments.

## {{ project_name }} Variables

| ENV Variable | Package.json config | Default Value | Description |
|---|---|---|---|
| AWS_REGION |   |   | deployment region |
| ACCOUNT_RES |   |   | account id for resources account where pipeline will run |
| ACCOUNT_DEV |   |   | account id for DEV environment account |
| ACCOUNT_INT |   |   | account id for INT environment account |
| RES_ACCOUNT_AWS_PROFILE |   |   | sets the named profile to use for the RES account. this profile must exist in `~/.aws/credentials` or `~/.aws/config` |
| DEV_ACCOUNT_AWS_PROFILE |   |   | sets the named profile to use for the DEV account. this profile must exist in `~/.aws/credentials` or `~/.aws/config` |
| INT_ACCOUNT_AWS_PROFILE |   |   | sets the named profile to use for the INT account. this profile must exist in `~/.aws/credentials` or `~/.aws/config` |
| AWS_PROFILE |   |   | sets the default named profile to use for aws cli or cdk commands when no `--profile` is provided. set to the same value as `RES_ACCOUNT_AWS_PROFILE` this profile must exist in `~/.aws/credentials` or `~/.aws/config` |
|             | applicationName | Wrapper | sets the name of the Application |
|               | cdkQualifier | wrapper | used to distinguish between multiple deployments of a VP project in the same account. Good practice to customize per deployment. |
|                | repositoryName |  | sets the name of the Git repository in the format org/name |
|  | repositoryType |  | sets the type of the repository, `GITHUB` or `CODECOMMIT` |
| CODESTAR_CONNECTION_ARN |  |  | sets the codestar connection required for GITHUB type |
|               | cicdVpcType | NO_VPC | sets the type of the VPC: `NO_VPC`, `VPC`, or `VPC_FROM_LOOK_UP`. |
|             | cicdVpcId |  | for use with `VPC_FROM_LOOK_UP` to set the vpc ID |
| PROXY_SECRET_ARN |  |  | used to set the ARN for the proxy secrets to enable proxy |
