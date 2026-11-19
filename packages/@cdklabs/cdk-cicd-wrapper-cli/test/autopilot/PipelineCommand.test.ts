// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { defineDeployment, deploymentPipelineShapeFingerprint, Repository } from '@cdklabs/cdk-cicd-wrapper';
import { loadDeployment } from '../../src/cmds/autopilot/CicdConfig';
import { planDecisions, unitFingerprint } from '../../src/cmds/autopilot/PipelineCommand';

/**
 * A checked-out deploy repository: `dev` names its env in deploy.config, `prod` takes its account and
 * Region from config/prod.json only. Returns the dir and the environment `deploy-ci` gave the pipeline's
 * builds while both files were valid, computed exactly as the synth computes it.
 */
function deployRepository(dev = { account: '111111111111', region: 'eu-west-1' }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-cicd-pipeline-'));
  const config = defineDeployment({
    // Not an ECR image: no AWS call anywhere in these tests.
    image: 'registry.example.com/team/app:base',
    repository: Repository.codecommit('cfg'),
    targets: [
      { stage: 'dev', env: dev, manualApproval: false },
      { stage: 'prod', manualApproval: true },
    ],
  });
  fs.writeFileSync(path.join(dir, 'deploy.config.js'), `module.exports.default = ${JSON.stringify(config)};`);
  fs.mkdirSync(path.join(dir, 'config'));
  fs.writeFileSync(path.join(dir, 'config', 'dev.json'), JSON.stringify({ version: '1.0.0' }));
  fs.writeFileSync(
    path.join(dir, 'config', 'prod.json'),
    JSON.stringify({ version: '1.0.0', aws: { accountId: '222222222222', region: 'eu-central-1' } }),
  );

  const loaded = loadDeployment(dir)!;
  const environments = Object.fromEntries(
    loaded.targets.map((target) => [target.stage, { account: target.env.account!, regions: target.env.regions }]),
  );
  const env: NodeJS.ProcessEnv = {
    EXPECTED_DEPLOYMENT_TOPOLOGY: deploymentPipelineShapeFingerprint(loaded, environments, 'aws', 'hnb659fds'),
    CDK_CICD_TARGET_ENVIRONMENTS: JSON.stringify(environments),
    CDK_CICD_QUALIFIER: 'hnb659fds',
    CDK_CICD_PARTITION: 'aws',
    CDK_CICD_PLAN: JSON.stringify([
      { variable: 'CDK_CICD_RUN_1', stage: 'Deploy-1', units: [{ target: 'dev', parameter: '/state/dev' }] },
      { variable: 'CDK_CICD_RUN_2', stage: 'Deploy-2', units: [{ target: 'prod', parameter: '/state/prod' }] },
    ]),
  };
  const breakProd = () =>
    fs.writeFileSync(
      path.join(dir, 'config', 'prod.json'),
      JSON.stringify({ version: '1.0.0', aws: { accountId: '22222222222', region: 'eu-central-1' } }),
    );
  return { dir, env, breakProd };
}

describe('pipeline plan|fingerprint with one invalid config/<stage>.json', () => {
  test('both pass while every file is valid', () => {
    const { dir, env } = deployRepository();
    expect(planDecisions(dir, env, () => '').map((d) => [d.stage, d.run, d.reasons])).toEqual([
      ['Deploy-1', true, ['dev: never deployed']],
      ['Deploy-2', true, ['prod: never deployed']],
    ]);
    expect(unitFingerprint(dir, env, 'prod', undefined)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("a typo in prod's account fails prod alone: Plan still checks dev, and prod's own error is named", () => {
    const { dir, env, breakProd } = deployRepository();
    const devFingerprint = unitFingerprint(dir, env, 'dev', undefined);
    breakProd();

    const decisions = planDecisions(dir, env, (name) => (name === '/state/dev' ? devFingerprint : ''));
    expect(decisions[0]).toMatchObject({ stage: 'Deploy-1', run: false, reasons: ['dev: unchanged'] });
    expect(decisions[1].run).toBe(true);
    expect(decisions[1].reasons[0]).toMatch(
      /^prod: could not be checked \(cdk-cicd: config\/prod\.json aws\.accountId must be a 12-digit AWS account id\); running it$/,
    );
    // The deploy actions: dev's fingerprint is unaffected; prod's names the real problem.
    expect(unitFingerprint(dir, env, 'dev', undefined)).toBe(devFingerprint);
    expect(() => unitFingerprint(dir, env, 'prod', undefined)).toThrow(
      /config\/prod\.json aws\.accountId must be a 12-digit/,
    );
  });

  test('a real change to what the pipeline was built from still fails Plan, naming deploy-ci', () => {
    const { env } = deployRepository();
    const moved = deployRepository({ account: '111111111111', region: 'us-east-1' });
    expect(() => planDecisions(moved.dir, env, () => '')).toThrow(/re-run cdk-cicd deploy-ci/);
  });
});
