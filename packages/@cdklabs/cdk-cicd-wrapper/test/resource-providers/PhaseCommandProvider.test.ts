// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as path from 'path';
import { InlineShellPhaseCommand } from '../../src/resource-providers/PhaseCommandProvider';

describe('PhaseCommandProvider', () => {
  test('InlineShellPhaseCommand generates cat heredoc without intermediate variable', () => {
    const npmLogin = new InlineShellPhaseCommand('npm-login.sh');

    const bashScript = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/npm-login.sh'),
      { encoding: 'utf-8' },
    );

    const expectedCommand = `cat > ./.cdk.wrapper.npm-login.sh.sh << 'CDKEOF'\n${bashScript}\nCDKEOF; chmod +x ./.cdk.wrapper.npm-login.sh.sh; ./.cdk.wrapper.npm-login.sh.sh; exit_code=$?; rm -rf ./.cdk.wrapper.npm-login.sh.sh; [ $exit_code -eq 0 ];`;

    expect(npmLogin.command).toEqual(expectedCommand);
  });

  test('InlineShellPhaseCommand with exportEnvironment sources the script', () => {
    const warming = new InlineShellPhaseCommand('warming.sh', true);

    const bashScript = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/warming.sh'),
      { encoding: 'utf-8' },
    );

    const expectedCommand = `cat > ./.cdk.wrapper.warming.sh.sh << 'CDKEOF'\n${bashScript}\nCDKEOF; chmod +x ./.cdk.wrapper.warming.sh.sh; . ./.cdk.wrapper.warming.sh.sh; exit_code=$?; rm -rf ./.cdk.wrapper.warming.sh.sh; [ $exit_code -eq 0 ];`;

    expect(warming.command).toEqual(expectedCommand);
  });

  test('InlineShellPhaseCommand does not escape $ or backticks', () => {
    const npmLogin = new InlineShellPhaseCommand('npm-login.sh');
    const command = npmLogin.command;

    // The quoted heredoc ('CDKEOF') means no escaping is needed
    expect(command).not.toContain('\\$');
    expect(command).not.toContain('\\`');
    // Should not use bash_command variable pattern
    expect(command).not.toContain('bash_command=');
  });
});
