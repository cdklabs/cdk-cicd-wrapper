// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Unit tests for the shared default CI build commands: the golden-path scripts (audit/build/test)
// each run-or-warn, in order, with npm ci first. The engines are responsible for appending cdk synth
// and for replacing this default when ci.steps is set -- those are covered in the engine tests.

import { defaultCiCommands } from '../../src/engine/ci-commands';

describe('defaultCiCommands', () => {
  const commands = defaultCiCommands();

  test('starts with npm ci', () => {
    expect(commands[0]).toBe('npm ci');
  });

  test('runs audit, build, then test after npm ci, in that order', () => {
    expect(commands).toHaveLength(4);
    expect(commands[1]).toContain('npm run audit');
    expect(commands[2]).toContain('npm run build');
    expect(commands[3]).toContain('npm run test');
  });

  test('each script is run only when present, else warns and continues (no failure)', () => {
    for (const [script, cmd] of [
      ['audit', commands[1]],
      ['build', commands[2]],
      ['test', commands[3]],
    ] as const) {
      // Presence probe via `npm pkg get` (no jq), run-if-present, warn-if-absent, no non-zero exit.
      expect(cmd).toContain(`npm pkg get scripts.${script}`);
      expect(cmd).toContain(`npm run ${script}`);
      expect(cmd).toMatch(/else echo /);
      expect(cmd).not.toContain('exit 1');
    }
  });

  test('the missing-script warning points at the checks documentation', () => {
    expect(commands[1]).toContain('https://cdklabs.github.io/cdk-cicd-wrapper/developer_guides/audit/');
  });

  test('no longer invokes the bespoke cdk-cicd check umbrella', () => {
    expect(commands.join(' ')).not.toContain('cdk-cicd check');
  });
});
