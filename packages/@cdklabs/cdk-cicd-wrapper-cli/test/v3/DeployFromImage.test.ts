// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { SpawnSyncReturns } from 'child_process';
import { ResolvedDeploymentConfig } from '@cdklabs/cdk-cicd-wrapper';
import { dockerRunArgs, resolveTargetImage, runFromImage, targetRuns } from '../../src/cmds/v3/DeployFromImage';

const IMAGE = 'acct.dkr.ecr.eu-west-1.amazonaws.com/my-app-deployer:1.4.2';

/** A fake successful docker spawn result. */
const ok = (): SpawnSyncReturns<Buffer> => ({
  status: 0,
  signal: null,
  output: [],
  pid: 1,
  stdout: Buffer.from(''),
  stderr: Buffer.from(''),
});

describe('m6-container: dockerRunArgs', () => {
  test('a full target renders env pins, creds-by-name, image and the inner single-region deploy', () => {
    const args = dockerRunArgs(IMAGE, {
      stage: 'prod',
      region: 'eu-west-1',
      account: '333333333333',
      deployRole: 'arn:aws:iam::333333333333:role/deployer',
    });

    // structure: docker run --rm <env...> <image> <inner cmd...>
    expect(args.slice(0, 2)).toEqual(['run', '--rm']);
    const imageIdx = args.indexOf(IMAGE);
    expect(imageIdx).toBeGreaterThan(1);

    const envPart = args.slice(2, imageIdx);
    // stage/account/region pins are literal name=value
    expect(envPart).toEqual(
      expect.arrayContaining([
        'CDK_STAGE=prod',
        'CDK_DEFAULT_ACCOUNT=333333333333',
        'CDK_DEPLOY_ACCOUNT=333333333333',
        'CDK_DEFAULT_REGION=eu-west-1',
        'CDK_DEPLOY_REGION=eu-west-1',
        'AWS_REGION=eu-west-1',
        'AWS_DEFAULT_REGION=eu-west-1',
      ]),
    );
    // credentials are passed by NAME only (inherited), never as name=value -- no secrets in argv
    expect(envPart).toEqual(
      expect.arrayContaining(['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']),
    );
    expect(envPart.some((e) => e.startsWith('AWS_ACCESS_KEY_ID='))).toBe(false);

    // inner command deploys the one stage, one region, with the forced role, non-interactively
    expect(args.slice(imageIdx + 1)).toEqual([
      'cdk-cicd',
      'deploy',
      '--stage',
      'prod',
      '--yes',
      '--region',
      'eu-west-1',
      '--deploy-role',
      'arn:aws:iam::333333333333:role/deployer',
    ]);
  });

  test('a network option inserts --network right after run --rm, before the env flags', () => {
    const args = dockerRunArgs(IMAGE, { stage: 'dev', region: 'us-west-2' }, { network: 'host' });
    expect(args.slice(0, 4)).toEqual(['run', '--rm', '--network', 'host']);
    // still a valid single deploy after the image
    const imageIdx = args.indexOf(IMAGE);
    expect(args.slice(imageIdx + 1)).toEqual([
      'cdk-cicd',
      'deploy',
      '--stage',
      'dev',
      '--yes',
      '--region',
      'us-west-2',
    ]);
  });

  test('no network option means no --network flag (default docker bridge)', () => {
    const args = dockerRunArgs(IMAGE, { stage: 'dev' });
    expect(args).not.toContain('--network');
  });

  test('a region-agnostic target omits every region pin and the inner --region', () => {
    const args = dockerRunArgs(IMAGE, { stage: 'dev' });
    expect(args.some((a) => a.startsWith('CDK_DEFAULT_REGION') || a.startsWith('AWS_REGION'))).toBe(false);
    const imageIdx = args.indexOf(IMAGE);
    expect(args.slice(imageIdx + 1)).toEqual(['cdk-cicd', 'deploy', '--stage', 'dev', '--yes']);
  });

  test('no account and no deploy role omit their pins/flags', () => {
    const args = dockerRunArgs(IMAGE, { stage: 'dev', region: 'us-west-2' });
    expect(args.some((a) => a.startsWith('CDK_DEFAULT_ACCOUNT'))).toBe(false);
    expect(args).not.toContain('--deploy-role');
    // region-only target still pins the region
    expect(args).toContain('CDK_DEFAULT_REGION=us-west-2');
  });
});

