// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Project, SampleFile } from 'projen';

/**
 * Interface representing the properties required for creating a .env file.
 */
export interface DotEnvFileProps {
  /**
   * An array of strings representing the stages for which the .env file is being created.
   */
  stages: string[];

  /**
   * A string representing the stage for the workbench environment.
   */
  workbenchStage: string;
}

/**
 * Class representing a .env file.
 * @extends SampleFile
 */
export class DotEnvFile extends SampleFile {
  /**
   * Constructs a new instance of the DotEnvFile class.
   * @param project - The Project instance for which the .env file is being created.
   * @param props - The DotEnvFileProps containing the stages and workbenchStage.
   */
  constructor(project: Project, props: DotEnvFileProps) {
    super(project, '.env', {
      contents: `
# This is a sample .env file
# Add your own variables here
# You can also use environment variables
# to override these values
AWS_REGION=eu-west-1
ACCOUNT_RES=
RES_ACCOUNT_AWS_PROFILE=
STAGES_ENABLED=${props.stages.join(',')}
${props.stages.map((stage) => `ACCOUNT_${stage}=\n${stage}_ACCOUNT_AWS_PROFILE=`).join('\n')}
WORKBENCH_STAGE=${props.workbenchStage}
WORKBENCH_AWS_PROFILE=$\${WORKBENCH_STAGE}_ACCOUNT_AWS_PROFILE
AWS_PROFILE=$RES_ACCOUNT_AWS_PROFILE
        `,
    });

    // Add the .env file to the project's gitignore
    project.gitignore.addPatterns('.env');
  }
}
