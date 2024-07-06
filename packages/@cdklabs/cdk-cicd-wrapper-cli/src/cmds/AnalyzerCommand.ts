// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-console */
import * as yargs from 'yargs';
import { CodePipeline, GetPipelineCommand } from '@aws-sdk/client-codepipeline';
import { CodeBuild, BatchGetProjectsCommand } from '@aws-sdk/client-codebuild';
import { KMS, DescribeKeyCommand } from '@aws-sdk/client-kms';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';

/**
 * Command class that checks CodePipeline and CodeBuild configurations.
 */
class Command implements yargs.CommandModule {
  /**
   * The command name.
   */
  command = 'analyze';

  /**
   * A description of the command.
   */
  describe = 'analyzes the environment and pipeline configuration to spot potential common issues.';

  /**
   * Builds the command arguments.
   * @param args The argument parser.
   * @returns The argument parser with defined options.
   */
  builder(args: yargs.Argv) {
    return args
      .option('profile', {
        type: 'string',
        requiresArg: true,
        demandOption: 'AWS profile is required',
        description: 'AWS profile',
      })
      .option('region', {
        type: 'string',
        requiresArg: true,
        demandOption: 'AWS region is required',
        description: 'AWS region',
      })
      .option('cdk-qualifier', {
        type: 'string',
        requiresArg: true,
        demandOption: 'CDK Qualifier Required',
        description: 'The qualifier used for the CDK project',
      });
  }

