// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-console */
import * as yargs from 'yargs';
import checkDependencies from './cmds/CheckDependenciesCommand';
import complianceBucket from './cmds/ComplianceBucketCommand';
import configure from './cmds/ConfigureCommand';
import license from './cmds/LicenseCommand';
import security from './cmds/SecurityCommand';
import validate from './cmds/ValidateCommand';

async function main() {
  const ya = yargs;
  ya.command(configure);
  ya.command(validate);
  ya.command(license);
  ya.command(complianceBucket);
  ya.command(security);
  ya.command(checkDependencies);

  ya.recommendCommands();
  ya.strictCommands();

  ya.showHelpOnFail(true);
  ya.wrap(yargs.terminalWidth());
  ya.options('debug', { type: 'boolean', default: false, desc: 'Debug logs' });
  ya.completion();
  ya.help();
  ya.demandCommand();

  // do not use the default yargs '--version' implementation since it is
  // global by default (it appears on all subcommands)
  ya.version(false);
  ya.option('version', {
    type: 'boolean',
    description: 'Show version number',
    global: false,
  });

  const args = await ya.argv;

  if (args.debug) {
    process.env.DEBUG = 'true';
  }
}

main().catch((e) => {
  console.error(e.stack);
  process.exit(1);
});
