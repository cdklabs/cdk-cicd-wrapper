// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// `cdk-cicd init` -- turn an existing CDK app (for example a fresh `cdk init app`) into an Autopilot app:
// write `cicd.config.ts` and point cdk.json's `app` at `cdk-cicd exec <entry>`. Those are the two edits
// the docs ask for. The app's own code is not modified: a stack that binds no account is reported by
// `cdk-cicd synth`, which is where the user sees it fail anyway.

import { existsSync, readFileSync, writeFileSync } from 'fs';
import * as path from 'path';
import * as yargs from 'yargs';
import { logger } from '../../utils/Logging';

/** The pipeline source `init` writes into `cicd.config.ts`. */
export type InitSource =
  | {
      readonly kind: 'codecommit';
      readonly repository: string;
      readonly branch: string;
      /** Import a repository that already exists instead of having `deploy-ci` create it. */
      readonly existing?: boolean;
    }
  | { readonly kind: 'codestar'; readonly repository: string; readonly connectionArn: string; readonly branch: string }
  | { readonly kind: 's3'; readonly object: string };

export interface InitOptions {
  readonly application: string;
  readonly source: InitSource;
  readonly stages: readonly string[];
  /** Bootstrap qualifier to pin, or undefined to let defineCICD derive one from `application`. */
  readonly qualifier?: string;
}

/** What `init` would change in a project. */
export interface InitPlan {
  readonly configPath: string;
  readonly config: string;
  readonly cdkJsonPath: string;
  /** The new cdk.json content, or undefined when its `app` already runs `cdk-cicd exec`. */
  readonly cdkJson?: string;
  readonly entry: string;
  readonly notes: string[];
}

/** The CDK default bootstrap qualifier: what `cdk bootstrap` creates unless told otherwise. */
export const DEFAULT_BOOTSTRAP_QUALIFIER = 'hnb659fds';

// Values are written into TypeScript string literals, so anything outside these sets is refused rather
// than escaped: a quote or newline in a repository name is a typo, not something to preserve.
const SAFE_VALUE = /^[A-Za-z0-9][A-Za-z0-9._\-/:@+=,]*$/;
const SAFE_STAGE = /^[A-Za-z][A-Za-z0-9-]*$/;
// The application names the pipeline stack (`<application>-pipeline`), whose name CloudFormation limits to
// [A-Za-z][-A-Za-z0-9]* and 128 characters; leave room for the suffix.
const SAFE_APPLICATION = /^[A-Za-z][A-Za-z0-9-]{0,99}$/;

/** The app entry of a cdk.json `app` command: its first `.ts`/`.js` argument. */
export function entryFromAppCommand(app: string): string | undefined {
  for (const token of app.split(/\s+/)) {
    if (!token.startsWith('-') && /\.(ts|js)$/.test(token)) return token;
  }
  return undefined;
}

function literal(value: string, what: string): string {
  if (!SAFE_VALUE.test(value)) {
    throw new Error(`cdk-cicd init: ${what} '${value}' may only contain letters, digits and ._-/:@+=,`);
  }
  return `'${value}'`;
}

function repositoryExpression(source: InitSource): string {
  switch (source.kind) {
    case 'codecommit': {
      const name = literal(source.repository, 'repository');
      if (source.existing === true) {
        return `Repository.codecommit(${name}, ${literal(source.branch, 'branch')}, { existing: true })`;
      }
      return source.branch === 'main'
        ? `Repository.codecommit(${name})`
        : `Repository.codecommit(${name}, ${literal(source.branch, 'branch')})`;
    }
    case 'codestar':
      return (
        `Repository.codestarConnection(${literal(source.repository, 'repository')}, ` +
        `${literal(source.connectionArn, 'connection ARN')}, ${literal(source.branch, 'branch')})`
      );
    case 's3':
      return `Repository.s3(${literal(source.object, 'S3 object')})`;
  }
}

