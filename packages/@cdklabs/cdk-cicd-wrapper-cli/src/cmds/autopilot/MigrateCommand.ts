// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// `cdk-cicd migrate` -- assist a Blueprint -> Autopilot migration. It does the SAFE, mechanical part: read the
// Blueprint entry file, extract the stage list and repository from the `PipelineBlueprint.builder()...synth(app)`
// chain, and generate a `cicd.config.ts` scaffold. It deliberately does NOT rewrite the user's entry
// file: pulling stack construction out of `.addStack({ provide(ctx){ new X(ctx.scope, ...) } })`
// callbacks and into a plain `App` is exactly the kind of transform that silently corrupts code when the
// shape is even slightly unusual. So it emits the config, reports what it could not determine, and
// prints the manual steps (move stacks to bin/, point cdk.json at `cdk-cicd exec`). See MIGRATION.md.

import { existsSync, readFileSync, writeFileSync } from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import * as yargs from 'yargs';
import { logger } from '../../utils/Logging';

/** What the analyzer could extract from a Blueprint entry file. */
export interface MigrationPlan {
  /** Stage names for `defineCICD`, lowercased. Empty if none could be found. */
  readonly stages: string[];
  /** A `Repository.*(...)` expression, or undefined when the source could not be determined. */
  readonly repository?: string;
  /** Things a human must resolve: unrecognized stages, missing repository, hooks/phases, etc. */
  readonly warnings: string[];
  /** True if a `PipelineBlueprint.builder()` chain was found at all. */
  readonly foundBuilder: boolean;
}

/** Blueprint's builder default when `.defineStages(...)` is absent (see PipelineBlueprint). */
const V2_DEFAULT_STAGES = ['res', 'dev', 'int'];

/**
 * Analyze a Blueprint entry file's source. Pure (no I/O) so it is unit-testable. Extracts the stage list and,
 * best-effort, the repository; records a warning for anything it cannot safely determine.
 */
