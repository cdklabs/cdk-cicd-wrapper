// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-console */
import { spawnSync } from 'child_process';
import * as path from 'path';
import * as yargs from 'yargs';

const CONFIGURE_SCRIPT = '../../scripts/configure.sh';

class Command implements yargs.CommandModule {
  command = 'configure';

  describe = 'Configures the CDK-CICD-Wrapper pipeline';

  builder(args: yargs.Argv) {
    return args;
  }
  handler() {
    const command = path.join(__dirname, CONFIGURE_SCRIPT);

    const result = spawnSync(command, { stdio: 'inherit' });

    if (result.error) {
      throw result.error;
    }
  }
}

export default new Command();
