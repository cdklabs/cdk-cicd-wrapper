// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The tools `cdk-cicd mcp` serves. What only this package knows is how a cicd.config.ts /
// deploy.config.ts resolves and which pipeline it renders, so that is what these tools report; live
// pipeline state (executions, CodeBuild logs, stack events) is what the AWS-provided MCP servers and AWS
// DevOps Agent are for.
//
// Both tools run the project's own code, as the CLI does: check_config loads the config file in this
// process, and describe_pipeline runs the project's `cdk` script. So both are confined to the directory
// the server was started in, and describe_pipeline is not advertised as read-only: a synth can perform
// CDK context lookups with the caller's AWS credentials and write cdk.context.json.

import { ChildProcess, spawn } from 'child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import type { ResolvedCicdConfig, ResolvedDeploymentConfig } from '@cdklabs/cdk-cicd-wrapper';
import { errorResult, McpTool, textResult, ToolResult } from './server';
import { load, loadDeployment } from '../cmds/autopilot/CicdConfig';
import { listCiArgs, readAssemblyTemplates } from '../cmds/autopilot/ListCiCommand';

const DIRECTORY_SCHEMA = {
  type: 'object',
  properties: {
    directory: {
      type: 'string',
      description:
        'Project directory holding cdk.json and the config file, inside the directory the server was started ' +
        'in. Defaults to that directory.',
    },
  },
  additionalProperties: false,
};

/** Synth of the pipeline app can take minutes on a cold project; past this the tool gives up. */
const SYNTH_TIMEOUT_MS = 10 * 60 * 1000;
/** How long a synth gets to exit after SIGTERM before it is killed outright. */
const KILL_GRACE_MS = 5000;

/**
 * The project directory a call targets: `directory` resolved against `root` (the server's working
 * directory), which it must not leave. A model can be steered by what it reads, and both tools run the
 * target's code, so an argument must not be able to point them at some other checkout. Unknown argument
 * names are rejected rather than ignored. Exported for tests.
 */
export function projectDir(args: Record<string, unknown>, root: string): string {
  const unknown = Object.keys(args).filter((key) => key !== 'directory');
  if (unknown.length > 0) {
    throw new Error(`Unknown argument(s): ${unknown.join(', ')}. The only argument is directory.`);
  }
  const dir = args.directory;
  if (dir !== undefined && typeof dir !== 'string') throw new Error('directory must be a string');
  const resolved = path.resolve(root, dir ?? '.');
  if (!existsSync(resolved)) throw new Error(`directory ${resolved} does not exist`);
  const realRoot = realpathSync(root);
  const real = realpathSync(resolved);
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
    throw new Error(`directory must be inside ${realRoot}, the directory the server was started in`);
  }
  return resolved;
}

/**
 * The server is long-lived, and `require` caches modules, so an edited config would otherwise keep
 * answering with its first version. Drop every cached module of the project itself (not its
 * node_modules) before a load.
 */
function forgetProjectModules(dir: string): void {
  // require.cache is keyed by REAL path, so a project reached through a symlink (macOS's /var ->
  // /private/var, a symlinked checkout) has to be matched by its realpath as well.
  const roots = new Set(
    [dir, existsSync(dir) ? realpathSync(dir) : dir].map((d) => (d.endsWith(path.sep) ? d : d + path.sep)),
  );
  for (const file of Object.keys(require.cache)) {
    const root = [...roots].find((prefix) => file.startsWith(prefix));
    if (root !== undefined && !file.slice(root.length).split(path.sep).includes('node_modules')) {
      delete require.cache[file];
    }
  }
}

/** The resolved pipeline config, reduced to what explains the pipeline. It holds no secret values. */
export function summarizeCicd(config: ResolvedCicdConfig): object {
  return {
    application: config.application,
    qualifier: config.qualifier,
    engine: config.engine,
    pipelineStackName: config.pipelineStackName ?? (config.application ? `${config.application}-pipeline` : undefined),
    repository: {
      type: config.repository.repositoryType,
      name: config.repository.name,
      branch: config.repository.branch,
    },
    stages: config.stages.map((stage) => ({
      name: stage.name,
      account: stage.env.account ?? '(pipeline account)',
      regions: stage.env.regions.length > 0 ? stage.env.regions : '(pipeline Region)',
      manualApproval: stage.manualApproval,
    })),
    ci: {
      steps: Object.keys(config.ci.steps).length > 0 ? config.ci.steps : '(engine default CI commands)',
      synthStages: config.ci.synthStages,
      image: config.ci.image,
    },
    deployModel: config.deployModel,
    asyncDeploy: config.asyncDeploy,
    express: config.express ?? false,
    containerMode: config.deployerImage !== undefined ? 'Repo 1: builds and pushes a deployer image' : false,
    plugins: config.plugins === undefined ? '(default-on set)' : config.plugins.map((plugin) => plugin.name),
    network: { vpc: config.vpc !== undefined, proxy: config.proxy !== undefined },
    privateRegistries: {
      codeArtifact: config.codeArtifact !== undefined,
      npmRegistry: config.npmRegistry !== undefined,
    },
    complianceLogBucketName: config.complianceLogBucketName,
    devopsAgent: config.devopsAgent ?? false,
  };
}