export function analyzeV2Source(source: string): MigrationPlan {
  const sf = ts.createSourceFile('entry.ts', source, ts.ScriptTarget.Latest, true);
  const warnings: string[] = [];
  let foundBuilder = false;
  let stages: string[] | undefined;
  let sawWorkbench = false;
  let sawHooksOrPhases = false;

  const stageNamesFrom = (arg: ts.Expression): string[] | undefined => {
    if (!ts.isArrayLiteralExpression(arg)) return undefined;
    const names: string[] = [];
    for (const el of arg.elements) {
      if (ts.isStringLiteral(el)) {
        names.push(el.text.toLowerCase());
      } else if (ts.isPropertyAccessExpression(el)) {
        // `Stage.DEV` / `GlobalResources.X` -> take the member name, lowercased.
        names.push(el.name.text.toLowerCase());
      } else if (ts.isObjectLiteralExpression(el)) {
        // `{ stage: 'INT', ... }` -- pull the `stage` property.
        const stageProp = el.properties.find(
          (p): p is ts.PropertyAssignment =>
            ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'stage',
        );
        if (stageProp && ts.isStringLiteral(stageProp.initializer)) {
          names.push(stageProp.initializer.text.toLowerCase());
        } else {
          return undefined; // an object stage we cannot read -> bail so we do not emit a wrong list
        }
      } else {
        return undefined;
      }
    }
    return names;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const chainText = node.expression.getText(sf);
      if (chainText.includes('PipelineBlueprint.builder')) foundBuilder = true;

      if (method === 'defineStages' && node.arguments.length > 0) {
        const parsed = stageNamesFrom(node.arguments[0]);
        if (parsed) stages = parsed;
        else warnings.push('could not read defineStages(...) automatically -- set `stages` by hand');
      }
      if (method === 'workbench') sawWorkbench = true;
      if (method === 'definePhase' || method === 'addPreHook' || method === 'addPostHook') sawHooksOrPhases = true;
      // A repository provider is usually a class instance, not a literal, so we cannot reliably rewrite
      // it -- record that it needs manual attention rather than guess.
      if (method === 'repositoryProvider') {
        warnings.push('repositoryProvider(...) found -- set `repository: Repository.*(...)` by hand');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (foundBuilder && stages === undefined) {
    stages = [...V2_DEFAULT_STAGES];
    warnings.push(
      `no defineStages(...) found; used Blueprint's default (${V2_DEFAULT_STAGES.join(', ')}) -- confirm it`,
    );
  }
  // Repository extraction from the Blueprint source is not yet implemented, so it is always reported as unresolved.
  warnings.push('no repository could be determined -- set `repository: Repository.*(...)` in the config');
  if (sawWorkbench) warnings.push('workbench(...) has no pipeline equivalent -- use a direct `cdk deploy` for it');
  if (sawHooksOrPhases) warnings.push('phases/hooks found -- re-express them as `ci.steps` and stage hooks');

  return { stages: stages ?? [], repository: undefined, warnings, foundBuilder };
}

/** Render the `cicd.config.ts` a plan produces. `application` seeds `defineCICD`. */
export function renderCicdConfig(plan: MigrationPlan, application: string): string {
  const repo = plan.repository ?? "Repository.codecommit('TODO-your-repo') /* TODO: set your source */";
  const stages = plan.stages.length > 0 ? plan.stages.map((s) => `'${s}'`).join(', ') : "'dev', 'prod'";
  const todos = plan.warnings.map((w) => ` * TODO: ${w}`).join('\n');
  return `// Generated by \`cdk-cicd migrate\`. Review the TODOs below before using.
${todos ? `/*\n${todos}\n */\n` : ''}import { defineCICD, Repository } from '@cdklabs/cdk-cicd-wrapper';

export default defineCICD({
  application: '${application}',
  repository: ${repo},
  stages: [${stages}],
});
`;
}

class Command implements yargs.CommandModule {
  public command = 'migrate';
  public describe = 'Scaffold an Autopilot cicd.config.ts from a Blueprint PipelineBlueprint entry file';

  public builder(args: yargs.Argv) {
    return args
      .option('entry', { type: 'string', describe: 'The Blueprint entry file (default: read from cdk.json)' })
      .option('application', { type: 'string', describe: 'Application name for defineCICD', default: 'my-app' })
      .option('dry-run', { type: 'boolean', default: false, describe: 'Print the config instead of writing it' });
  }

  public async handler(args: yargs.Arguments) {
    const cwd = process.cwd();
    const entry = (args.entry as string | undefined) ?? entryFromCdkJson(cwd);
    if (entry === undefined) {
      logger.error('cdk-cicd migrate: could not find the entry file -- pass --entry <file>');
      process.exit(1);
    }
    const entryPath = path.isAbsolute(entry) ? entry : path.join(cwd, entry);
    if (!existsSync(entryPath)) {
      logger.error(`cdk-cicd migrate: entry file not found: ${entryPath}`);
      process.exit(1);
    }

    const plan = analyzeV2Source(readFileSync(entryPath, 'utf-8'));
    if (!plan.foundBuilder) {
      logger.error(`cdk-cicd migrate: no PipelineBlueprint.builder() chain found in ${entry} -- nothing to migrate`);
      process.exit(1);
    }

    const config = renderCicdConfig(plan, args.application as string);
    const target = path.join(cwd, 'cicd.config.ts');

    if (args.dryRun) {
      logger.info(`cdk-cicd migrate: would write ${target}:\n${config}`);
    } else if (existsSync(target)) {
      logger.error(`cdk-cicd migrate: ${target} already exists -- refusing to overwrite (use --dry-run to preview)`);
      process.exit(1);
    } else {
      writeFileSync(target, config);
      logger.info(`cdk-cicd migrate: wrote ${target}`);
    }

    plan.warnings.forEach((w) => logger.warn(`  needs attention: ${w}`));
    logger.info('cdk-cicd migrate: next, do these by hand (see MIGRATION.md):');
    logger.info('  1. In your entry file, drop the PipelineBlueprint.builder()...synth(app) chain and');
    logger.info('     construct your stacks directly on a plain `new App()` (keep the App at the end).');
    logger.info("  2. To KEEP already-deployed resources, match Blueprint's stack name so CloudFormation updates");
    logger.info('     in place instead of recreating: stackName: stageStackName(base, { stageFirst: true,');
    logger.info("     uppercaseStage: true }) reproduces Blueprint's `DEV-<name>`. Verify with `cdk diff` first.");
    logger.info('  3. Point cdk.json\'s "app" at: npx cdk-cicd exec <entry>');
    logger.info('  4. Provision the pipeline once: npx cdk-cicd deploy-ci');
  }
}

/** Best-effort: pull the `.ts` entry out of cdk.json's `app` command. */
function entryFromCdkJson(cwd: string): string | undefined {
  const cdkJson = path.join(cwd, 'cdk.json');
  if (!existsSync(cdkJson)) return undefined;
  try {
    const app = (JSON.parse(readFileSync(cdkJson, 'utf-8')).app as string) ?? '';
    const match = app.match(/(\S+\.ts)/);
    return match ? match[1] : undefined;
  } catch {
    return undefined;
  }
}

export default new Command();