describe('m6-container: targetRuns', () => {
  test('a multi-region target expands to one run per region, carrying account and role', () => {
    const runs = targetRuns({
      stage: 'prod',
      env: { account: '333333333333', regions: ['eu-west-1', 'us-east-1'], regionOrder: 'sequential' as any },
      manualApproval: true,
      deployment: { deployRole: 'arn:role/x' },
    });
    expect(runs).toEqual([
      { stage: 'prod', account: '333333333333', deployRole: 'arn:role/x', region: 'eu-west-1' },
      { stage: 'prod', account: '333333333333', deployRole: 'arn:role/x', region: 'us-east-1' },
    ]);
  });

  test('an env-agnostic target yields a single region-less run', () => {
    const runs = targetRuns({
      stage: 'dev',
      env: { account: undefined, regions: [], regionOrder: 'sequential' as any },
      manualApproval: false,
      deployment: undefined,
    });
    expect(runs).toEqual([{ stage: 'dev', account: undefined, deployRole: undefined }]);
  });
});

describe('m6-container: resolveTargetImage (version from config/<stage>.json)', () => {
  const target = (stage: string, image?: string) =>
    ({ stage, env: { regions: [], regionOrder: 'sequential' }, manualApproval: false, image }) as any;
  const config = (image?: string) => ({ image, targets: [] }) as any;

  test('appends the config/<stage>.json version to the base repo', () => {
    expect(
      resolveTargetImage(target('dev'), config('acct.dkr.ecr.eu-west-1.amazonaws.com/app'), '/x', () => '1.5.0'),
    ).toBe('acct.dkr.ecr.eu-west-1.amazonaws.com/app:1.5.0');
  });
  test('replaces an existing tag on the base with the version (hash or semver)', () => {
    expect(resolveTargetImage(target('dev'), config('repo/app:base'), '/x', () => 'abc123')).toBe('repo/app:abc123');
  });
  test('no version file -> the base is used as-is', () => {
    expect(resolveTargetImage(target('dev'), config('repo/app:latest'), '/x', () => undefined)).toBe('repo/app:latest');
  });
  test('a target image overrides the config base repo', () => {
    expect(resolveTargetImage(target('dev', 'repo/app'), config('other/base'), '/x', () => '2.0.0')).toBe(
      'repo/app:2.0.0',
    );
  });
  test('no base image at all -> undefined', () => {
    expect(resolveTargetImage(target('dev'), config(undefined), '/x', () => '1.0.0')).toBeUndefined();
  });
});

