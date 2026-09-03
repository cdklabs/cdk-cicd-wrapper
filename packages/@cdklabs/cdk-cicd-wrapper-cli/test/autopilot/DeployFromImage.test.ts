// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { SpawnSyncReturns } from 'child_process';
import { ResolvedDeploymentConfig } from '@cdklabs/cdk-cicd-wrapper';
import {
  DockerSpawnOptions,
  dockerRunArgs,
  resolveTargetImage,
  runFromImage,
  targetRuns,
} from '../../src/cmds/autopilot/DeployFromImage';
import {
  CFN_EXEC_ROLE_FLAG,
  DEPLOY_ROLE_EXTERNAL_ID_FLAG,
  DEPLOY_ROLE_FLAG,
} from '../../src/cmds/autopilot/ExecCommand';

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
      cfnExecutionRole: 'arn:aws:iam::333333333333:role/cfn-exec',
      externalId: 'repo-2-external-id',
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
        'CDK_CICD_ACCOUNT_OVERRIDE=333333333333',
        'CDK_DEFAULT_ACCOUNT=333333333333',
        'CDK_DEPLOY_ACCOUNT=333333333333',
        'CDK_CICD_REGION_OVERRIDE=eu-west-1',
        'CDK_DEFAULT_REGION=eu-west-1',
        'CDK_DEPLOY_REGION=eu-west-1',
        'AWS_REGION=eu-west-1',
        'AWS_DEFAULT_REGION=eu-west-1',
        `${DEPLOY_ROLE_FLAG}=arn:aws:iam::333333333333:role/deployer`,
        `${CFN_EXEC_ROLE_FLAG}=arn:aws:iam::333333333333:role/cfn-exec`,
        DEPLOY_ROLE_EXTERNAL_ID_FLAG,
      ]),
    );
    expect(envPart).not.toContain(`${DEPLOY_ROLE_EXTERNAL_ID_FLAG}=repo-2-external-id`);
    expect(args).not.toContain('repo-2-external-id');
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

  test('an env-agnostic target clears image targets, inherits ambient values, and omits the inner --region', () => {
    const args = dockerRunArgs(IMAGE, { stage: 'dev' });
    const imageIdx = args.indexOf(IMAGE);
    expect(args.slice(2, imageIdx)).toEqual(
      expect.arrayContaining([
        'CDK_CICD_ACCOUNT_OVERRIDE=',
        'CDK_DEFAULT_ACCOUNT',
        'CDK_DEPLOY_ACCOUNT',
        'CDK_CICD_REGION_OVERRIDE=',
        'CDK_DEFAULT_REGION',
        'CDK_DEPLOY_REGION',
        'AWS_REGION',
        'AWS_DEFAULT_REGION',
      ]),
    );
    expect(args.slice(imageIdx + 1)).toEqual(['cdk-cicd', 'deploy', '--stage', 'dev', '--yes']);
  });

  test('no account emits an explicit clear while no deploy role still clears its role flags', () => {
    const args = dockerRunArgs(IMAGE, { stage: 'dev', region: 'us-west-2' });
    expect(args).toContain('CDK_CICD_ACCOUNT_OVERRIDE=');
    expect(args).toContain('CDK_DEFAULT_ACCOUNT');
    expect(args).not.toContain('--deploy-role');
    expect(args).toContain(`${DEPLOY_ROLE_FLAG}=`);
    expect(args).toContain(`${CFN_EXEC_ROLE_FLAG}=`);
    expect(args).toContain(`${DEPLOY_ROLE_EXTERNAL_ID_FLAG}=`);
    // region-only target still pins the region
    expect(args).toContain('CDK_DEFAULT_REGION=us-west-2');
  });
});

