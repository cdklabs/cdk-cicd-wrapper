<p align="center">
  <a href="https://cdklabs.github.io/cdk-cicd-wrapper/">
    <img src="docs/content/assets/images/logo.png" width="100em">
    <h3 align="center">CDK CI/CD Wrapper</h3>
  </a>
</p>


<p align="center">
  <a href="https://cdklabs.github.io/cdk-cicd-wrapper/"><strong>Documentation</strong></a> ·
  <a href="https://github.com/cdklabs/cdk-cicd-wrapper/releases"><strong>Changelog</strong></a> ·
  <a href="#community"><strong>Join the community</strong></a>
</p>

<p align="center">
  <a href="https://opensource.org/licenses/Apache-2.0"><img src="https://img.shields.io/badge/License-Apache%202.0-yellowgreen.svg" alt="Apache 2.0 License"></a>
  <a href="https://github.com/cdklabs/cdk-cicd-wrapper/actions/workflows/release.yml"><img src="https://github.com/cdklabs/cdk-cicd-wrapper/actions/workflows/release.yml/badge.svg" alt="Release badge"></a>
  <a href="https://github.com/cdklabs/cdk-cicd-wrapper/commits/main"><img src="https://img.shields.io/github/commit-activity/w/cdklabs/cdk-cicd-wrapper" alt="Commit activity"></a>
</p>

# Welcome to the CDK CI/CD Wrapper

The CDK CI/CD Wrapper gives you an easy way to deliver your CDK applications like a pro.
This repository contains all the tools to build, deliver and test any CDK Applications through multiple stages, and AWS accounts to have high level of quality and confidence.

## Getting Started
To set up the CI/CD pipeline in your existing AWS CDK project, follow these steps:

0. Install the CDK CI/CD Wrapper pipeline package by running the following command:

   ```bash
   npm i @cdklabs/cdk-cicd-wrapper @cdklabs/cdk-cicd-wrapper-cli
   ```

1. Open your entry file, typically located at `bin/<your-main-file>.ts` (where `your-main-file` is the name of your root project directory).

2. Include the `PipelineBlueprint.builder().synth(app)` statement in your entry file, like so:

   ```typescript
   import * as cdk from 'aws-cdk-lib';
   import { PipelineBlueprint } from '@cdklabs/cdk-cicd-wrapper';

   const app = new cdk.App();

   PipelineBlueprint.builder().synth(app);
   ```

   This will deploy the CI/CD pipeline with its default configuration without deploying any stacks into the staging accounts.

