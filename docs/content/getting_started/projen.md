# Setting up a project with Projen

[Projen](https://projen.io) is a tool that helps define and maintain complex project configurations through code. It allows you to generate project configuration files from a well-typed definition, making it easier to manage and maintain your project structure.

## Prerequisites

Before getting started, ensure that you have the following prerequisites installed:

- [Node.js](https://nodejs.org/) (version 16.x or later)
- [npm](https://www.npmjs.com/) (comes bundled with Node.js)

Projen doesn't need to be installed separately. You will be using `npx` to run Projen, which takes care of all the required setup steps.

## Step 1: Initialize a new project

Follow these steps to initialize a new project using Projen:

1. Open your terminal or command prompt.
2. Navigate to the directory where you want to create your new project.
3. Run the following command to initialize a new {{ project_name }} project:

   ```
   npx projen@latest new awscdk-app-ts --no-git --deps {{ npm_projen }}
   ```

   This command initializes a new AWS CDK TypeScript app project with the `{{ npm_projen }}` dependency.

4. Open the `.projenrc.ts` file and add the following code:

   ```typescript
   import { awscdk } from 'projen';
   import { CdkCICDWrapper } from '{{ npm_projen }}';

   const project = new awscdk.AwsCdkTypeScriptApp({
     cdkVersion: '2.1.0',
     defaultReleaseBranch: 'main',
     deps: ['@cdklabs/cdk-cicd-wrapper'],
     name: 'project',
     projenrcTs: true,
   });

   //@ts-ignore Projen Versions can be different during the upgrade process and would resolve complains about assignability issues.
   new CdkCICDWrapper(project, {
     cdkQualifier: 'wrapper',
     repositoryName: 'projen-sample-wrapper',
     repositoryType: 'CODECOMMIT', // Must be 'GITHUB' for a codestar connection
   });

   project.synth();
   ```

   This code configures the project with the necessary settings for the AWS CDK and the `CdkCICDWrapper` component.  Note that a PROD stage will not be created by default, so add it here if required.  eg.

   ```typescript
   new CdkCICDWrapper(project, {
      cdkQualifier: 'wrapper',
      repositoryName: 'projen-sample-wrapper',
      repositoryType: 'CODECOMMIT',
      stages: [ // Must be a list of all stages other than RES and may include custom stages
         'DEV',
         'INT',
         'PROD',
      ]
   });

   ```

5. Enable the project.

```bash
npx projen
```

6. Before deploying, run the following commands to ensure your project is ready:

   ```bash
   npm run validate -- --fix
   npm run license -- --fix
   ```

   - `npm run validate -- --fix` will create the required `package-verification.json` file for you.
   - `npm run license -- --fix` will generate a valid Notice file for you.

## Step 2: Configure stacks

The `PipelineBlueprint` component provided by the `{{ npm_pipeline }}` package allows you to define and configure the stacks for your application. Here's an example of how you can configure your stacks:

```typescript
import * as cdk from 'aws-cdk-lib';
import { PipelineBlueprint } from '{{ npm_codepipeline }}';

const app = new cdk.App();

PipelineBlueprint.builder().addStack({
  provide: (context) => {
    // Create your stacks here.  Note that the scope parameter must be `context.scope`, not `app`
    new YourStack(context.scope, `${context.blueprintProps.applicationName}YourStack`, {
      applicationName: context.blueprintProps.applicationName,
      stageName: context.stage,
    });
    new YourOtherStack(context.scope, `${context.blueprintProps.applicationName}YourOtherStack`, {
      applicationQualifier: context.blueprintProps.applicationQualifier,
      encryptionKey: context.get(GlobalResources.Encryption)!.kmsKey,
    });
  }
}).synth(app);
```

**Note**: Refer to the [Developer Guide](../developer_guides/index.md) for more information on the `PipelineBlueprint` component and how to configure your stacks.

## Step 3: Configure environment variables / create .env file

The {{ project_name }} uses environment variables to store sensitive information and configuration settings. The `CdkCICDWrapper` component creates a sample `.env` file in the root directory of your project and defines the necessary variables there. You must fill out the values for these variables.

If you are using [CodeConnections](../developer_guides/vcs_github.md) to access an external git repository, add the following value to the .env file with the correct values for region, account number and connection ID:

```
CODESTAR_CONNECTION_ARN=arn:aws:codeconnections:[region]:[account number]:connection/[connection ID]
```

This file is created once, and you must maintain it manually as needed.

## Step 4: Bootstrap your stages

The {{ project_name }} uses the AWS CDK Toolkit with a cross-account trust relationship to deploy to multiple AWS accounts. This bootstrapping process must be established for each stage, and each account must have a trust relationship with the RES account.

If you are reusing an existing CDK bootstrapping setup, you can skip this step. Otherwise, follow these instructions to bootstrap your stages:

1. **Prepare the RES stage**:

   ```bash
   npm run bootstrap RES
   ```

2. **Prepare the DEV stage**:

   ```bash
   npm run bootstrap DEV
   ```

3. **Prepare the INT stage**:

   ```bash
   npm run bootstrap INT
   ```

4. **Prepare the PROD stage (if configured)**:

   ```bash
   npm run bootstrap PROD
   ```

   **Note**: The stages have to be defined in the `.projenrc.ts` file `CdkCICDWrapperOptions.stages` variable and PROD is not configured by default.  

## Step 5: Deploy the pipeline

Once you have completed the previous steps, you can deploy the pipeline:

1. In your terminal or command prompt, navigate to the root directory of your project.
2. Run the following command to deploy the pipeline:

   ```
   npm run deploy
   ```

   This command will prompt you to confirm the deployment and then create the necessary resources for your pipeline in AWS.

## Step 6: Push your changes to the git repository

After the deployment is complete, Projen will automatically trigger the pipeline and begin the process of building, testing, and deploying your application infrastructure based on the defined stages. Push your changes to the Git repository to start the pipeline process.

## Conclusion

Congratulations! You have successfully set up a project with Projen and configured a pipeline for building and deploying your cloud-based application infrastructure. This documentation provides an overview of the process and guides you through the necessary steps.

If you need further assistance or have any questions, please refer to the official Projen documentation or reach out to the project maintainers for support.