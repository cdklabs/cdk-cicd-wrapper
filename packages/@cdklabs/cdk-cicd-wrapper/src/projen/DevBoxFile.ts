// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { SampleFile, Project } from 'projen';

export class DevBox extends SampleFile {
  constructor(project: Project) {
    super(project, 'devbox.json', {
      contents: JSON.stringify(
        {
          $schema: 'https://raw.githubusercontent.com/jetpack-io/devbox/0.10.3/.schema/devbox.schema.json',
          packages: ['git@2.42.0', 'git-remote-codecommit@1.15.1', 'jq@1.7.1', 'go-task@3.36.0', 'nodejs_20'],
          shell: {
            init_hook: ["echo 'Thank you for using the CDK CI/CD Wrapper.'", 'task prepare'],
            scripts: {
              build: ['task build'],
              workbench: ['task workbench'],
              synth: ['task synth'],
              deploy: ['task deploy'],
            },
          },
        },
        undefined,
        4,
      ),
    });

    project.gitignore.exclude('.devbox');
  }
}