/** The resolved Repo 2 deployment config, reduced the same way. */
export function summarizeDeployment(config: ResolvedDeploymentConfig): object {
  return {
    application: config.application,
    qualifier: config.qualifier,
    image: config.image,
    repository: config.repository
      ? { type: config.repository.repositoryType, name: config.repository.name, branch: config.repository.branch }
      : '(none: local `cdk-cicd deploy --from-image` only)',
    targets: config.targets.map((target) => ({
      stage: target.stage,
      account: target.env.account,
      regions: target.env.regions,
      manualApproval: target.manualApproval,
      image: target.image ?? '(default image)',
      autoDeploy: target.autoDeploy ?? false,
    })),
    devopsAgent: config.devopsAgent ?? false,
  };
}

/** One config file: load it, check it is a define*() result, summarize it -- or say why not. */
function report<T>(
  file: string,
  loader: (dir: string) => T | undefined,
  isResolved: (value: unknown) => boolean,
  summarize: (config: T) => object,
  dir: string,
): { summary?: object; error?: string } | undefined {
  try {
    const config = loader(dir);
    if (config === undefined) return undefined;
    if (!isResolved(config)) {
      return {
        error: `${file} does not export the result of ${file === 'cicd.config' ? 'defineCICD' : 'defineDeployment'}(...)`,
      };
    }
    return { summary: summarize(config) };
  } catch (error) {
    return { error: `${file} does not validate: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Load and validate the project's config files, each on its own: a broken deploy.config does not hide
 * a valid cicd.config. A validation error is the answer, not a crash.
 */
export async function checkConfig(dir: string): Promise<ToolResult> {
  forgetProjectModules(dir);
  const files = {
    'cicd.config': report<ResolvedCicdConfig>(
      'cicd.config',
      load,
      (c: any) => Array.isArray(c?.stages) && c?.repository !== undefined,
      summarizeCicd,
      dir,
    ),
    'deploy.config': report<ResolvedDeploymentConfig>(
      'deploy.config',
      loadDeployment,
      (c: any) => Array.isArray(c?.targets),
      summarizeDeployment,
      dir,
    ),
  };
  const found = Object.entries(files).filter(([, result]) => result !== undefined) as Array<
    [string, { summary?: object; error?: string }]
  >;
  if (found.length === 0) return errorResult(`No cicd.config.ts/.js or deploy.config.ts/.js in ${dir}.`);
  const errors = found.filter(([, result]) => result.error !== undefined);
  const body = {
    valid: errors.length === 0,
    ...Object.fromEntries(found.map(([file, result]) => [file, result.summary ?? { error: result.error }])),
  };
  return errors.length === 0 ? textResult(body) : errorResult(JSON.stringify(body, null, 2));
}

interface PipelineAction {
  readonly name: string;
  readonly category?: string;
  readonly provider?: string;
  readonly region?: string;
}

/** A name from a template: literal, or a CloudFormation token (CDK Pipelines names its source action one). */
function label(value: unknown): string {
  return typeof value === 'string' ? value : '(resolved at deploy time)';
}

/** The pipelines, stages and actions in a synthesized pipeline assembly. Pure; exported for tests. */
export function describeTemplates(stacks: Array<{ stackName: string; template: any }>): object {
  const pipelines: object[] = [];
  let forwarder: object | false = false;
  const skills: string[] = [];
  for (const { stackName, template } of stacks) {
    for (const resource of Object.values<any>(template?.Resources ?? {})) {
      if (resource?.Type === 'AWS::CodePipeline::Pipeline') {
        const props = resource.Properties ?? {};
        pipelines.push({
          stack: stackName,
          name: label(props.Name),
          stages: (props.Stages ?? []).map((stage: any) => ({
            name: label(stage.Name),
            actions: (stage.Actions ?? []).map((action: any): PipelineAction => ({
              name: label(action.Name),
              category: action.ActionTypeId?.Category,
              provider: action.ActionTypeId?.Provider,
              ...(typeof action.Region === 'string' ? { region: action.Region } : {}),
            })),
          })),
        });
      }
      if (resource?.Type === 'AWS::DevOpsAgent::Asset' && typeof resource.Properties?.Metadata?.name === 'string') {
        skills.push(resource.Properties.Metadata.name);
      }
      const env = resource?.Type === 'AWS::Lambda::Function' ? resource.Properties?.Environment?.Variables : undefined;
      if (env?.AGENT_SPACE_ID !== undefined) {
        forwarder = { stack: stackName, agentSpaceId: env.AGENT_SPACE_ID, region: env.AGENT_SPACE_REGION };
      }
    }
  }
  return { pipelines, devopsAgentForwarder: forwarder, devopsAgentSkills: skills };
}

/** Stop a synth and everything it started: SIGTERM to its process group, then SIGKILL after a grace period. */
function stopTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  const send = (signal: NodeJS.Signals) => {
    try {
      if (process.platform === 'win32') child.kill(signal);
      else process.kill(-child.pid!, signal); // the child leads its own process group (detached)
    } catch {
      // already gone
    }
  };
  send('SIGTERM');
  setTimeout(() => send('SIGKILL'), KILL_GRACE_MS).unref();
}

function run(
  cmd: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; signal: AbortSignal },
): Promise<{ code: number; log: string }> {
  return new Promise((resolve) => {
    // Never inherit stdout: it is this server's protocol channel. Detached, so the whole process tree
    // (npm, cdk, the app) can be stopped together.
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    let log = '';
    const keep = (chunk: Buffer) => {
      log = (log + chunk.toString('utf-8')).slice(-8000);
    };
    child.stdout?.on('data', keep);
    child.stderr?.on('data', keep);
    const stop = () => stopTree(child);
    const timer = setTimeout(stop, SYNTH_TIMEOUT_MS);
    options.signal.addEventListener('abort', stop, { once: true });
    const settle = (code: number, extra = '') => {
      clearTimeout(timer);
      options.signal.removeEventListener('abort', stop);
      resolve({ code, log: log + extra });
    };
    child.on('error', (error) => settle(-1, error.message));
    child.on('close', (code) => settle(code ?? -1));
  });
}

/** Synthesize the pipeline the way `cdk-cicd list-ci` does and describe what it contains. */
export async function describePipeline(dir: string, signal: AbortSignal): Promise<ToolResult> {
  const outdir = mkdtempSync(path.join(tmpdir(), 'cdk-cicd-mcp-'));
  try {
    const { code, log } = await run('npm', listCiArgs(outdir), {
      cwd: dir,
      env: { ...process.env, CDK_CICD_MODE: 'pipeline' },
      signal,
    });
    if (signal.aborted) return errorResult('describe_pipeline was cancelled; the synth was stopped.');
    if (code !== 0) {
      return errorResult(`Synthesizing the pipeline in ${dir} failed (exit ${code}). Last output:\n${log}`);
    }
    return textResult(describeTemplates(readAssemblyTemplates(outdir)));
  } finally {
    rmSync(outdir, { recursive: true, force: true });
  }
}

export function tools(cwd: string): McpTool[] {
  return [
    {
      name: 'check_config',
      description:
        'Load and validate the cdk-cicd-wrapper config of a project (cicd.config.ts for the pipeline, ' +
        'deploy.config.ts for a container-mode Repo 2) exactly as the cdk-cicd CLI does, and summarize it: ' +
        'source repository, stages with their accounts and Regions, approval gates, CI steps, deploy model, ' +
        'network, plugins and the DevOps Agent levels. A config that fails validation returns the error. ' +
        'Loading a config runs that file, as the CLI does; it makes no AWS calls.',
      inputSchema: DIRECTORY_SCHEMA,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      call: async (args) => checkConfig(projectDir(args, cwd)),
    },
    {
      name: 'describe_pipeline',
      description:
        'Synthesize the pipeline that `cdk-cicd deploy-ci` would provision (no deploy) and list each ' +
        'CodePipeline with its stages and actions, plus what is connected to AWS DevOps Agent (the forwarder, and the skills the knowledge level publishes). ' +
        "It runs the project's `cdk` npm script, so CDK context lookups (for example a VPC lookup) use the " +
        'AWS credentials of the server process and may write cdk.context.json. Slow: a full `cdk synth`. Use ' +
        'the pipeline and action names to look up live executions with the AWS MCP servers.',
      inputSchema: DIRECTORY_SCHEMA,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      call: async (args, signal) => describePipeline(projectDir(args, cwd), signal),
    },
  ];
}
