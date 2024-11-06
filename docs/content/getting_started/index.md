# Getting Started with the {{ project_name }}

This guide gives you clear steps to set up and customize a Continuous Integration and Continuous Delivery (CI/CD) pipeline for your AWS CDK project. Following these steps will automate the build, testing, and delivery of your AWS CDK project, giving you a smooth workflow.

## Overview

The CI/CD pipeline simplifies your development process, making sure your project undergoes thorough testing and validation before moving to different stages like development, integration, or production. It utilizes AWS services like AWS CodePipeline, AWS CodeBuild, and AWS CodeCommit/GitHub to manage the entire workflow seamlessly.

## Prerequisites

Before you begin, ensure that you have the following prerequisites in place:

1. **AWS Accounts**: You will need access to multiple AWS accounts for different deployment stages (e.g., development, integration, production). If you prefer, you can also use a single account setup.
2. **AWS CLI Profiles**: Configure AWS CLI profiles with appropriate permissions for each AWS account you plan to use.
3. **jq Command Line JSON Processor**: Install the `jq` command-line JSON processor (version 1.5 or later).
4. **Docker**: Install Docker (version 24.0.x or later).
5. **Python and Pipenv**: If you plan to develop Python Lambda functions, ensure that you have Python (version 3.11 or later) and Pipenv (version 2023 or later) installed.
6. **Version Control System (VCS)**: The CI/CD pipeline provisions an AWS CodeCommit Git repository by default for hosting your project's source code. However, you can also choose to use your own GitHub repository.

For more detailed information on prerequisites, refer to the [Prerequisites](./prerequisites.md) documentation.

