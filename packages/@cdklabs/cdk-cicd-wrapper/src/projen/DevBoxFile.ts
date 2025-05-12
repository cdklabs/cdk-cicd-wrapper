// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
// eslint-disable-next-line  import/no-extraneous-dependencies
import { SampleFile, Project } from 'projen';

/**
 * Represents a configuration file for a development environment.
 */
export class DevBox extends SampleFile {
  /**
   * Creates a new instance of the DevBox class.
   *
   * @param project - The Project instance to which this DevBox configuration belongs.
   */
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

    /**
     * Excludes the '.devbox' directory from the Git repository.
     */
    project.gitignore.exclude('.devbox');
  }
}
