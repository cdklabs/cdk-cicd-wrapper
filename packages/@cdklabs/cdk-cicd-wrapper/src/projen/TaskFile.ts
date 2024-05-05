// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import path from 'path';
import { Project, SampleFile } from 'projen';

/**
 * Props for configuring the TaskFile.
 */
export interface TaskFileProps {
  /**
   * The file path for the TaskFile.
   * @default 'Taskfile.yaml'
   */
  filePath?: string;
}

/**
 * Represents a TaskFile, which is a type of SampleFile in the Projen project.
 * The TaskFile is responsible for managing the Taskfile.yaml file in the project.
 */
export class TaskFile extends SampleFile {
  constructor(project: Project, props: TaskFileProps = {}) {
    super(project, props.filePath || 'Taskfile.yaml', {
      sourcePath: path.join(__dirname, 'Taskfile.yaml'),
    });

    /**
     * Adds the '.task' directory to the project's .gitignore file.
     * This ensures that the '.task' directory is excluded from the Git repository.
     */
    project.addGitIgnore('.task');
  }
}