  /**
   * Handles the command execution.
   * @param args The parsed command arguments.
   */
  async handler(args: yargs.Arguments) {
    const region = args.region as string;
    const profile = args.profile as string;
    const cdkQualifier = args['cdk-qualifier'] as string;

    const sdkConfig = {
      region,
      credentials: fromNodeProviderChain({ profile }),
    };

    const pipelineClient = new CodePipeline(sdkConfig);
    const codebuildClient = new CodeBuild(sdkConfig);
    const kmsClient = new KMS(sdkConfig);

    console.log('analyzing for common issues...')
    try {
      const pipelines = await pipelineClient.listPipelines({});
      for (const pipeline of pipelines.pipelines || []) {
        if (pipeline.name?.includes(cdkQualifier)) {
          console.log('retrieving pipeline details...')
          const pipelineDetails = await pipelineClient.send(
            new GetPipelineCommand({ name: pipeline.name })
          );

          if (!pipelineDetails.pipeline?.stages) {
            console.error(`Your pipeline has no stages!`);
          } else {

            //Pipeline sanity check against .env
            console.log('preforming pipeline sanity check against env vars...')
            if (process.env.ACCOUNT_DEV && process.env.ACCOUNT_DEV !== '-') {
              const hasDevStage = pipelineDetails.pipeline?.stages.some(stage => stage.name === 'DEV');
              if (!hasDevStage) {
                console.warn(`NOTE : pipeline failed sanity check, your .env / env vars specify a DEV stage but your pipeline does not have one`);
              }
            }
            
            if (process.env.ACCOUNT_INT && process.env.ACCOUNT_INT !== '-') {
              const hasIntStage = pipelineDetails.pipeline?.stages.some(stage => stage.name === 'INT');
              if (!hasIntStage) {
                console.warn(`NOTE : pipeline failed sanity check, your .env / env vars specify an INT stage but your pipeline does not have one`);
              }
            }



            console.log('checking codebuilds...')
            for (const stage of pipelineDetails.pipeline?.stages) {
              for (const action of stage.actions || []) {
                // Codebuild Checks
                if (action.actionTypeId?.provider === 'CodeBuild' && action.configuration?.ProjectName) {
                  const codebuildProjectName = action.configuration?.ProjectName;
                  // Check the env vars of the synth action
                  if (action.name === 'Synth') {
                    await checkEnvVarsCodeBuildProject(codebuildClient, codebuildProjectName);
                  }

                  // Check the CodeBuild projects to see if they are using a valid KMS Key
                  await checkKMSCodeBuildProject(codebuildClient, kmsClient, codebuildProjectName);
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  }
}

/**
 * Validates if a string is a valid ARN.
 * @param arn The ARN string.
 * @returns True if valid, otherwise false.
 */
function isValidArn(arn: string): boolean {
  const arnRegex = /^arn:aws[a-zA-Z-]*:[a-zA-Z0-9-]+:[a-zA-Z0-9-]*:[0-9]*:[^/].*$/;
  return arnRegex.test(arn);
}

/**
 * Checks the CodeBuild project for environment variables.
 * @param codebuildClient The CodeBuild client.
 * @param projectName The name of the CodeBuild project.
 */
async function checkEnvVarsCodeBuildProject(codebuildClient: CodeBuild, projectName: string) {
  try {
    const projectDetails = await codebuildClient.send(
      new BatchGetProjectsCommand({ names: [projectName] })
    );

    const project = projectDetails.projects?.[0];
    if (project) {
      const envVars = project.environment?.environmentVariables || [];
      console.log('build stage environment variables:', envVars);

      const proxySecretArn = envVars.find(env => env.name === 'PROXY_SECRET_ARN');
      const codestarConnectionArn = envVars.find(env => env.name === 'CODESTAR_CONNECTION_ARN');

      console.log('proxySecretArn:', proxySecretArn);
      console.log('codestarConnectionArn:', codestarConnectionArn);

      if (!proxySecretArn || proxySecretArn.value === '' || proxySecretArn.value === '-') {
        console.warn(`NOTE: you do not have a PROXY_SECRET_ARN configured in the synth stage of your pipeline. if your organization uses a network proxy, your CodeBuild may fail.`);
      } else if (proxySecretArn.value && !isValidArn(proxySecretArn.value)) {
        console.error(`ERROR : Invalid ARN format for PROXY_SECRET_ARN in CodeBuild project ${projectName}.`);
      }

      if (!codestarConnectionArn || codestarConnectionArn.value === '' || codestarConnectionArn.value === '-') {
        console.warn(`NOTE: your CODESTAR_CONNECTION_ARN is empty in the Synth stage of your pipeline. If you are not using CodeCommit as your repository, you need to define a valid CodeStar connection ARN.`);
      } else if (codestarConnectionArn.value && !isValidArn(codestarConnectionArn.value)) {
        console.error(`ERROR : invalid arn format for CODESTAR_CONNECTION_ARN in codebuild project ${projectName}.`);
      }
    }
  } catch (err) {
    console.error(`ERROR : failed to retrieve details for codebuild project ${projectName}:`, err);
  }
}

/**
 * Checks the CodeBuild project for KMS key validity.
 * @param codebuildClient The CodeBuild client.
 * @param kmsClient The KMS client.
 * @param projectName The name of the CodeBuild project.
 */
async function checkKMSCodeBuildProject(codebuildClient: CodeBuild, kmsClient: KMS, projectName: string) {
  try {
    const projectDetails = await codebuildClient.send(
      new BatchGetProjectsCommand({ names: [projectName] })
    );

    const project = projectDetails.projects?.[0];
    if (project) {
      const encryptionKey = project.encryptionKey;

      if (encryptionKey) {
        const kmsKeyDetails = await kmsClient.send(
          new DescribeKeyCommand({ KeyId: encryptionKey })
        );

        if (kmsKeyDetails.KeyMetadata?.KeyState === 'Disabled') {
          console.error(`ERROR : KMS key ${encryptionKey} for project ${projectName} is disabled.`);
        }
      } else {
        console.warn(`NOTE : no KMS key configured for project ${projectName}.`);
      }
    }
  } catch (err) {
    console.error(`ERROR : failed to retrieve details for codebuild project ${projectName}:`, err);
  }
}

export default new Command();