describe('m6-container: targetRuns', () => {
  test('a multi-region target expands to one run per region, carrying account and role', () => {
    const runs = targetRuns(
      {
        stage: 'prod',
        env: { account: '333333333333', regions: ['eu-west-1', 'us-east-1'], regionOrder: 'sequential' as any },
        manualApproval: true,
        deployment: {
          deployRole: 'arn:role/x',
          cfnExecutionRole: 'arn:role/cfn',
          externalId: 'resolve:secretsmanager:secret',
        },
      },
      'resolved-secret',
    );
    expect(runs).toEqual([
      {
        stage: 'prod',
        account: '333333333333',
        deployRole: 'arn:role/x',
        cfnExecutionRole: 'arn:role/cfn',
        externalId: 'resolved-secret',
        region: 'eu-west-1',
      },
      {
        stage: 'prod',
        account: '333333333333',
        deployRole: 'arn:role/x',
        cfnExecutionRole: 'arn:role/cfn',
        externalId: 'resolved-secret',
        region: 'us-east-1',
      },
    ]);
  });

  test('an env-agnostic target yields a single region-less run', () => {
    const runs = targetRuns({
      stage: 'dev',
      env: { account: undefined, regions: [], regionOrder: 'sequential' as any },
      manualApproval: false,
      deployment: undefined,
    });
    expect(runs).toEqual([
      {
        stage: 'dev',
        account: undefined,
        deployRole: undefined,
        cfnExecutionRole: undefined,
        externalId: undefined,
      },
    ]);
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
  test('a digest reference is preserved when no separate version is configured', () => {
    const digest = `repo/app@sha256:${'a'.repeat(64)}`;
    expect(resolveTargetImage(target('dev'), config(digest), '/x', () => undefined)).toBe(digest);
  });
  test('a digest reference plus a separate version is rejected instead of producing an invalid image', () => {
    const digest = `repo/app@sha256:${'a'.repeat(64)}`;
    expect(() => resolveTargetImage(target('dev'), config(digest), '/x', () => '1.5.0')).toThrow(
      /pinned by digest.*config\/dev\.json version '1\.5\.0'/,
    );
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

  test('runs the image once per target x region and returns 0 on success', async () => {
    const calls: string[][] = [];
    const spawn = (args: string[]) => {
      calls.push(args);
      return ok();
    };
    const code = await runFromImage(
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

  test('resolves each target version from config/<stage>.json at run time (base repo + version)', async () => {
    const calls: string[][] = [];
    const spawn = (args: string[]) => {
      calls.push(args);
      return ok();
    };
    const cfg = {
      image: 'acct.dkr.ecr.eu-west-1.amazonaws.com/app', // base repo, no tag
      targets: [{ stage: 'dev', env: { regions: ['us-west-2'], regionOrder: 'sequential' }, manualApproval: false }],
    } as unknown as ResolvedDeploymentConfig;
    const code = await runFromImage(cfg, { yes: true, spawn, readVersion: () => '9.9.9' });
    expect(code).toBe(0);
    expect(calls[0]).toContain('acct.dkr.ecr.eu-west-1.amazonaws.com/app:9.9.9');
  });

  test('resolves a target ExternalId before Docker and carries the complete Repo 2 role contract', async () => {
    const secretRef = 'resolve:secretsmanager:arn:aws:secretsmanager:eu-west-1:111111111111:secret:external';
    const resolvedExternalId = 'resolved-external-id';
    const calls: Array<{ args: string[]; options?: DockerSpawnOptions }> = [];
    const resolver = jest.fn(async () => resolvedExternalId);
    const cfg = {
      image: IMAGE,
      targets: [
        {
          stage: 'prod',
          env: { account: '333333333333', regions: ['eu-west-1'], regionOrder: 'sequential' },
          manualApproval: false,
          deployment: {
            deployRole: 'arn:aws:iam::333333333333:role/deployer',
            cfnExecutionRole: 'arn:aws:iam::333333333333:role/cfn-exec',
            externalId: secretRef,
          },
        },
      ],
    } as unknown as ResolvedDeploymentConfig;

    const code = await runFromImage(cfg, {
      yes: true,
      resolveExternalId: resolver,
      spawn: (args, options) => {
        calls.push({ args, options });
        return ok();
      },
    });

    expect(code).toBe(0);
    expect(resolver).toHaveBeenCalledWith(secretRef);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toContain(`${DEPLOY_ROLE_FLAG}=arn:aws:iam::333333333333:role/deployer`);
    expect(calls[0].args).toContain(`${CFN_EXEC_ROLE_FLAG}=arn:aws:iam::333333333333:role/cfn-exec`);
    expect(calls[0].args).toContain(DEPLOY_ROLE_EXTERNAL_ID_FLAG);
    expect(calls[0].args.join(' ')).not.toContain(secretRef);
    expect(calls[0].args.join(' ')).not.toContain(resolvedExternalId);
    expect(calls[0].options?.env?.[DEPLOY_ROLE_EXTERNAL_ID_FLAG]).toBe(resolvedExternalId);
  });

  test('an ExternalId secret-resolution failure stops before Docker', async () => {
    const calls: string[][] = [];
    const cfg = {
      image: IMAGE,
      targets: [
        {
          stage: 'prod',
          env: { regions: ['eu-west-1'], regionOrder: 'sequential' },
          manualApproval: false,
          deployment: {
            deployRole: 'arn:aws:iam::333333333333:role/deployer',
            externalId: 'resolve:secretsmanager:secret',
          },
        },
      ],
    } as unknown as ResolvedDeploymentConfig;

    const code = await runFromImage(cfg, {
      yes: true,
      resolveExternalId: async () => {
        throw new Error('AccessDenied');
      },
      spawn: (args) => {
        calls.push(args);
        return ok();
      },
    });

    expect(code).toBe(1);
    expect(calls).toHaveLength(0);
  });

  test('a digest image with a separate stage version fails before docker is invoked', async () => {
    const calls: string[][] = [];
    const digest = `acct.dkr.ecr.eu-west-1.amazonaws.com/app@sha256:${'a'.repeat(64)}`;
    const cfg = {
      image: digest,
      targets: [{ stage: 'dev', env: { regions: ['us-west-2'], regionOrder: 'sequential' }, manualApproval: false }],
    } as unknown as ResolvedDeploymentConfig;
    const code = await runFromImage(cfg, {
      yes: true,
      readVersion: () => '9.9.9',
      spawn: (args) => {
        calls.push(args);
        return ok();
      },
    });
    expect(code).toBe(1);
    expect(calls).toHaveLength(0);
  });

  test('--target deploys just that one target (its own image version)', async () => {
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
    const code = await runFromImage(cfg, { yes: true, target: 'dev', spawn });
    expect(code).toBe(0);
    // only dev ran, and it used the target's OWN image (not the config default)
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('acct.dkr.ecr.us-west-2.amazonaws.com/app:dev-42');
    expect(calls[0][calls[0].indexOf('--stage') + 1]).toBe('dev');
  });

  test('--target with an unknown stage errors', async () => {
    const code = await runFromImage(
      config([{ stage: 'dev', env: { regions: ['us-west-2'], regionOrder: 'sequential' }, manualApproval: false }]),
      {
        yes: true,
        target: 'nope',
        spawn: () => ok(),
      },
    );
    expect(code).toBe(1);
  });

  test('a target with no image (and no config default) errors', async () => {
    const cfg = {
      targets: [{ stage: 'dev', env: { regions: ['us-west-2'], regionOrder: 'sequential' }, manualApproval: false }],
    } as unknown as ResolvedDeploymentConfig;
    const code = await runFromImage(cfg, { yes: true, spawn: () => ok() });
    expect(code).toBe(1);
  });

  test('a gated target is refused without --yes, before any docker run', async () => {
    const calls: string[][] = [];
    const spawn = (args: string[]) => {
      calls.push(args);
      return ok();
    };
    const code = await runFromImage(
      config([{ stage: 'prod', env: { regions: ['eu-west-1'], regionOrder: 'sequential' }, manualApproval: true }]),
      {
        yes: false,
        spawn,
      },
    );
    expect(code).toBe(1);
    expect(calls).toHaveLength(0);
  });

  test('parallel regions launch together and propagate the first failure in configured order', async () => {
    const started: string[] = [];
    const pending = new Map<string, (result: SpawnSyncReturns<Buffer>) => void>();
    const spawn = (args: string[]) => {
      const region = args[args.indexOf('--region') + 1];
      started.push(region);
      return new Promise<SpawnSyncReturns<Buffer>>((resolve) => pending.set(region, resolve));
    };
    const deployment = runFromImage(
      config([
        {
          stage: 'prod',
          env: { regions: ['eu-west-1', 'us-east-1', 'ap-southeast-2'], regionOrder: 'parallel' },
          manualApproval: false,
        },
      ]),
      { yes: true, spawn },
    );

    expect(started).toEqual(['eu-west-1', 'us-east-1', 'ap-southeast-2']);
    pending.get('us-east-1')!({ ...ok(), status: 7 });
    pending.get('ap-southeast-2')!(ok());
    pending.get('eu-west-1')!({ ...ok(), status: 5 });

    expect(await deployment).toBe(5);
  });

  test('a later target waits for every parallel region of the preceding target', async () => {
    const started: string[] = [];
    const pending = new Map<string, (result: SpawnSyncReturns<Buffer>) => void>();
    const spawn = (args: string[]) => {
      const stage = args[args.indexOf('--stage') + 1];
      const region = args[args.indexOf('--region') + 1];
      started.push(`${stage}/${region}`);
      if (stage === 'dev') {
        return new Promise<SpawnSyncReturns<Buffer>>((resolve) => pending.set(region, resolve));
      }
      return ok();
    };
    const deployment = runFromImage(
      config([
        {
          stage: 'dev',
          env: { regions: ['eu-west-1', 'us-east-1'], regionOrder: 'parallel' },
          manualApproval: false,
        },
        {
          stage: 'prod',
          env: { regions: ['ap-southeast-2'], regionOrder: 'sequential' },
          manualApproval: false,
        },
      ]),
      { yes: true, spawn },
    );

    expect(started).toEqual(['dev/eu-west-1', 'dev/us-east-1']);
    pending.get('us-east-1')!(ok());
    await Promise.resolve();
    expect(started).toEqual(['dev/eu-west-1', 'dev/us-east-1']);
    pending.get('eu-west-1')!(ok());

    expect(await deployment).toBe(0);
    expect(started).toEqual(['dev/eu-west-1', 'dev/us-east-1', 'prod/ap-southeast-2']);
  });

  test('sequential regions preserve order and stop after the first failure', async () => {
    const started: string[] = [];
    const spawn = (args: string[]) => {
      const region = args[args.indexOf('--region') + 1];
      started.push(region);
      return { ...ok(), status: region === 'us-east-1' ? 2 : 0 } as SpawnSyncReturns<Buffer>;
    };
    const code = await runFromImage(
      config([
        {
          stage: 'prod',
          env: { regions: ['eu-west-1', 'us-east-1', 'ap-southeast-2'], regionOrder: 'sequential' },
          manualApproval: false,
        },
      ]),
      { yes: true, spawn },
    );
    expect(code).toBe(2);
    expect(started).toEqual(['eu-west-1', 'us-east-1']);
  });

  test('a spawn error returns 1', async () => {
    const spawn = () => ({ ...ok(), error: new Error('docker not found') }) as SpawnSyncReturns<Buffer>;
    const code = await runFromImage(
      config([{ stage: 'dev', env: { regions: [], regionOrder: 'sequential' }, manualApproval: false }]),
      {
        yes: true,
        spawn,
      },
    );
    expect(code).toBe(1);
  });
});