describe('m6-container: runFromImage', () => {
  const config = (targets: any[]): ResolvedDeploymentConfig =>
    ({ image: IMAGE, targets }) as unknown as ResolvedDeploymentConfig;

  test('runs the image once per target x region and returns 0 on success', () => {
    const calls: string[][] = [];
    const spawn = (args: string[]) => {
      calls.push(args);
      return ok();
    };
    const code = runFromImage(
      config([
        { stage: 'dev', env: { regions: ['us-west-2'], regionOrder: 'sequential' }, manualApproval: false },
        {
          stage: 'prod',
          env: { account: '333333333333', regions: ['eu-west-1', 'us-east-1'], regionOrder: 'sequential' },
          manualApproval: true,
        },
      ]),
      { yes: true, spawn },
    );
    expect(code).toBe(0);
    // 1 (dev) + 2 (prod regions) = 3 docker runs
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => c[c.indexOf('--stage') + 1])).toEqual(['dev', 'prod', 'prod']);
  });

  test('resolves each target version from config/<stage>.json at run time (base repo + version)', () => {
    const calls: string[][] = [];
    const spawn = (args: string[]) => {
      calls.push(args);
      return ok();
    };
    const cfg = {
      image: 'acct.dkr.ecr.eu-west-1.amazonaws.com/app', // base repo, no tag
      targets: [{ stage: 'dev', env: { regions: ['us-west-2'], regionOrder: 'sequential' }, manualApproval: false }],
    } as unknown as ResolvedDeploymentConfig;
    const code = runFromImage(cfg, { yes: true, spawn, readVersion: () => '9.9.9' });
    expect(code).toBe(0);
    expect(calls[0]).toContain('acct.dkr.ecr.eu-west-1.amazonaws.com/app:9.9.9');
  });

  test('--target deploys just that one target (its own image version)', () => {
    const calls: string[][] = [];
    const spawn = (args: string[]) => {
      calls.push(args);
      return ok();
    };
    const cfg = {
      image: IMAGE,
      targets: [
        {
          stage: 'dev',
          env: { regions: ['us-west-2'], regionOrder: 'sequential' },
          manualApproval: false,
          image: 'acct.dkr.ecr.us-west-2.amazonaws.com/app:dev-42',
        },
        { stage: 'prod', env: { regions: ['eu-west-1'], regionOrder: 'sequential' }, manualApproval: true },
      ],
    } as unknown as ResolvedDeploymentConfig;
    const code = runFromImage(cfg, { yes: true, target: 'dev', spawn });
    expect(code).toBe(0);
    // only dev ran, and it used the target's OWN image (not the config default)
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('acct.dkr.ecr.us-west-2.amazonaws.com/app:dev-42');
    expect(calls[0][calls[0].indexOf('--stage') + 1]).toBe('dev');
  });

  test('--target with an unknown stage errors', () => {
    const code = runFromImage(
      config([{ stage: 'dev', env: { regions: ['us-west-2'], regionOrder: 'sequential' }, manualApproval: false }]),
      {
        yes: true,
        target: 'nope',
        spawn: () => ok(),
      },
    );
    expect(code).toBe(1);
  });

  test('a target with no image (and no config default) errors', () => {
    const cfg = {
      targets: [{ stage: 'dev', env: { regions: ['us-west-2'], regionOrder: 'sequential' }, manualApproval: false }],
    } as unknown as ResolvedDeploymentConfig;
    const code = runFromImage(cfg, { yes: true, spawn: () => ok() });
    expect(code).toBe(1);
  });

  test('a gated target is refused without --yes, before any docker run', () => {
    const calls: string[][] = [];
    const spawn = (args: string[]) => {
      calls.push(args);
      return ok();
    };
    const code = runFromImage(
      config([{ stage: 'prod', env: { regions: ['eu-west-1'], regionOrder: 'sequential' }, manualApproval: true }]),
      {
        yes: false,
        spawn,
      },
    );
    expect(code).toBe(1);
    expect(calls).toHaveLength(0);
  });

  test('a non-zero docker status is propagated and stops the run', () => {
    let n = 0;
    const spawn = () => {
      n += 1;
      return { ...ok(), status: n === 1 ? 0 : 2 } as SpawnSyncReturns<Buffer>;
    };
    const code = runFromImage(
      config([
        {
          stage: 'prod',
          env: { regions: ['eu-west-1', 'us-east-1'], regionOrder: 'sequential' },
          manualApproval: false,
        },
      ]),
      { yes: true, spawn },
    );
    expect(code).toBe(2);
    expect(n).toBe(2); // stopped after the failing second region, did not continue
  });

  test('a spawn error returns 1', () => {
    const spawn = () => ({ ...ok(), error: new Error('docker not found') }) as SpawnSyncReturns<Buffer>;
    const code = runFromImage(
      config([{ stage: 'dev', env: { regions: [], regionOrder: 'sequential' }, manualApproval: false }]),
      {
        yes: true,
        spawn,
      },
    );
    expect(code).toBe(1);
  });
});
