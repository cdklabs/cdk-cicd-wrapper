// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// `cdk-cicd check [checks..]` -- the Blueprint default-on CI checks (validate, audit, license, security)
// behind ONE command, so a CI job runs `npx cdk-cicd check` instead of the user project having to
// define the matching npm scripts first (Blueprint needed `npm run validate` / `audit:deps` / `license` and
// package.json surgery to create them).
//
// Every check DELEGATES to the published Blueprint command that already implements it, run as a child
// `cdk-cicd <Blueprint command>` process. Spawning rather than calling the Blueprint handler in-process is
// deliberate: most of those handlers signal failure with `yargs.exit`/`process.exit`, which in-process
// would take the umbrella down mid-run; as children their exit codes are just data, so `check` can run
// all of them and report every failure at once.
//
// A check the project has no baseline (or no dependency manifest) for is SKIPPED, not failed:
// `cdk-cicd check` on a freshly `cdk init`-ed project has to pass, and a checksum check with no
// recorded checksum can only ever fail. Every skip is logged with its reason, and the closing summary
// says what ran and what was skipped -- a skipped check never reads as a passed one.

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import * as path from 'path';
import * as yargs from 'yargs';
import { CliHelpers } from '../../utils/CliHelpers';
import { logger } from '../../utils/Logging';

/** The checks `cdk-cicd check` runs when no name is given, in execution order. */
export const CHECK_NAMES = ['validate', 'audit', 'license', 'security'];

/** What one check will do in this project: the Blueprint argv to run, or the reason it does not apply. */
export interface CheckPlan {
  /** The check name, one of CHECK_NAMES. */
  readonly name: string;
  /** The `cdk-cicd` argv implementing the check. Absent when the check is skipped. */
  readonly args?: string[];
  /** Why the check does not apply here. Absent when the check runs. */
  readonly skip?: string;
}

/**
 * The file `validate` and `license` keep their approved-baseline checksums in. Its mere EXISTENCE is
 * what decides whether those two checks apply, deliberately: nothing creates it but `validate --fix`
 * and `license --fix`, so "absent" means nobody has approved a baseline yet (the fresh project this
 * command has to pass), while "present" means the project opted in and the checks must run.
 *
 * Looking inside it instead -- skipping when a particular key is missing -- would make each gate
 * disable-able by deleting the very key it guards, and would turn an unparseable file into a skip. In
 * both cases the Blueprint command exits 1 and `check` would have gone green: a false pass on a project that
 * IS configured, which is strictly worse than a noisy failure. So the content is Blueprint's business.
 */
const VERIFICATION_FILE = 'package-verification.json';

/** Lock files `cdk-cicd validate` can checksum. */
const LOCK_FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock'];

/** Lock files `check-dependencies --npm` can audit: `npm audit` cannot read a `yarn.lock`. */
const NPM_LOCK_FILES = ['package-lock.json', 'npm-shrinkwrap.json'];

/** Manifests `check-dependencies --python` can audit: its script only ever resolves `Pipfile`s. */
const PYTHON_FILES = ['Pipfile'];

function hasAny(cwd: string, files: string[]): boolean {
  return files.some((file) => existsSync(path.join(cwd, file)));
}

/**
 * `validate` compares the lock file against the checksum approved in the verification file, so it
 * needs both to exist -- with no approved baseline at all there is nothing to validate against.
 */
function planValidate(cwd: string): CheckPlan {
  if (!hasAny(cwd, LOCK_FILES)) {
    return { name: 'validate', skip: `no lock file (${LOCK_FILES.join(', ')})` };
  }
  if (!hasAny(cwd, [VERIFICATION_FILE])) {
    return { name: 'validate', skip: `no ${VERIFICATION_FILE} (run 'cdk-cicd validate --fix')` };
  }
  return { name: 'validate', args: ['validate'] };
}

/**
 * `audit` audits the dependency ecosystems the underlying tools can actually resolve here. A yarn-only
 * or requirements.txt-only project gets no auditable manifest, and saying so beats a green run that
 * audited nothing.
 */
function planAudit(cwd: string): CheckPlan {
  const args = ['check-dependencies'];
  if (hasAny(cwd, NPM_LOCK_FILES)) {
    args.push('--npm');
  }
  if (hasAny(cwd, PYTHON_FILES)) {
    args.push('--python');
  }
  return args.length > 1
    ? { name: 'audit', args }
    : {
        name: 'audit',
        skip: `no auditable dependency manifest (${[...NPM_LOCK_FILES, ...PYTHON_FILES].join(', ')})`,
      };
}

