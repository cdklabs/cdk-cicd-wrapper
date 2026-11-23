// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// `cdk-cicd mcp` -- serve the project's cdk-cicd-wrapper knowledge to a coding agent over the Model
// Context Protocol (stdio). Register it in the agent's MCP config as `npx --no cdk-cicd mcp`, started in
// the project directory (`--no`: never let npx fetch an unrelated registry package of the same name).
// See docs/content/mcp/index.md.

import * as yargs from 'yargs';
import { McpServer } from '../../mcp/server';
import { tools } from '../../mcp/tools';

const INSTRUCTIONS =
  'Tools for a project that uses @cdklabs/cdk-cicd-wrapper. check_config validates and summarizes ' +
  'cicd.config.ts / deploy.config.ts without calling AWS. describe_pipeline synthesizes the pipeline and ' +
  'lists its CodePipeline stages and actions; that synth may run CDK context lookups. Neither reads live ' +
  'pipeline state: for executions, logs and stack events use the AWS MCP servers, and for root-cause ' +
  'investigations use AWS DevOps Agent.';

class Command implements yargs.CommandModule {
  public command = 'mcp';
  public describe = 'Serve check_config and describe_pipeline to a coding agent over MCP (stdio)';

  public async handler() {
    // stdout carries the protocol and nothing else. Anything else that writes there -- the CLI logger,
    // a config file's console.log, ts-node -- goes to stderr instead, where MCP clients log it.
    const protocolWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = process.stderr.write.bind(process.stderr) as typeof process.stdout.write;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { version } = require('../../../package.json') as { version: string };
    // A client that already went away leaves a closed pipe; a late response must not crash the server.
    process.stdout.on('error', () => undefined);
    const server = new McpServer({ name: 'cdk-cicd', version }, tools(process.cwd()), INSTRUCTIONS);
    // Stopped by the client (SIGTERM) or by hand (SIGINT): stop running syntheses before exiting.
    const stop = () => void server.shutdown().then(() => process.exit(0));
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
    await server.serve(process.stdin, (line) => protocolWrite(line + '\n'));
  }
}

export default new Command();