/** The `cicd.config.ts` that `init` writes. */
export function renderInitConfig(options: InitOptions): string {
  if (options.stages.length === 0) throw new Error('cdk-cicd init: name at least one stage');
  for (const stage of options.stages) {
    if (!SAFE_STAGE.test(stage)) {
      throw new Error(
        `cdk-cicd init: stage '${stage}' must start with a letter and contain only letters, digits and -`,
      );
    }
  }
  if (!SAFE_APPLICATION.test(options.application)) {
    throw new Error(
      `cdk-cicd init: application '${options.application}' must start with a letter and contain only letters, ` +
        'digits and - (it names the pipeline stack); pass --application',
    );
  }
  const lines = [
    "import { defineCICD, Repository } from '@cdklabs/cdk-cicd-wrapper';",
    '',
    'export default defineCICD({',
    `  application: ${literal(options.application, 'application')},`,
  ];
  if (options.qualifier !== undefined) {
    if (options.qualifier === DEFAULT_BOOTSTRAP_QUALIFIER) {
      lines.push(
        '  // The qualifier a plain `cdk bootstrap` creates. Remove this line to use one derived from',
        '  // `application` instead; that one needs `cdk bootstrap --qualifier <it>` in every target account.',
      );
    }
    lines.push(`  qualifier: ${literal(options.qualifier, 'qualifier')},`);
  }
  if (options.source.kind === 'codecommit' && options.source.existing !== true) {
    lines.push(
      '  // Created by `cdk-cicd deploy-ci` as part of the pipeline stack: deleting that stack deletes the',
      '  // repository too. Create it yourself and use `--existing` to keep it independent of the pipeline.',
    );
  }
  lines.push(
    `  repository: ${repositoryExpression(options.source)},`,
    `  stages: [${options.stages.map((stage) => `'${stage}'`).join(', ')}],`,
    '});',
    '',
  );
  return lines.join('\n');
}

