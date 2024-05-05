// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Project, SampleFile } from 'projen';

export interface DotEnvFileProps {
  stages: string[];
  workbenchStage: string;
}

export class DotEnvFile extends SampleFile {
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

    project.gitignore.addPatterns('.env');
  }
}
