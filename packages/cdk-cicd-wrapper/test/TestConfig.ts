// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import {
  IVanillaPipelineConfig,
  CodeGuruSeverityThreshold,
  PipelinePhases,
} from '../src/common';
import { BaseRepositoryProviderProps } from '../src/resource-providers';
import { PhaseCommands } from '../src/resource-providers/PhaseCommandProvider';

const codeBuildEnvSettings = {
  isPrivileged: true,
  buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
};

export const TestAppConfig: IVanillaPipelineConfig = {
  applicationName: 'VanillaPipeline',
  deploymentDefinition: {
    RES: { env: { account: '123456789012', region: 'eu-west-1' }, stacksProviders: [] },
    DEV: { env: { account: '234567890123', region: 'eu-west-1' }, stacksProviders: [] },
    INT: { env: { account: '345678901234', region: 'eu-west-1' }, stacksProviders: [] },
    PREPROD: { env: { account: '456789012345', region: 'eu-west-1' }, stacksProviders: [] },
  },
  applicationQualifier: 'test',
  logRetentionInDays: '365',
  codeBuildEnvSettings: codeBuildEnvSettings,
  codeGuruScanThreshold: CodeGuruSeverityThreshold.HIGH,
  primaryOutputDirectory: './cdk.out',
  phases: {
    [PipelinePhases.INITIALIZE]: [
      PhaseCommands.ENVIRONMENT_PREPARATION,
      PhaseCommands.CONFIGURE_HTTP_PROXY,
      PhaseCommands.NPM_LOGIN,
    ],
    [PipelinePhases.PRE_BUILD]: [PhaseCommands.CHECK_AUDIT, PhaseCommands.NPM_CI, PhaseCommands.CHECK_LINT],
    [PipelinePhases.BUILD]: [PhaseCommands.BUILD],
    [PipelinePhases.TESTING]: [PhaseCommands.TEST, PhaseCommands.CDK_SYNTH_NO_LOOK_UP],
  },
};

export const TestRepositoryConfigGithub: BaseRepositoryProviderProps = {
  repositoryType: 'GITHUB',
  name: 'owner/vanilla-pipeline',
  codeStarConnectionArn: 'arn:aws:codestar-connections:eu-west-1:123456789123:host/abc123-example',
  branch: 'main',
};


export const TestRepositoryConfigCodeCommit: BaseRepositoryProviderProps = {
  repositoryType: 'CODECOMMIT',
  name: 'owner/vanilla-pipeline',
  description: 'CodeCommit repository used for the CI/CD pipeline',
  branch: 'main',
  codeGuruReviewer: true,
};

export const TestComplianceLogBucketName = {
  RES: 'bucket-res',
  DEV: 'bucket-dev',
  INT: 'bucket-int',
};
