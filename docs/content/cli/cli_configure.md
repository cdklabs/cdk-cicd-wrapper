# Configure

> **Blueprint (0.x) only.** `configure` belongs to the Blueprint workflow. An Autopilot project describes its
> pipeline in `cicd.config.ts` instead; `npx {{npm_cli}} init` writes that file.

The `npx {{npm_cli}} configure` script asks a series of questions (it needs `jq`) and appends the answers to a `.env` file in the project root, which you can `source` into your active shell/terminal. When you answer that you are creating a new project, it also sets values in the `config` section of the `package.json` file and the bootstrap qualifier in `cdk.json`. The created `.env` can be modified or duplicated to assist developers moving between potentially different test environments.

## {{ project_name }} Variables

| Written to | Key | Description |
|---|---|---|
| `.env` | AWS_REGION | AWS region for deploying the CodePipeline and application stacks |
| `.env` | ACCOUNT_RES | account id for the resources (RES) account where the pipeline will run |
| `.env` | RES_ACCOUNT_AWS_PROFILE | the named profile to use for the RES account. This profile must exist in `~/.aws/credentials` or `~/.aws/config` |
| `.env` | ACCOUNT_DEV | account id for the DEV environment account, or `-` if you do not need DEV |
| `.env` | DEV_ACCOUNT_AWS_PROFILE | the named profile to use for the DEV account, or `-` if you do not need DEV |
| `.env` | ACCOUNT_INT | account id for the INT environment account, or `-` if you do not need INT |
| `.env` | INT_ACCOUNT_AWS_PROFILE | the named profile to use for the INT account, or `-` if you do not need INT |
| `.env` | PROXY_SECRET_ARN | the ARN of the proxy secret; empty if you do not need a proxy |
| `.env` | CODESTAR_CONNECTION_ARN | the CodeStar connection ARN; written only for a GitHub repository |
| `.env` | AWS_PROFILE | set to `${RES_ACCOUNT_AWS_PROFILE}`, the default named profile for aws cli or cdk commands when no `--profile` is provided |
| `package.json` `config` (new project) | applicationName | the name of the application |
| `package.json` `config` (new project) | cdkQualifier | the CDK bootstrap qualifier you enter; `hnb659fds` is the default bootstrap qualifier |
| `package.json` `config` (new project) | repositoryType | `GITHUB` or `CODECOMMIT` |
| `package.json` `config` (new project) | repositoryName | the GitHub repository in `owner/name` format, or the CodeCommit repository name |
| `package.json` `config` (new project) | cicdVpcType | `NO_VPC`, `VPC` (create a new VPC), or `VPC_FROM_LOOK_UP` (reuse an existing VPC) |
| `package.json` `config` (new project) | cicdVpcId | the ID of the existing VPC; written only for `VPC_FROM_LOOK_UP` |
| `cdk.json` (new project) | `context."@aws-cdk/core:bootstrapQualifier"` | the CDK bootstrap qualifier |
| `cdk.json` (new project) | toolkitStackName | `CDKToolkit-<qualifier>`; written only when the qualifier is not `hnb659fds` |
