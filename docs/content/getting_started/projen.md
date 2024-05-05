# Setting Up a Project with Projen

[Projen](https://projen.io) is a tool that helps define and maintain complex project configurations through code. It allows you to generate project configuration files from a well-typed definition, making it easier to manage and maintain your project structure.

## Prerequisites

Projen doesn't need to be installed separately. You will be using `npx` to run Projen, which takes care of all the required setup steps.

## Step 1: Initialize a New Project

1. Open your terminal or command prompt.
2. Navigate to the directory where you want to create your new project.
3. Run the following command to initialize a new {{ project_name }} project:

   ```
   npx projen@latest new awscdk-app-ts --no-git --deps {{ npm_pipeline }}
   ```

4. Add the following code to the `.projenrc.ts` file:

   ```typescript
   import { awscdk } from 'projen';
   import { CdkCICDWrapper } from '@cdklabs/cdk-cicd-wrapper';

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
     repositoryName: 'projin-sample-wrapper',
     repositoryType: 'CODECOMMIT',
   });

   project.synth();
   ```

5. Execute the `npx run projen` command to enable the {{ project_name }}.

6. Before deploying, run the following commands to ensure your project is ready:

   ```bash
   npm run validate -- --fix
   npm run license -- --fix
   ```

   - `npm run validate -- --fix` will create the required `package-verification.json` file for you.
   - `npm run license -- --fix` will generate a valid Notice file for you.

## Step 2: Configure Stacks

```typescript
import * as cdk from 'aws-cdk-lib';
import { PipelineBlueprint } from '{{ npm_codepipeline }}';

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
      encryptionKey: context.get<vp.IEncryptionKey>(vp.GlobalResources.Encryption)!.kmsKey,
    });
  }
}).synth(app);
```

**Note**: Refer to the [Developer Guide](../developer_guides/index.md) for more information on the `PipelineBlueprint`.

## Step 3: Configure Environment Variables / Create .env File

The {{ project_name }} uses environment variables to store sensitive information and configuration settings. The `CdkCICDWrapper` component creates a sample `.env` file in the root directory of your project and defines the necessary variables there which you must fill out. 

This file is created once then the maintenance has to be done manually.

## Step 4: Bootstrap Your Stages

The {{ project_name }} uses the AWS CDK Toolkit with a cross-account trust relationship to deploy to multiple AWS accounts. This bootstrapping process must be established for each stage, and each account must have a trust relationship with the RES account.

If you are reusing an existing CDK bootstrapping setup, you can skip this step. Otherwise, follow the instructions below to bootstrap your stages:

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

4. **Prepare the PROD stage**:

   ```bash
   npm run bootstrap PROD
   ```

   **Note**: The stages have to be defined in the `.projenrc.ts` file `CdkCICDWrapperOptions.stages` variable.

## Step 5: Deploy the Pipeline

1. In your terminal or command prompt, navigate to the root directory of your project.
2. Run the following command to deploy the pipeline:

   ```
   npm run deploy
   ```

   This command will prompt you to confirm the deployment and then create the necessary resources for your pipeline in AWS.

## Step 6: Push your changes to the GIT repository
After the deployment is complete, Projen will automatically trigger the pipeline and begin the process of building, testing, and deploying your application infrastructure based on the defined stages.

## Conclusion

Congratulations! You have successfully set up a project with Projen and configured a pipeline for building and deploying your cloud-based application infrastructure. The provided documentation should help you understand the overall process and guide you through the necessary steps.

If you need further assistance or have any questions, please refer to the official Projen documentation or reach out to the project maintainers for support.