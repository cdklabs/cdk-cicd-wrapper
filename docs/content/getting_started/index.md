# Getting Started

This topic introduces you to important {{ project_name }} concepts and describes how to install and configure the {{ project_name }}. When you are done you will have a fully functioning CI/CD pipeline for you AWS CDK project.

**Note**
This guide assumes you have good understanding of AWS CDK and are familiar with the AWS account bootstrapping for AWS CDK projects.

## Concepts

### RES account

RES account represents the AWS account which hosts the infrastructure for the CI/CD pipeline, such as the AWS CodePipeline and AWS CodeBuild.

## Prerequisites

The {{ project_name }} has few additional requirements on top of the AWS CDK requirements.

- :ballot_box_with_check: AWS accounts for the different stages, but you can use the {{ project_name }} with [single account](../developer_guides/single_account.md) as well.
- :ballot_box_with_check: AWS CLI [profiles](https://docs.aws.amazon.com/cli/latest/reference/configure/#:~:text=You%20can%20configure%20a%20named,when%20prompted%20for%20the%20value.) definitions for the AWS accounts
- :ballot_box_with_check: jq command line JSON processor jq-1.5
- :ballot_box_with_check: Docker version 24.0.x

** Prerequisites for Python Lambda development: **

- :ballot_box_with_check: Python >= 3.11
- :ballot_box_with_check: [Pipenv 2023.\*](https://pipenv.pypa.io/en/latest/)

** Version Control System **

The {{ project_name }} provisions an AWS CodeCommit Git repository for hosting the project source codes. It is possible to use your own [GitHub repository](../developer_guides/vcs_github.md).

More detailed information is available [here](./prerequisites.md)

### Install {{ project_name }}

Run the following command to install the {{ project_name }}

```bash
npm i {{ npm_codepipeline }}
```

**Note**
The **@harvesting-vp** scope might not be available from the public NPM registry and you will need to configure a [private NPM registry](../developer_guides/private_npm_registry.md).

### Setup local environment

This step is recommended as it allows you to reduce the configuration complexity of the {{ project_name }} through the VanillaPipelineBuilder.

Prepare your local environment with the help of the {{ project_name }} - [CLI Configure](../cli/cli_configure.md) tool. Start by running the `npx {{ npm_cli }}@latest configure` command and follow the instructions.

**Note**
After you modify the placeholders in the script, make it executable and source those variables:

```bash
chmod +x export_vars.sh
source export_vars.sh
```

**Note**
The CLI Configure script only supports the RES, DEV, INT, and PROD stages, but the [list of stages](../developer_guides/stages.md) can be extended.

**Note**
If you use a GitHub repository to host your project you will need to know your [AWS CodeStar Connection ARN](../developer_guides/vcs_github.md).

### Bootstrap your stages

The {{ project_name }} uses AWS CDK Toolkit with a cross-account trust relationship to deploy to multiple AWS accounts.
This bootstrapping must be established for each stage and each account must have a trust relationship with the RES account.

**Note**
The CDK_QUALIFIER environment variable has been created in the [previous step](#setup-local-environment). It is recommended to use different CDK_QUALIFIER for each CDK projects.

**Note**
In case you are reusing existing cdk bootstrapping, you can skip this step.

#### Prepare the RES stage

```bash
npm run cdk bootstrap -- --profile $RES_ACCOUNT_AWS_PROFILE --qualifier ${CDK_QUALIFIER} aws://${ACCOUNT_RES}/${AWS_REGION}
```

#### Prepare the DEV stage

```bash
npm run cdk bootstrap -- --profile $DEV_ACCOUNT_AWS_PROFILE  --qualifier ${CDK_QUALIFIER} --cloudformation-execution-policies \
arn:aws:iam::aws:policy/AdministratorAccess \
--trust ${ACCOUNT_RES} aws://${ACCOUNT_DEV}/${AWS_REGION}
```

#### Prepare the INT stage

```bash
npm run cdk bootstrap -- --profile $INT_ACCOUNT_AWS_PROFILE --qualifier ${CDK_QUALIFIER} --cloudformation-execution-policies \
arn:aws:iam::aws:policy/AdministratorAccess \
--trust ${ACCOUNT_RES} aws://${ACCOUNT_INT}/${AWS_REGION}
```

#### Prepare the PROD stage

\*The code below won't run by copy/paste, please update the variables accordingly.

```bash
npm run cdk bootstrap -- --profile prod --qualifier ${CDK_QUALIFIER} --cloudformation-execution-policies \
arn:aws:iam::aws:policy/AdministratorAccess \
--trust resources_account_id aws://prod_account_id/your_aws_region
```

### Create Compliance Bucket

Amazon S3 server access logging is a security best practice and should be always enabled. The compliance logs configuration gets applied to S3 buckets in the bin/aspects.ts for each stage RES/DEV/INT.

If you already have existing buckets for compliance logs then set their names through the [ComplianceBucketProvider](../developer_guides/global_resource.md#compliance-bucket-resource-provider).
Make sure that the destination bucket has a policy granting `s3:PutObject` permissions to the logging service principal `logging.s3.amazonaws.com` ([see documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/enable-server-access-logging.html)).

If you do not have buckets, then manually create them `compliance-log-${(ACCOUNT_RES|ACCOUNT_DEV|ACCOUNT_INT))}-${AWS_REGION}` and add the corresponding bucket
policies using the {{ project_name }} - [CLI Compliance Bucket](../cli/cli_compliance_bucket.md) commands below.

```bash
npx {{ npm_cli }}@latest compliance-bucket --profile $RES_ACCOUNT_AWS_PROFILE --account $ACCOUNT_RES --region $AWS_REGION

npx {{ npm_cli }}@latest compliance-bucket --profile $DEV_ACCOUNT_AWS_PROFILE --account $ACCOUNT_DEV --region $AWS_REGION

npx {{ npm_cli }}@latest compliance-bucket --profile $INT_ACCOUNT_AWS_PROFILE --account $ACCOUNT_INT --region $AWS_REGION
```

### Configure .gitignore

Ensure that the following lines are in your `.gitignore` file

- .npmrc # in case you are using private NPM repository
- export_vars.sh

## Setup the {{ project_name }}

As the very first step you will need to setup the VanillaPipeline in your exisitng CDK project.
This can be done with the `VanillaPipelineBlueprint` which provides a builder method that helps to do that.

Create a new VanillaPipelineBuilder in your entry file where the `cdk.App()` is created. That is usually located in the `bin/<your-main-file>.ts` (where your-main-file by default is the name of the root project directory). Open your `bin/<your-main-file>.ts` file and include the `VanillaPipelineBlueprint.builder()
.build(app)` statement, like so:

```typescript
import * as cdk from 'aws-cdk-lib';
import * as vp from '{{ npm_codepipeline }}';

const app = new cdk.App();

vp.VanillaPipelineBlueprint.builder().synth(app);
```

Then you will be able to deploy the {{ project_name }} with its default configuration and without deploying any stacks into the staging accounts.
But before we include any Stacks, let's deploy and see what is available out of the box.

**Note**
The basic CI setup expects that the `npm run validate`, `npm run lint`, `npm run test`, and `npm run audit` commands are available and executable.
You can use the following definitions in case you are missing them or you want to use the {{ project_name }} - [CLI Commands](../cli/index.md) tool for one or more actions.

```json
{
  ...
  "scripts": {
    "validate": "npx {{ npm_cli }} validate",
    "validate:fix": "npx {{ npm_cli }} validate --fix",
    "audit": "npx concurrently 'npm:audit:*(!fix)'",
    "audit:deps:nodejs": "npx {{ npm_cli }} check-dependencies --npm",
    "audit:deps:python": "npx {{ npm_cli }} check-dependencies --python",
    "audit:scan:security": "npx {{ npm_cli }} security-scan --bandit --semgrep --shellcheck --ci",
    "audit:license": "npm run license",
    "audit:fix:license": "npm run license:fix",
    "license": "npx {{ npm_cli }} license",
    "license:fix": "npx {{ npm_cli }} license --fix",
    "lint": "npx eslint . --ext .ts --max-warnings 0",
    "lint:fix": "npx eslint . --ext .ts --fix",
    "test": "jest"
    ...
  }
  ...
}
```

**Note**
When you are using `eslint` for linting ensure the configuration files is present or generate it with `npm init @eslint/config`.

**Note**
Before deploying run ```npm run validate:fix``` and ```audit:fix:license``` if you haven't done so before.
```npm run validate:fix``` will create the required package-verification.json file for you.
```audit:fix:license``` will generate a valid Notice file for you.

### Deploy all the stacks

```bash
npm run cdk deploy -- --all --region ${AWS_REGION} --profile $RES_ACCOUNT_AWS_PROFILE --qualifier ${CDK_QUALIFIER}
```

Once the command finishes there will be the following CDK Stacks deployed into your RES Account:

- PipelineRepository -> Responsible for either:
  - creating the CodeCommit repository (if you have it selected in config/AppConfig.ts) and the PullRequest automation behind CodeCommit to support scanning with CodeGuru and also running a set of configured commands same as the pipeline does in the Build phase.
  - establishing the CodeStar connection between your AWS RES Account and the configured Github repository.
- SSMParameterStack -> Responsible for creating the parameters in the SSM Parameter Store, e.g: Account IDs.
- VPCStack -> Responsible for enabling the running of the build stages of the pipeline in a VPC, with or without a proxy. By default this stack is not going to be created unless configured via `npx {{ npm_cli }} configure`. Check [here](../developer_guides/networking.md) for more information on the possible configurations.
- EncryptionStack -> Responsible for creating the KMS Key used to encrypt all the created CW Log Groups.
- PipelineStack -> Responsible for creating the CodeCommit Repository and the CodePipelineStack with all the CodeBuild Steps

## Configuring Continuous Integration

The {{ project_name }} comes with a set of predefined steps for checking the correctness of the source code.
These steps are:

1. npm run validate - Validates that the package-lock.json has not been changed or corrupted
2. npm run audit - Validates the 3rd party dependencies are free from any known CVEs
3. npm ci - Downloads the NPM dependencies
4. npm run lint - Checks source code linting
5. npm run build - Builds the source code
6. npm run test - Run the included tests
7. cdk synth - Synthesizes the the CDK projects and runs the CDK NAG

If all of the steps are finished successfully then the CI part is considered done.

**Note**
The previously described steps can be [modified and extended](../developer_guides/ci.md).

**Note**
Any of the `npm run` steps can be disabled if the corresponding scripts definition is changed to `true`. Use this approach only as last effort

**Note**
There are few [more steps](../developer_guides/ci.md) which are executed before the `npm run validation` for configuring NPM registries and HTTP proxies.

**Note**
The same steps are executed as part of the AWS CodeCommit's PullRequest review process.

## Include the Stacks into the CI/CD

Open your `bin/<your-main-file>.ts` file and include a stack into the Delivery Pipeline. Here we are using in two of our example stacks.

```typescript
import * as cdk from 'aws-cdk-lib';
import * as vp from "{{ npm_codepipeline }}";

const app = new cdk.App();

vp.VanillaPipelineBlueprint.builder().addStack({
  provide: (context) => {
    // create your stack here
    new vp.LambdaStack(context.scope, `${context.blueprintProps.applicationName}LambdaStack`, {
        applicationName: context.blueprintProps.applicationName,
        stageName: context.stage,
    });
    new vp.S3BucketStack(context.scope, `${context.blueprintProps.applicationName}S3Stack`, {
        bucketName: 'test-bucket',
        stageName: context.stage,
        applicationQualifier: context.blueprintProps.applicationQualifier,
        encryptionKey: context.get<vp.IEncryptionKey>(vp.GlobalResources.Encryption)!.kmsKey,
    });
}}).synth(app);
```

Pay attention to the followings details:

- You can include one or multiple stacks at a same time
- Your stack's scope must be the one that comes from the `context` -> `context.scope` or any other stack you defined in the same addStack block
- You can access GlobalResources through the context `context.get<IEncryptionKey>(vp.GlobalResources.Encryption)!.kmsKey`, you can read about the [GlobalResources](../developer_guides/global-resource)
- You can access the parameters of the blueprint `context.blueprintProps`
- You want to prefix your resources either of the `stage`, `applicationName`, or `applicationQualifier`

You can learn more about VanillaPipelineBlueprint in the [Developer Guide](../developer_guides/index.md)

## Deploy changes with GitOps

As the required infrastructure has been deployed with the [previous step](#deploy-all-the-stacks), you can apply the GitOps practice to deploy the changes.

### [CODECOMMIT] Push the local repository to remote

In case you are using CodeCommit then you need to configure the downstream of the repository for deployment. In your local machine you need to install the `git-remote-codecommit` using the following command:

```bash
sudo pip3 install git-remote-codecommit
```

```bash
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD);
git remote add origin codecommit::${AWS_REGION}://${RES_ACCOUNT_AWS_PROFILE}@${GIT_REPOSITORY};
git commit -am "feat: init origin";
git push -u origin ${CURRENT_BRANCH}:main ### default branch for {{ project_name }} can be [configured](../developer_guides/ci.md)
```

### [GITHUB] Push the local repository to remote

In case you are using GitHub then you only need to add the

```bash
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD);
git remote add origin git@github:${GIT_REPOSITORY}.git;
git commit -am "feat: init origin";
git push -u origin ${CURRENT_BRANCH}:main ### default branch for {{ project_name }} can be [configured](../developer_guides/ci.md)
```

**Note**
The `origin` remote alias might be already configured, in this case you need to change or replace it.
