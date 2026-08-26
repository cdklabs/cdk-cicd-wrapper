// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Unit tests for the `cdk-cicd check` umbrella: planning (which Blueprint command each check delegates to,
// and when a check is skipped instead) and running (failure collection). The actual check execution is
// injected, so nothing here shells out to npm/python/semgrep.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CHECK_NAMES, CheckPlan, planChecks, runPlans } from '../../src/cmds/autopilot/CheckCommand';
import { CliHelpers } from '../../src/utils/CliHelpers';

const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

/** A throwaway project directory containing exactly the given files. */
function project(files: { [name: string]: string }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-cicd-check-'));
  Object.entries(files).forEach(([name, content]) => fs.writeFileSync(path.join(dir, name), content));
  dirs.push(dir);
  return dir;
}

/** A project with every baseline the checks need: lock file + both verification-file sections. */
const CONFIGURED = {
  'package-lock.json': '{}',
  'package-verification.json': JSON.stringify({
    'npm-lock-file': 'abc123',
    license: { 'package.json': 'def456' },
  }),
};

describe('m4-ci-checks: planChecks', () => {
  test('a configured npm project runs all four checks, each delegating to its Blueprint command', () => {
    const plans = planChecks(CHECK_NAMES, project(CONFIGURED));

    expect(plans.map((p) => p.name)).toEqual(['validate', 'audit', 'license', 'security']);
    expect(plans.map((p) => p.args)).toEqual([
      ['validate'],
      ['check-dependencies', '--npm'],
      ['license'],
      ['security-scan', '--bandit', '--shellcheck', '--semgrep'],
    ]);
    expect(plans.every((p) => p.skip === undefined)).toBe(true);
  });

  test('a single name plans only that check', () => {
    expect(planChecks(['license'], project(CONFIGURED))).toEqual([{ name: 'license', args: ['license'] }]);
  });

  test('an unknown check name is a clear error naming the valid checks', () => {
    expect(() => planChecks(['lint'], project(CONFIGURED))).toThrow(
      "unknown check 'lint' -- valid checks are: validate, audit, license, security",
    );
  });

  test('a fresh project skips the baseline-dependent checks rather than failing them', () => {
    // Nothing has been approved yet: no lock-file checksum, no license baseline.
    const plans = planChecks(CHECK_NAMES, project({ 'package.json': '{}' }));

    const skipped = plans.filter((p) => p.args === undefined);
    expect(skipped.map((p) => p.name)).toEqual(['validate', 'audit', 'license']);
    expect(skipped.every((p) => (p.skip ?? '').length > 0)).toBe(true);
    // security needs no baseline, so it still runs on a fresh project.
    expect(plans.find((p) => p.name === 'security')!.args).toBeDefined();
  });

  test('validate is skipped only when there is no lock file at all', () => {
    const dir = project({ 'package-verification.json': '{}' });
    expect(planChecks(['validate'], dir)[0].skip).toContain('no lock file');
  });

  test('a gate is NOT disable-able by deleting the key it guards from the verification file', () => {
    // The false green this replaced: keying the skip on an individual key meant removing
    // 'npm-lock-file' (or the 'license' section) turned a Blueprint exit-1 into a green `check`, on a project
    // that plainly IS configured. Presence of the file is the opt-in; its content is Blueprint's business.
    const noLockKey = project({
      'package-lock.json': '{}',
      'package-verification.json': JSON.stringify({ license: {} }),
    });
    expect(planChecks(['validate'], noLockKey)[0].args).toEqual(['validate']);

    const noLicenseSection = project({
      'package-lock.json': '{}',
      'package-verification.json': JSON.stringify({ 'npm-lock-file': 'abc123' }),
    });
    expect(planChecks(['license'], noLicenseSection)[0].args).toEqual(['license']);
  });

  test('security is skipped with a reason when python is not on PATH', () => {
    const spy = jest.spyOn(CliHelpers, 'isPythonAvailable').mockReturnValue(false);
    const [plan] = planChecks(['security'], project(CONFIGURED));
    spy.mockRestore();

    expect(plan.args).toBeUndefined();
    expect(plan.skip).toContain('python');
  });

  test('audit selects the ecosystems the underlying tools can audit here', () => {
    expect(planChecks(['audit'], project({ 'npm-shrinkwrap.json': '{}' }))[0].args).toEqual([
      'check-dependencies',
      '--npm',
    ]);
    expect(planChecks(['audit'], project({ Pipfile: '' }))[0].args).toEqual(['check-dependencies', '--python']);
    expect(planChecks(['audit'], project({ 'package-lock.json': '{}', Pipfile: '' }))[0].args).toEqual([
      'check-dependencies',
      '--npm',
      '--python',
    ]);
  });

  test('audit skips the manifests the Blueprint tools cannot audit (yarn.lock, requirements.txt)', () => {
    // `npm audit` refuses a yarn-only project and the python script only ever resolves Pipfiles, so
    // both would otherwise be an error or a green run that audited nothing.
    const [yarnOnly] = planChecks(['audit'], project({ 'yarn.lock': '' }));
    expect(yarnOnly.args).toBeUndefined();
    expect(yarnOnly.skip).toContain('no auditable dependency manifest');
    expect(planChecks(['audit'], project({ 'requirements.txt': '' }))[0].args).toBeUndefined();
  });

  test('a corrupt verification file still runs the checks, so Blueprint reports the corruption', () => {
    // Skipping here would convert two Blueprint exit-1s into a green run. `check` does not parse the file at
    // all now, so the malformed content reaches the tool whose job it is to complain about it.
    const dir = project({ 'package-lock.json': '{}', 'package-verification.json': '{"npm-lock-file": "abc",' });
    expect(planChecks(['validate', 'license'], dir).map((p) => p.args)).toEqual([['validate'], ['license']]);
  });
});

describe('m4-ci-checks: runPlans', () => {
  const plansFor = (): CheckPlan[] => planChecks(CHECK_NAMES, project(CONFIGURED));

  test('runs every planned check and reports no failures when they all pass', () => {
    const run = jest.fn().mockReturnValue(0);

    expect(runPlans(plansFor(), run)).toEqual([]);
    expect(run.mock.calls.map(([plan]) => plan.name)).toEqual(['validate', 'audit', 'license', 'security']);
  });

  test('a skipped check is never executed', () => {
    const run = jest.fn().mockReturnValue(0);

    expect(runPlans(planChecks(CHECK_NAMES, project({ 'package.json': '{}' })), run)).toEqual([]);
    expect(run.mock.calls.map(([plan]) => plan.name)).toEqual(['security']);
  });

  test('a non-zero check is reported as failed and the remaining checks still run', () => {
    const run = jest.fn((plan: CheckPlan) => (plan.name === 'audit' ? 1 : 0));

    expect(runPlans(plansFor(), run)).toEqual(['audit']);
    expect(run).toHaveBeenCalledTimes(4);
  });

  test('every failing check ends up in the report', () => {
    expect(runPlans(plansFor(), () => 2)).toEqual(['validate', 'audit', 'license', 'security']);
  });
});