/**
 * `license` fails whenever the collected licenses differ from the approved `license` section of the
 * verification file -- including when there is no section at all, which is every project that has not
 * run `cdk-cicd license --fix` yet. Without a verification file there is nothing to compare, so skip.
 *
 * Note the deliberate strictness: a project that ran `validate --fix` but never `license --fix` HAS a
 * verification file, so `license` runs and fails. That is exactly what Blueprint does, and it is the point --
 * the alternative silently drops the licence gate on a half-configured project.
 */
function planLicense(cwd: string): CheckPlan {
  return hasAny(cwd, [VERIFICATION_FILE])
    ? { name: 'license', args: ['license'] }
    : { name: 'license', skip: `no ${VERIFICATION_FILE} (run 'cdk-cicd license --fix')` };
}

/**
 * `security` needs no project baseline, so it always runs; its scanners are opt-in flags in Blueprint, so
 * turn them all on. It does need python at run time (venv creation, then bandit/semgrep install), so
 * probe for it and skip with a reason rather than let a toolchain gap read as a security finding.
 * Registry access for the actual installs is still not something a file probe can establish.
 */
function planSecurity(): CheckPlan {
  if (!CliHelpers.isPythonAvailable()) {
    return { name: 'security', skip: 'no python (or python3) on PATH -- required by the security scanners' };
  }
  return { name: 'security', args: ['security-scan', '--bandit', '--shellcheck', '--semgrep'] };
}

const PLANNERS: { [name: string]: (cwd: string) => CheckPlan } = {
  validate: planValidate,
  audit: planAudit,
  license: planLicense,
  security: planSecurity,
};

/**
 * Plan the named checks against this project. Order follows `names`.
 *
 * @throws Error on a name that is not a known check.
 */
export function planChecks(names: string[], cwd: string): CheckPlan[] {
  return names.map((name) => {
    const planner = PLANNERS[name];
    if (planner === undefined) {
      throw new Error(`unknown check '${name}' -- valid checks are: ${CHECK_NAMES.join(', ')}`);
    }
    return planner(cwd);
  });
}

/**
 * Run the planned checks with `run`, returning the names that failed. Every planned check runs even
 * after one fails, so CI reports all of them in a single pass.
 */
export function runPlans(plans: CheckPlan[], run: (plan: CheckPlan) => number): string[] {
  const failed: string[] = [];
  for (const plan of plans) {
    if (plan.args === undefined) {
      logger.info(`cdk-cicd check: skipping ${plan.name} -- ${plan.skip}`);
      continue;
    }
    logger.info(`cdk-cicd check: ${plan.name} (cdk-cicd ${plan.args.join(' ')})`);
    const status = run(plan);
    if (status !== 0) {
      logger.error(`cdk-cicd check: ${plan.name} failed (exit ${status})`);
      failed.push(plan.name);
    }
  }
  return failed;
}

/** Run one check as a child `cdk-cicd` process and return its exit code. */
function spawnCheck(plan: CheckPlan, cwd: string): number {
  const cli = require.resolve('../../index');
  const result = spawnSync(process.execPath, [cli, ...plan.args!], { stdio: 'inherit', cwd });
  if (result.error) {
    logger.error(`cdk-cicd check: could not run ${plan.name}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

class Command implements yargs.CommandModule {
  public command = 'check [checks..]';
  public describe = 'Run the default-on CI checks (validate, audit, license, security)';

  public builder(args: yargs.Argv) {
    return args.positional('checks', {
      type: 'string',
      array: true,
      describe: `Checks to run; defaults to all of: ${CHECK_NAMES.join(', ')}`,
    });
  }

  public async handler(args: yargs.Arguments) {
    const cwd = process.cwd();
    const requested = (args.checks as string[] | undefined) ?? [];
    const names = requested.length > 0 ? requested : CHECK_NAMES;

    let plans: CheckPlan[];
    try {
      plans = planChecks(names, cwd);
    } catch (error) {
      logger.error(`cdk-cicd check: ${(error as Error).message}`);
      process.exit(1);
    }

    const failed = runPlans(plans, (plan) => spawnCheck(plan, cwd));
    if (failed.length > 0) {
      logger.error(`cdk-cicd check: failing checks: ${failed.join(', ')}`);
      process.exit(1);
    }
    // Name what actually ran and what did not: 'all checks passed' would be a lie on a project where
    // three of the four were skipped for want of a baseline.
    const skipped = plans.filter((plan) => plan.args === undefined).map((plan) => plan.name);
    const passed = plans.filter((plan) => plan.args !== undefined).map((plan) => plan.name);
    logger.info(
      `cdk-cicd check: passed ${passed.length > 0 ? passed.join(', ') : 'nothing'}` +
        (skipped.length > 0 ? `; skipped ${skipped.join(', ')}` : ''),
    );
  }
}

export default new Command();
