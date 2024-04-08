# Configuration Variables

Vanilla Pipeline uses a configuration script, `scripts/configure.sh` to set up the configuration of the Vanilla Pipeline project. In addition to generating a script which can be sourced to your environment shell, this script also modifies  `package.json` with certain configuration values.

## Vanilla Pipeline Variables

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
|             | applicationName | VanillaPipeline | sets the name of the Application |
| CDK_QUALIFIER | cdkQualifier | vanillap | used to distinguish between multiple deployments of a VP project in the same account. Good practice to customize per deployment. |
| GIT_REPOSITORY | repositoryName |  | sets the name of the Git repository in the format org/name |
|  | repositoryType |  | sets the type of the repository, `GITHUB` or `CODECOMMIT` |
| CODESTAR_CONNECTION_ARN |  |  | sets the codestar connection required for GITHUB type |
| CICD_VPC_TYPE | cicdVpcType | NO_VPC | sets the type of the VPC: `NO_VPC`, `VPC`, or `VPC_FROM_LOOK_UP`. |
| CICD_VPC_ID | cicdVpcId |  | for use with `VPC_FROM_LOOK_UP` to set the vpc ID |
| CICD_VPC_CIDR | cicdVpcCidr | 172.31.0.0/20 | for use with `VPC` to set the CIDR block of the VPC |
| CICD_VPC_CIDR_MASK | cicdVpcCidrMask | 24 | for use with `VPC` to set the Subnet size |
| PROXY_SECRET_ARN |  |  | used to set the ARN for the proxy secrets to enable proxy |