/** Read cdk.json, find the app entry, and work out both edits. Throws on anything it cannot do safely. */
export function initPlan(cwd: string, options: InitOptions, entryOverride?: string): InitPlan {
  const cdkJsonPath = path.join(cwd, 'cdk.json');
  if (!existsSync(cdkJsonPath)) {
    throw new Error(
      `cdk-cicd init: no cdk.json in ${cwd}. Run it inside a CDK app -- create one with ` +
        '`npx cdk init app --language typescript`.',
    );
  }
  const configPath = path.join(cwd, 'cicd.config.ts');
  if (existsSync(configPath) || existsSync(path.join(cwd, 'cicd.config.js'))) {
    throw new Error(`cdk-cicd init: ${cwd} already has a cicd.config -- refusing to overwrite it`);
  }
  let cdkJson: { [key: string]: unknown };
  try {
    cdkJson = JSON.parse(readFileSync(cdkJsonPath, 'utf-8'));
  } catch (error) {
    throw new Error(`cdk-cicd init: ${cdkJsonPath} is not valid JSON (${(error as Error).message})`);
  }
  const app = typeof cdkJson.app === 'string' ? cdkJson.app : '';
  const alreadyExec = /\bcdk-cicd exec\b/.test(app);
  const entry = entryOverride ?? entryFromAppCommand(app);
  if (entry === undefined) {
    throw new Error(
      `cdk-cicd init: cannot find the app entry in cdk.json's "app" (${app || 'empty'}) -- pass --entry <file>`,
    );
  }
  const entryPath = path.join(cwd, entry);
  if (!existsSync(entryPath)) throw new Error(`cdk-cicd init: the app entry ${entry} does not exist`);

  const notes: string[] = [];
  if (/^\s*\/\/\s*env:\s*\{\s*account:\s*process\.env\.CDK_DEFAULT_ACCOUNT/m.test(readFileSync(entryPath, 'utf-8'))) {
    notes.push(
      `${entry} has cdk init's env line commented out. Uncomment it: cdk-cicd deploys only a stack that ` +
        "binds its account. cdk-cicd synth warns about one that does not, and the pipeline's Build fails on it.",
    );
  }
  return {
    configPath,
    config: renderInitConfig(options),
    cdkJsonPath,
    cdkJson: alreadyExec
      ? undefined
      : `${JSON.stringify({ ...cdkJson, app: `npx cdk-cicd exec ${entry}` }, null, 2)}\n`,
    entry,
    notes,
  };
}

/** The commands that follow `init`, in order. */
export function nextSteps(options: InitOptions, region: string | undefined): string[] {
  const steps = [
    'npx cdk-cicd synth --all     # check every stage synthesizes',
    'npx cdk-cicd deploy-ci       # provision the pipeline (once; it updates itself from then on)',
  ];
  if (options.source.kind === 'codecommit') {
    const host = `https://git-codecommit.${region ?? '<region>'}.amazonaws.com`;
    steps.push(
      `git remote add origin ${host}/v1/repos/${options.source.repository}`,
      `git config credential.${host}.helper ''`,
      `git config --add credential.${host}.helper '!aws codecommit credential-helper $@'`,
      `git config credential.${host}.UseHttpPath true`,
      "git add -A && git commit -m 'Deliver the app through cdk-cicd-wrapper'",
      `git push -u origin HEAD:${options.source.branch}   # starts the first pipeline run`,
    );
  }
  return steps;
}

/** An application name from an npm package name: a stack name may not hold its scope, dots or underscores. */
export function applicationFromPackageName(name: string): string | undefined {
  const application = name
    .replace(/^@[^/]+\//, '')
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/^[^A-Za-z]+|-+$/g, '');
  return application.length > 0 ? application : undefined;
}

function packageName(cwd: string): string | undefined {
  try {
    const name = JSON.parse(readFileSync(path.join(cwd, 'package.json'), 'utf-8')).name;
    return typeof name === 'string' ? applicationFromPackageName(name) : undefined;
  } catch {
    return undefined;
  }
}

class Command implements yargs.CommandModule {
  public command = 'init';
  public describe =
    'Make an existing CDK app an Autopilot app: write cicd.config.ts and point cdk.json at cdk-cicd exec';

  public builder(args: yargs.Argv) {
    return args
      .option('application', { type: 'string', describe: 'Application name (default: package.json name)' })
      .option('source', {
        type: 'string',
        choices: ['codecommit', 'codestar', 's3'],
        default: 'codecommit',
        describe: 'Where the pipeline reads the code from',
      })
      .option('repository', {
        type: 'string',
        describe: 'CodeCommit repository name (default: the application) or CodeStar owner/repo',
      })
      .option('connection-arn', { type: 'string', describe: 'With --source codestar: the CodeStar connection ARN' })
      .option('s3-object', { type: 'string', describe: 'With --source s3: bucket/key.zip' })
      .option('existing', {
        type: 'boolean',
        default: false,
        describe: 'With --source codecommit: import an existing repository instead of having deploy-ci create it',
      })
      .option('branch', { type: 'string', default: 'main', describe: 'The branch the pipeline follows' })
      .option('stages', { type: 'string', default: 'dev', describe: 'Comma-separated stages, in deployment order' })
      .option('qualifier', {
        type: 'string',
        default: DEFAULT_BOOTSTRAP_QUALIFIER,
        describe: "Bootstrap qualifier ('derived' to let defineCICD derive one from the application)",
      })
      .option('entry', { type: 'string', describe: "The app entry (default: read from cdk.json's app)" })
      .option('dry-run', { type: 'boolean', default: false, describe: 'Print the changes instead of writing them' });
  }

  public async handler(args: yargs.Arguments) {
    const cwd = process.cwd();
    try {
      const application = (args.application as string | undefined) ?? packageName(cwd) ?? path.basename(cwd);
      const branch = args.branch as string;
      const kind = args.source as InitSource['kind'];
      let source: InitSource;
      if (kind === 'codestar') {
        const repository = args.repository as string | undefined;
        const connectionArn = args.connectionArn as string | undefined;
        if (repository === undefined || connectionArn === undefined) {
          throw new Error('cdk-cicd init: --source codestar needs --repository <owner/repo> and --connection-arn');
        }
        source = { kind, repository, connectionArn, branch };
      } else if (kind === 's3') {
        const object = args.s3Object as string | undefined;
        if (object === undefined) throw new Error('cdk-cicd init: --source s3 needs --s3-object <bucket/key.zip>');
        source = { kind, object };
      } else {
        source = {
          kind: 'codecommit',
          repository: (args.repository as string | undefined) ?? application,
          branch,
          existing: args.existing as boolean,
        };
      }
      const qualifier = args.qualifier as string;
      const options: InitOptions = {
        application,
        source,
        stages: (args.stages as string)
          .split(',')
          .map((stage) => stage.trim())
          .filter((stage) => stage.length > 0),
        qualifier: qualifier === 'derived' ? undefined : qualifier,
      };
      const plan = initPlan(cwd, options, args.entry as string | undefined);

      if (args.dryRun) {
        logger.info(`cdk-cicd init: would write ${plan.configPath}:\n${plan.config}`);
        if (plan.cdkJson !== undefined) {
          logger.info(`cdk-cicd init: would set cdk.json "app" to: npx cdk-cicd exec ${plan.entry}`);
        }
      } else {
        writeFileSync(plan.configPath, plan.config);
        logger.info(`cdk-cicd init: wrote ${plan.configPath}`);
        if (plan.cdkJson !== undefined) {
          writeFileSync(plan.cdkJsonPath, plan.cdkJson);
          logger.info(`cdk-cicd init: cdk.json "app" now runs: npx cdk-cicd exec ${plan.entry}`);
        }
      }
      plan.notes.forEach((note) => logger.warn(`cdk-cicd init: ${note}`));
      logger.info('cdk-cicd init: next steps:');
      nextSteps(options, process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION).forEach((step) =>
        logger.info(`  ${step}`),
      );
    } catch (error) {
      logger.error((error as Error).message);
      process.exit(1);
    }
  }
}

export default new Command();