Below we explain how to integrate the {{ project_name }} into:
- [New CDK Project](#new-cdk-project)
- [Existing CDK Project](#existing-cdk-project)

### New CDK project

You can apply the {{ project_name }} to any of your existing CDK projects enable the CI/CD around your solution. If you don't have an existing CDK project then you can create one as shown in this guide step-by-step:

```bash
mkdir my-project
cd my-project
npx aws-cdk@latest init app --language typescript
```

## Installation

1. Install the {{ project_name }} pipeline package by running the following command:

   ```bash
   npm i {{ npm_codepipeline }} {{ npm_cli }}
   ```

   **Note**: If the `@cdklabs` scope is not available from the public NPM registry, you will need to configure a [private NPM registry](../developer_guides/private_npm_registry.md).

## Setup Local Environment

We suggest using the provided CLI tool to set up your local environment, as it simplifies the configuration process for the CI/CD pipeline. Simply follow these steps:

1. Run the `npx {{ npm_cli }}@latest configure` command and follow the instructions.

2. After modifying the placeholders in the script,  source the variables:

   ```bash
   source .env
   ```

   **Note**: The CLI Configure script supports the RES, DEV, INT, and PROD stages by default, but you can extend the list of stages as needed. If you plan to use a GitHub repository to host your project, you will need to know your [AWS CodeStar Connection ARN](../developer_guides/vcs_github.md).

## Bootstrap your stages

The {{ project_name }} uses the AWS CDK Toolkit with a cross-account trust relationship to deploy to multiple AWS accounts. This bootstrapping process must be established for each stage, and each account must have a trust relationship with the RES account..

If you are reusing an existing CDK bootstrapping setup, you can skip this step. Otherwise, follow the instructions below to bootstrap your stages:

1. **Prepare the RES stage**:

   ```bash
   CDK_QUALIFIER=$(jq -r '.config.cdkQualifier' package.json)
   npx dotenv-cli -- npm run cdk bootstrap -- --profile $RES_ACCOUNT_AWS_PROFILE --qualifier ${CDK_QUALIFIER} aws://${ACCOUNT_RES}/${AWS_REGION}
   ```

2. **Prepare the DEV stage**:

   ```bash
   CDK_QUALIFIER=$(jq -r '.config.cdkQualifier' package.json)
   npx dotenv-cli -- npm run cdk bootstrap -- --profile $DEV_ACCOUNT_AWS_PROFILE  --qualifier ${CDK_QUALIFIER} --cloudformation-execution-policies \
   arn:aws:iam::aws:policy/AdministratorAccess \
   --trust ${ACCOUNT_RES} aws://${ACCOUNT_DEV}/${AWS_REGION}
   ```

3. **Prepare the INT stage**:

   ```bash
   CDK_QUALIFIER=$(jq -r '.config.cdkQualifier' package.json)
   npx dotenv-cli -- npm run cdk bootstrap -- --profile $INT_ACCOUNT_AWS_PROFILE --qualifier ${CDK_QUALIFIER} --cloudformation-execution-policies \
   arn:aws:iam::aws:policy/AdministratorAccess \
   --trust ${ACCOUNT_RES} aws://${ACCOUNT_INT}/${AWS_REGION}
   ```

4. **Prepare the PROD stage**:

   ```bash
   CDK_QUALIFIER=$(jq -r '.config.cdkQualifier' package.json)
   npx dotenv-cli -- npm run cdk bootstrap -- --profile $PROD_ACCOUNT_AWS_PROFILE --qualifier ${CDK_QUALIFIER} --cloudformation-execution-policies \
   arn:aws:iam::aws:policy/AdministratorAccess \
   --trust ${ACCOUNT_RES} aws://${ACCOUNT_PROD}/${AWS_REGION}
   ```

   **Note**: Update the variables in the command with your actual account IDs and AWS region. To activate `PROD`, you must explicitly include it in the `.defineStages([Stage.DEV, Stage.INT, Stage.PROD])` as outlined in step 2 below. Always specify all the stages you require; do not add only `Stage.PROD` and assume the other stages will be included automatically. For more info on how to add custom stages please refer to [here](../developer_guides/cd.md#how-to-define-custom-stages)

## Configure .gitignore

Ensure that the following lines are in your `.gitignore` file:

- `.npmrc` (if you are using a private NPM repository)
- `.env`

## Existing CDK project

To set up the CI/CD pipeline in your existing AWS CDK project, follow these steps:

0. Install the {{ project_name }} pipeline package by running the following command:

   ```bash
   npm i {{ npm_codepipeline }} {{ npm_cli }}
   ```

   **Note**: If the `@cdklabs` scope is not available from the public NPM registry, you will need to configure a [private NPM registry](../developer_guides/private_npm_registry.md).

1. Open your entry file, typically located at `bin/<your-main-file>.ts` (where `your-main-file` is the name of your root project directory).

2. Include the `PipelineBlueprint.builder().synth(app)` statement in your entry file, like so:

   ```typescript
   import * as cdk from 'aws-cdk-lib';
   import { PipelineBlueprint, Stage } from '{{ npm_codepipeline }}';

   const app = new cdk.App();

   /**
    * To enable the `Stage.PROD` stage in your pipeline you have to explicitly add it into the `.defineStages()` hook as below.
    * In our case we have DEV, INT and PROD so we add all of them explicitly as we assume you have them all in your project.
    * Attention: Any stage not included in the defineStages() function will be excluded from the pipeline.
    * This is done for safety reasons, to not export accidentally `PROD` env vars and have it deployed into the wrong account.
    */
   PipelineBlueprint.builder().defineStages([Stage.DEV, Stage.INT, Stage.PROD]).synth(app);
   ```

   This will deploy the CI/CD pipeline with its default configuration without deploying any stacks into the staging accounts.

3. **Optional**: If you want to include additional stacks in the CI/CD pipeline, modify your entry file as follows:

   ```typescript
   import * as cdk from 'aws-cdk-lib';
   import { PipelineBlueprint, Stage, GlobalResources } from '@cdklabs/cdk-cicd-wrapper';

   const app = new cdk.App();

   PipelineBlueprint.builder().defineStages([Stage.DEV, Stage.INT, Stage.PROD]).addStack({
   provide: (context) => {
      // Create your stacks here
      new YourStack(context.scope, `${context.blueprintProps.applicationName}YourStack`, {
         applicationName: context.blueprintProps.applicationName,
         stageName: context.stage,
      });
      new YourOtherStack(context.scope, `${context.blueprintProps.applicationName}YourOtherStack`, {
         applicationQualifier: context.blueprintProps.applicationQualifier,
         encryptionKey: context.get(GlobalResources.ENCRYPTION)!.kmsKey,
      });
   }}).synth(app);
   ```

   **Note**: Refer to the [Developer Guide](../developer_guides/index.md) for more information on the `PipelineBlueprint`.

  4. The {{ project_name }} expects to have the `validate`, `lint`, `test`, `audit` scripts defined. If you are missing any of the `npm run` scripts (e.g., ), or want to use the provided CLI tool for one or more actions, you should add the following definitions to your `package.json` file:

  4. 0. Adding cdk script (necessay when you run the `npm run cdk` and uses the local cdk version rather than the global one)
  ```bash
   jq --arg key "cdk" --arg val "npx aws-cdk@2.162.1" '.scripts[$key] = $val' package.json | jq . > package.json.tmp; mv package.json.tmp package.json;
  ```
  4. 1. Adding validate script
   ```bash
   jq --arg key "validate" --arg val "cdk-cicd validate" '.scripts[$key] = $val' package.json | jq . > package.json.tmp; mv package.json.tmp package.json;
   jq --arg key "validate:fix" --arg val "cdk-cicd validate --fix" '.scripts[$key] = $val' package.json | jq . > package.json.tmp; mv package.json.tmp package.json;
   ```
  4. 2. Adding lint script, we recommend using eslint and you can initalise it
   ```bash
   npm init @eslint/config

   jq --arg key "lint" --arg val "eslint . --ext .ts --max-warnings 0" '.scripts[$key] = $val' package.json | jq . > package.json.tmp; mv package.json.tmp package.json;
   jq --arg key "lint:fix" --arg val "eslint . --ext .ts --fix" '.scripts[$key] = $val' package.json | jq . > package.json.tmp; mv package.json.tmp package.json;
   ```

   4. 3. Adding audit scripts
   ```typescript
   npm install --save -D concurrently
   jq --arg key "audit" --arg val "concurrently 'npm:audit:*(\!fix)'" '.scripts[$key] = $val' package.json | jq . > package.json.tmp; mv package.json.tmp package.json;
   jq --arg key "audit:deps:nodejs" --arg val "cdk-cicd check-dependencies --npm" '.scripts[$key] = $val' package.json | jq . > package.json.tmp; mv package.json.tmp package.json;
   jq --arg key "audit:deps:python" --arg val "cdk-cicd check-dependencies --python" '.scripts[$key] = $val' package.json | jq . > package.json.tmp; mv package.json.tmp package.json;
   jq --arg key "audit:deps:security" --arg val "cdk-cicd security-scan --bandit --semgrep --shellcheck" '.scripts[$key] = $val' package.json | jq . > package.json.tmp; mv package.json.tmp package.json;
   jq --arg key "audit:license" --arg val "npm run license" '.scripts[$key] = $val' package.json | jq . > package.json.tmp; mv package.json.tmp package.json;
   jq --arg key "audit:fix:license" --arg val "npm run license:fix" '.scripts[$key] = $val' package.json | jq . > package.json.tmp; mv package.json.tmp package.json;
   jq --arg key "license" --arg val "cdk-cicd license" '.scripts[$key] = $val' package.json | jq . > package.json.tmp; mv package.json.tmp package.json;
   jq --arg key "license:fix" --arg val "cdk-cicd license --fix" '.scripts[$key] = $val' package.json | jq . > package.json.tmp; mv package.json.tmp package.json;
   ```

   ```json
   {
     ...
     "scripts": {
       "audit:deps:nodejs": "cdk-cicd check-dependencies --npm",
       "audit:deps:python": "cdk-cicd check-dependencies --python",
       "audit:fix:license": "npm run license:fix",
       "audit:license": "npm run license",
       "audit:scan:security": "cdk-cicd security-scan --bandit --semgrep --shellcheck --ci",
       "audit": "npx concurrently 'npm:audit:*(!fix)'",
       "cdk": "npx aws-cdk@2.162.1",
       "license:fix": "cdk-cicd license --fix",
       "license": "cdk-cicd license",
       "lint:fix": "eslint . --ext .ts --fix",
       "lint": "eslint . --ext .ts --max-warnings 0",
       "test": "jest",
       "validate:fix": "cdk-cicd validate --fix",
       "validate": "cdk-cicd validate",
       ...
     }
     ...
   }
   ```

   **Note**: If you are using `eslint` for linting, ensure that the configuration files are present or generate them with `npm init @eslint/config`.

5. Before deploying, run the following commands to ensure your project is ready:

   ```
   npm run validate:fix
   npm run audit:fix:license
   ```

   - `npm run validate:fix` will create the required `package-verification.json` file for you.
   - `npm run audit:fix:license` will generate a valid Notice file for you.

6. Deploy all the stacks by running the following command:

   ```bash
   npx dotenv-cli -- npm run cdk deploy -- --all --region ${AWS_REGION} --profile $RES_ACCOUNT_AWS_PROFILE --qualifier ${CDK_QUALIFIER}
   ```

   Once the command finishes, the following CDK Stacks will be deployed into your RES Account:

   - **PipelineRepository**: Responsible for either creating the CodeCommit repository  and setting up PullRequest automation for CodeGuru scanning and running a set of configured commands, or establishing the CodeStar connection between your AWS RES Account and the configured GitHub repository.
   - **SSMParameterStack**: Responsible for creating parameters in the SSM Parameter Store, such as Account IDs.
   - **VPCStack**: Responsible for enabling the running of the build stages of the pipeline in a VPC, with or without a proxy. By default, this stack is not created unless configured via `npx {{ npm_cli }}@latest configure`. Check [here](../developer_guides/networking.md) for more information on possible configurations.
   - **EncryptionStack**: Responsible for creating the KMS Key used to encrypt all created CloudWatch Log Groups.
   - **PipelineStack**: Responsible for creating the CodeCommit Repository and the CodePipeline with all the CodeBuild Steps.

## Configuring Continuous Integration

The CI/CD pipeline comes with a set of predefined steps for checking the correctness of your source code:

- `npm ci ##  Downloads the NPM dependencies.`
- `npm run validate ## Validates that the package-lock.json file has not been changed or corrupted.`
- `npm run audit ## Validates that the third-party dependencies are free from any known CVEs.`
- `npm run lint ## Checks source code linting.`
- `npm run build ## Builds the source code.`
- `npm run test ## Runs the included tests.`
- `npm run cdk synth ## Synthesizes the CDK projects and runs the CDK NAG.`

If all steps are finished successfully, the Continuous Integration (CI) part is considered complete.

**Note**: The steps described above can be [modified and extended](../developer_guides/ci.md). Additionally, any of the `npm run` steps can be disabled by changing the corresponding script definition to `true`. Use this approach only as a last resort.

**Note**: A few [additional steps](../developer_guides/ci.md) are executed before the `npm run validate` step for configuring NPM registries and HTTP proxies.

**Note**: The same steps are executed as part of the AWS CodeCommit's PullRequest review process.

## Deploy Changes with GitOps

After the required infrastructure has been deployed, you can apply the GitOps practice to deploy changes.

### Push the Local Repository to Remote (CodeCommit)

If you are using CodeCommit, you need to configure the downstream of the repository for deployment. On your local machine, install the `git-remote-codecommit` package using the following command:

```bash
sudo pip3 install git-remote-codecommit
```

Then, push your local repository to the remote CodeCommit repository:

```bash
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD);
git remote add origin codecommit::${AWS_REGION}://${RES_ACCOUNT_AWS_PROFILE}@${GIT_REPOSITORY};
git commit -am "feat: init origin";
git push -u origin ${CURRENT_BRANCH}:main
```

**Note**: The default branch for the CI/CD pipeline can be [configured](../developer_guides/ci.md).

### Push the Local Repository to Remote (GitHub)

If you are using GitHub, add the remote repository and push your local repository:

```bash
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD);
git remote add origin git@github:${GIT_REPOSITORY}.git;
git commit -am "feat: init origin";
git push -u origin ${CURRENT_BRANCH}:main
```

**Note**: The `origin` remote alias might already be configured, in which case you need to change or replace it.

**Note**: The default branch for the CI/CD pipeline can be [configured](../developer_guides/ci.md).

By following these steps, you have successfully set up and configured the CI/CD pipeline for your AWS CDK project. Your project will now be automatically built, tested, and deployed to the appropriate stages whenever changes are pushed to the remote repository.