3. **Optional**: If you want to include additional stacks in the CI/CD pipeline, modify your entry file as follows:

   ```typescript
   import * as cdk from 'aws-cdk-lib';
   import { PipelineBlueprint, GlobalResources } from '@cdklabs/cdk-cicd-wrapper';

   const app = new cdk.App();

   PipelineBlueprint.builder().addStack({
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

   **Note**: Refer to the [Developer Guide](https://cdklabs.github.io/cdk-cicd-wrapper/developer_guides/index.html) for more information on the `PipelineBlueprint`.

  4. The CDK CI/CD Wrapper expects to have the `validate`, `lint`, `test`, `audit` scripts defines. If you are missing any of the `npm run` scripts (e.g., ), or want to use the provided CLI tool for one or more actions, you can add the following definitions to your `package.json` file:

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
       "validate": "cdk-cicd validate",
       "validate:fix": "cdk-cicd validate --fix",
       "audit": "npx concurrently 'npm:audit:*(!fix)'",
       "audit:deps:nodejs": "cdk-cicd check-dependencies --npm",
       "audit:deps:python": "cdk-cicd check-dependencies --python",
       "audit:scan:security": "cdk-cicd security-scan --bandit --semgrep --shellcheck --ci",
       "audit:license": "npm run license",
       "audit:fix:license": "npm run license:fix",
       "license": "cdk-cicd license",
       "license:fix": "cdk-cicd license --fix",
       "lint": "eslint . --ext .ts --max-warnings 0",
       "lint:fix": "eslint . --ext .ts --fix",
       "test": "jest"
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

Visit our [documentation](https://cdklabs.github.io/cdk-cicd-wrapper/) to learn more.

## Use cases

The CDK CI/CD Wrapper is the next step on road to standardize and simplify the multi-stage CI/CD process that the successful [aws-cdk-cicd-boot-sample](https://github.com/aws-samples/aws-cdk-cicd-boot-sample) started. Thus the use cases for the CDK CI/CD Wrapper are the same as for the [aws-cdk-cicd-boot-sample](https://github.com/aws-samples/aws-cdk-cicd-boot-sample).

- Multi staged CI/CD pipeline for IaC projects

On top of that the CDK CI/CD Wrapper has arbitrary scripts that can be leveraged in any projects involving TypeScript, and/or Python.

- CI/CD execution by AWS CodePipeline in VPC, Private VPC with NAT Gateway, or even through an HTTP Proxy
- Security scanning on dependencies and on your project codebase as well
- License management over NPM and Python dependencies
- Support for private NPM registry to safely store your libraries
- Customizable CI/CD pipeline to attach to your CDK applications which comes with built-in dependency injection
- Workbench deployment feature which allows you to develop and experiment your solutions before it is introduced in the delivery pipeline, e.g: deploy and test one or multiple CDK stacks isolated from the ones deployed by the CI/CD pipeline

## Intended usage

You should not fork this repository and expect to reproduce the same in your AWS Accounts, this repository is only used for preparing, testing and shipping all the packages used by the CDK CI/CD Wrapper. Using the CDK CI/CD Wrapper gives you the following benefits:

- :white_check_mark: FOSS (Free and open-source software) scanning – built-in checks against a pre-defined adjustable list of licenses
- :white_check_mark: Workbench – isolated test environment for developers which enables parallel testing in the same AWS Account without collisions
- :white_check_mark: Automated security scanners – enabled by default bandit, shellcheck, npm audit, pip audit, etc)
- :white_check_mark: AWS CDK Language agnostic – support for TypeScript and Python, on the works to fully support Java / C# / Go 
- :white_check_mark: Built for many project types - facilitating MLOps usecase, Web App development (UIs), GenAI usecases

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This project is licensed under the Apache-2.0 License.

# Community
The CDK CI/CD Wrapper community can be found within the #cdk-cicd-wrapper channel in the [cdk.dev](https://cdk.dev/) community Slack workspace.

## Contributors

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-4-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/gmuslia"><img src="https://avatars.githubusercontent.com/u/102723839?v=4?s=100" width="100px;" alt="Gezim Musliaj"/><br /><sub><b>Gezim Musliaj</b></sub></a><br /><a href="https://github.com/cdklabs/cdk-cicd-wrapper/commits?author=gmuslia" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/gyalai-aws"><img src="https://avatars.githubusercontent.com/u/142315836?v=4?s=100" width="100px;" alt="Milan Gyalai @ AWS"/><br /><sub><b>Milan Gyalai @ AWS</b></sub></a><br /><a href="https://github.com/cdklabs/cdk-cicd-wrapper/commits?author=gyalai-aws" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/dainovsv"><img src="https://avatars.githubusercontent.com/u/95890653?v=4?s=100" width="100px;" alt="Vladimir Dainovski"/><br /><sub><b>Vladimir Dainovski</b></sub></a><br /><a href="https://github.com/cdklabs/cdk-cicd-wrapper/commits?author=dainovsv" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/thoulen"><img src="https://avatars.githubusercontent.com/u/1113986?v=4&size=100" width="100px;" alt="Fabrizio Manfredi F."/><br /><sub><b>Fabrizio Manfredi F.</b></sub></a><br /><a href="https://github.com/cdklabs/cdk-cicd-wrapper/commits?author=thoulen" title="Code">💻</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->
