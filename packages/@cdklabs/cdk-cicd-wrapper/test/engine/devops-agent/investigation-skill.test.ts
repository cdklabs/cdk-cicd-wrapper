// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { INVESTIGATION_SKILL_FILES } from '../../../src/engine/devops-agent/investigation-skill.generated';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sync = require('../../../build-tools/sync-investigation-skill');

describe('the embedded investigation skill', () => {
  test('matches skills/cdk-cicd-pipeline-failure-investigation (run build-tools/sync-investigation-skill.js)', () => {
    // Compares content, not file text, so the generated module's formatting is free to follow prettier.
    expect(INVESTIGATION_SKILL_FILES).toEqual(sync.skillFiles());
    expect(INVESTIGATION_SKILL_FILES.map((file) => file.path)).toEqual(['SKILL.md', 'references/pipeline-layout.md']);
  });
});
