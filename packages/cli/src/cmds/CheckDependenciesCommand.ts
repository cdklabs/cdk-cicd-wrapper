// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-console */
import { spawnSync } from 'child_process';
import * as path from 'path';
import * as yargs from 'yargs';

const CHECK_DEPENDENCIES_PYTHON = '../../scripts/check-deps-python.sh';
const CHECK_DEPENDENCIES_NPM = 'better-npm-audit@3.7.3';

class Command implements yargs.CommandModule {
  command = 'check-dependencies';

  describe = 'Audit dependencies';

  builder(args: yargs.Argv) {
    args.option('python', {
      type: 'boolean',
      default: false,
      description: 'Audit python dependencies',
    });

    args.option('npm', {
      type: 'boolean',
      default: false,
      description: 'Audit NPM dependencies',
    });

    return args;
  }
  handler(args: yargs.Arguments) {
    if (args.python) {
      console.log('Auditing Python dependencies');
      const command = path.join(__dirname, CHECK_DEPENDENCIES_PYTHON);

      const result = spawnSync(command, { stdio: 'inherit' });

      if (result.error) {
        throw result.error;
      }
    }

    if (args.npm) {
      console.log('Auditing NPM dependencies');

      const result = spawnSync(
        'npx',
        [CHECK_DEPENDENCIES_NPM, 'audit', '--level=high', '--registry=https://registry.npmjs.org/'],
        { stdio: 'inherit' },
      );

      if (result.error) {
        throw result.error;
      }
    }
  }
}

export default new Command();
