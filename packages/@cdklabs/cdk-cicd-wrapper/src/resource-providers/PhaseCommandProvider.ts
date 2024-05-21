// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as path from 'path';
import { ResourceContext, IResourceProvider, Scope, IPhaseCommand, PipelinePhases } from '../common';

/**
 * Phase command that invokes NPM scripts from project package.json
 */
export class NPMPhaseCommand implements IPhaseCommand {
  constructor(readonly script: string) {}

  /**
   * Returns the command to be executed for the given NPM script.
   */
  get command() {
    // npm ci is not a script but essential
    if (this.script === 'ci') {
      if (fs.existsSync(path.resolve('.projenrc.ts'))) {
        return 'npx projen install:ci';
      }

      if (fs.existsSync(path.resolve('package-lock.json'))) {
        return 'npm ci';
      }

      if (fs.existsSync(path.resolve('yarn.lock'))) {
        return 'yarn install --check-files --frozen-lockfile';
      }
    }

    const command = `npm run ${this.script}`;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const pkgJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), { encoding: 'utf-8' }));

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (!pkgJson.scripts[this.script]) {
      throw new Error(`Script ${this.script} does not exist in package.json`);
    }

    return command;
  }
}

/**
 * Phase Command that invokes shell scripts from project folder.
 */
export class ShellScriptPhaseCommand implements IPhaseCommand {
  constructor(readonly script: string) {}

  /**
   * Returns the command to be executed for the given shell script.
   */
  get command() {
    // Check script file exists and executable
    if (!fs.existsSync(path.resolve(this.script))) {
      throw new Error(`Script file ${this.script} does not exist`);
    }

    return this.script;
  }
}

/**
 * Phase Command that invokes a simple shell command.
 */
export class ShellCommandPhaseCommand implements IPhaseCommand {
  constructor(readonly command: string) {}
}

/**
 * Creates a new ShellCommandPhaseCommand instance with the given command.
 * @param command The shell command to be executed.
 * @returns A new ShellCommandPhaseCommand instance.
 */
export const sh = (command: string) => new ShellCommandPhaseCommand(command);

/**
 * Phase Command that invokes Python scripts from project folder.
 */
export class PythonPhaseCommand implements IPhaseCommand {
  constructor(readonly script: string) {}

  /**
   * Returns the command to be executed for the given Python script.
   */
  get command() {
    // Check script file exists and executable
    if (!fs.existsSync(path.resolve(this.script))) {
      throw new Error(`Script file ${this.script} does not exist`);
    }

    return `python ${this.script}`;
  }
}

/**
 * Phase Command that place the scripts code directly into the CodeBuild buildSpec definition.
 *
 * This is used to add scripts from this NPM library to the buildSpec that needs to run without internet access or ability to invoke npm ci.
 */
export class InlineShellPhaseCommand implements IPhaseCommand {
  constructor(
    readonly script: string,
    /**
     * Determines whether the script should export environment variables or not.
     * @default false
     */
    readonly exportEnvironment = false,
  ) {}

  /**
   * Returns the command to be executed for the given inline shell script.
   */
  get command() {
    const bashScript = fs.readFileSync(path.resolve(__dirname, '../../scripts/', this.script), {
      encoding: 'utf-8',
    });
    const replaced = bashScript.replace(/\$/g, '\\$').replace(/\`/g, '\\`');
    const escapedScript = `bash_command=$(cat << CDKEOF\n ${replaced}\nCDKEOF\n )`;
    if (this.exportEnvironment) {
      return `${escapedScript}; echo -n "$bash_command" > ./.cdk.wrapper.${this.script}.sh; chmod +x ./.cdk.wrapper.${this.script}.sh; . ./.cdk.wrapper.${this.script}.sh;`;
    }
    return `${escapedScript}; echo -n "$bash_command" > ./.cdk.wrapper.${this.script}.sh; chmod +x ./.cdk.wrapper.${this.script}.sh; ./.cdk.wrapper.${this.script}.sh;`;
  }
}

/**
 * List of built-in commands that are used on pipelines.
 */
export const PhaseCommands = {
  /**
   * This command configures the HTTP Proxy settings
   */
  CONFIGURE_HTTP_PROXY: new InlineShellPhaseCommand('proxy.sh'),

  /**
   * This command configures NPM authentication for private registries.
   */
  NPM_LOGIN: new InlineShellPhaseCommand('npm-login.sh'),

  /**
   * This command runs the npm run validate script, that validates the package-lock.json is not tempered with.
   */
  VALIDATE: new NPMPhaseCommand('validate'),

  /**
   * This command runs the npm run audit script, that audit the dependencies and source codes of the project.
   */
  CHECK_AUDIT: new NPMPhaseCommand('audit'),

  /**
   * This command runs the npm run lint script, that lints the source code.
   */
  CHECK_LINT: new NPMPhaseCommand('lint'),

  /**
   * This command populates build-env variables from the SSM Parameter store.
   */
  ENVIRONMENT_PREPARATION: new InlineShellPhaseCommand('warming.sh', true),

  /**
   * This command installs the NPM dependencies.
   */
  NPM_CI: new NPMPhaseCommand('ci'),

  /**
   * This command runs the npm run build script, that builds the source code.
   */
  BUILD: new NPMPhaseCommand('build'),

  /**
   * This command runs the npm run test script, that tests the source code.
   */
  TEST: new NPMPhaseCommand('test'),

  /**
   * This command executes the CDK synth with look up.
   */
  CDK_SYNTH: new InlineShellPhaseCommand('cdk-synth.sh'),

  /**
   * This command executes the CDK synth without look up.
   */
  CDK_SYNTH_NO_LOOK_UP: new InlineShellPhaseCommand('cdk-synth-no-lookup.sh'),
};

/**
 * Setting the list of commands for the phases.
 */
export interface IPhaseCommandSettings {
  /**
   * Returns the list of commands for the specified phases.
   * @param phases The phases for which commands are needed.
   * @returns The list of commands for the specified phases.
   */
  getCommands(...phases: PipelinePhases[]): string[];
}

/**
 * Default implementation of PhaseCommandSettings.
 */
class DefaultPhaseCommandSettings implements IPhaseCommandSettings {
  constructor(
    /**
     * The phase definitions containing the commands for each phase.
     */
    readonly phaseDefinitions: Partial<{
      [key in PipelinePhases]: IPhaseCommand[];
    }>,
  ) {}

  getCommands(...phases: PipelinePhases[]): string[] {
    return phases
      .map((phase) => this.phaseDefinitions[phase] ?? [])
      .flatMap((phaseCommands) => phaseCommands.map((cmd) => cmd.command));
  }
}

/**
 * Provides the phase commands
 */
export class PhaseCommandProvider implements IResourceProvider {
  scope? = Scope.PER_STAGE;

  provide(context: ResourceContext): any {
    const { phases } = context.blueprintProps;

    return new DefaultPhaseCommandSettings(phases);
  }
}
