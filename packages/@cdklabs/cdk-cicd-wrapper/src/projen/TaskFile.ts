// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import path from 'path';
import { Project, SampleFile } from 'projen';

export interface TaskFileProps {
  filePath?: string;
}

export class TaskFile extends SampleFile {
  constructor(project: Project, props: TaskFileProps = {}) {
    super(project, props.filePath || 'Taskfile.yaml', {
      sourcePath: path.join(__dirname, 'Taskfile.yaml'),
    });

    project.addGitIgnore('.task');
  }
}
