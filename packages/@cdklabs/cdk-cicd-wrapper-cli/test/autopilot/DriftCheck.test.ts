// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { analyzeManifest, checkAssembly } from '../../src/cmds/autopilot/DriftCheck';

function manifestWith(
  environment: string,
  roles: { assumeRoleArn?: string; cloudFormationExecutionRoleArn?: string } = {},
): any {
  return {
    artifacts: {
      TheStack: {
        type: 'aws:cloudformation:stack',
        environment,
        properties: roles,
      },
    },
  };
}

function diskManifestWith(
  environment: string,
  roles: { assumeRoleArn?: string; cloudFormationExecutionRoleArn?: string } = {},
): any {
  return {
    version: '41.0.0',
    artifacts: {
      TheStack: {
        type: 'aws:cloudformation:stack',
        environment,
        properties: { templateFile: 'TheStack.template.json', ...roles },
      },
    },
  };
}

const TARGET = { account: '111111111111', region: 'us-west-2', qualifier: 'hnb659fds' };
const DEPLOY_ROLE = 'arn:${AWS::Partition}:iam::111111111111:role/Deploy';
const CFN_EXEC_ROLE = 'arn:${AWS::Partition}:iam::111111111111:role/CfnExec';

describe('m3-drift-check: analyzeManifest', () => {
  test('an exact match is ok and deployable', () => {
    const r = analyzeManifest(manifestWith('aws://111111111111/us-west-2'), TARGET);
    expect(r.stacks[0].kind).toBe('ok');
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  test('an unknown account fails closed when the target account is configured', () => {
    const r = analyzeManifest(manifestWith('aws://unknown-account/unknown-region'), TARGET);
    expect(r.stacks[0].kind).toBe('account-mismatch');
    expect(r.errors).toHaveLength(1);
    expect(r.ok).toBe(false);
  });

  test('a region mismatch errors and blocks the deploy', () => {
    const r = analyzeManifest(manifestWith('aws://111111111111/eu-west-1'), TARGET);
    expect(r.stacks[0].kind).toBe('region-mismatch');
    expect(r.errors).toHaveLength(1);
    expect(r.ok).toBe(false);
  });

  test('an account mismatch errors and blocks the deploy', () => {
    const r = analyzeManifest(manifestWith('aws://000000000000/us-west-2'), TARGET);
    expect(r.stacks[0].kind).toBe('account-mismatch');
    expect(r.errors).toHaveLength(1);
    expect(r.ok).toBe(false);
  });

  test('with no target account, the account is not checked (region still is)', () => {
    const r = analyzeManifest(manifestWith('aws://999999999999/us-west-2'), {
      region: 'us-west-2',
      qualifier: 'hnb659fds',
    });
    expect(r.stacks[0].kind).toBe('ok');
    expect(r.ok).toBe(true);
  });

  test('with no target account, an unknown account is allowed when the concrete region matches', () => {
    const r = analyzeManifest(manifestWith('aws://unknown-account/us-west-2'), {
      region: 'us-west-2',
      qualifier: 'hnb659fds',
    });
    expect(r.stacks[0].kind).toBe('agnostic');
    expect(r.ok).toBe(true);
  });

  test('an unknown region does not hide a foreign concrete account', () => {
    const r = analyzeManifest(manifestWith('aws://000000000000/unknown-region'), TARGET);
    expect(r.stacks[0].kind).toBe('account-mismatch');
    expect(r.ok).toBe(false);
  });

  test('an unknown region is allowed only after the concrete account matches', () => {
    const r = analyzeManifest(manifestWith('aws://111111111111/unknown-region'), TARGET);
    expect(r.stacks[0].kind).toBe('agnostic');
    expect(r.ok).toBe(true);
  });

  test('the hardcoded-env shape (foreign account AND region) is an account-mismatch, not just a warning', () => {
    // Mirrors hardcoded-env-app: env baked to 000000000000/eu-west-1. Account wins -> abort.
    const r = analyzeManifest(manifestWith('aws://000000000000/eu-west-1'), TARGET);
    expect(r.stacks[0].kind).toBe('account-mismatch');
    expect(r.ok).toBe(false);
  });

  test('a multi-stack assembly is not deployable if ANY stack account-mismatches', () => {
    const manifest = {
      artifacts: {
        Good: { type: 'aws:cloudformation:stack', environment: 'aws://111111111111/us-west-2' },
        Bad: { type: 'aws:cloudformation:stack', environment: 'aws://000000000000/us-west-2' },
      },
    };
    const r = analyzeManifest(manifest, TARGET);
    expect(r.stacks).toHaveLength(2);
    expect(r.ok).toBe(false);
  });

  test('accepts the exact configured deployment and CloudFormation execution roles', () => {
    const r = analyzeManifest(
      manifestWith('aws://111111111111/us-west-2', {
        assumeRoleArn: DEPLOY_ROLE,
        cloudFormationExecutionRoleArn: CFN_EXEC_ROLE,
      }),
      {
        ...TARGET,
        deployRoleArn: DEPLOY_ROLE,
        cloudFormationExecutionRoleArn: CFN_EXEC_ROLE,
      },
    );
    expect(r.stacks[0]).toMatchObject({
      kind: 'ok',
      deployRoleArn: DEPLOY_ROLE,
      cloudFormationExecutionRoleArn: CFN_EXEC_ROLE,
    });
    expect(r.ok).toBe(true);
  });

  test('permits the exact APP_STAGING Bootstrapless support stack alongside configured application roles', () => {
    const support = {
      id: 'StagingStack-payments-v2-111111111111-us-west-2',
      stackName: 'StagingStack-payments-v2',
      deployRoleArn: 'arn:${AWS::Partition}:iam::111111111111:role/cdk-hnb659fds-deploy-role-111111111111-us-west-2',
      cloudFormationExecutionRoleArn:
        'arn:${AWS::Partition}:iam::111111111111:role/cdk-hnb659fds-cfn-exec-role-111111111111-us-west-2',
    };
    const r = analyzeManifest(
      {
        artifacts: {
          Application: {
            type: 'aws:cloudformation:stack',
            environment: 'aws://111111111111/us-west-2',
            properties: { assumeRoleArn: DEPLOY_ROLE, cloudFormationExecutionRoleArn: CFN_EXEC_ROLE },
          },
          [support.id]: {
            type: 'aws:cloudformation:stack',
            environment: 'aws://111111111111/us-west-2',
            properties: {
              stackName: support.stackName,
              assumeRoleArn: support.deployRoleArn,
              cloudFormationExecutionRoleArn: support.cloudFormationExecutionRoleArn,
            },
          },
        },
      },
      {
        ...TARGET,
        deployRoleArn: DEPLOY_ROLE,
        cloudFormationExecutionRoleArn: CFN_EXEC_ROLE,
        appStagingSupportStack: support,
      },
    );
    expect(r.stacks.map((stack) => stack.kind)).toEqual(['ok', 'ok']);
    expect(r.ok).toBe(true);
  });

  test('keeps application role drift blocked when an APP_STAGING support stack is allowed', () => {
    const support = {
      id: 'StagingStack-payments-v2-111111111111-us-west-2',
      stackName: 'StagingStack-payments-v2',
      deployRoleArn: 'arn:${AWS::Partition}:iam::111111111111:role/cdk-hnb659fds-deploy-role-111111111111-us-west-2',
      cloudFormationExecutionRoleArn:
        'arn:${AWS::Partition}:iam::111111111111:role/cdk-hnb659fds-cfn-exec-role-111111111111-us-west-2',
    };
    const r = analyzeManifest(
      {
        artifacts: {
          Application: {
            type: 'aws:cloudformation:stack',
            environment: 'aws://111111111111/us-west-2',
            properties: { assumeRoleArn: support.deployRoleArn, cloudFormationExecutionRoleArn: CFN_EXEC_ROLE },
          },
          [support.id]: {
            type: 'aws:cloudformation:stack',
            environment: 'aws://111111111111/us-west-2',
            properties: {
              stackName: support.stackName,
              assumeRoleArn: support.deployRoleArn,
              cloudFormationExecutionRoleArn: support.cloudFormationExecutionRoleArn,
            },
          },
        },
      },
      {
        ...TARGET,
        deployRoleArn: DEPLOY_ROLE,
        cloudFormationExecutionRoleArn: CFN_EXEC_ROLE,
        appStagingSupportStack: support,
      },
    );
    expect(r.stacks[0].kind).toBe('deploy-role-mismatch');
    expect(r.stacks[1].kind).toBe('ok');
    expect(r.ok).toBe(false);
  });

  test('rejects a modified APP_STAGING support-stack base role', () => {
    const support = {
      id: 'StagingStack-payments-v2-111111111111-us-west-2',
      stackName: 'StagingStack-payments-v2',
      deployRoleArn: 'arn:${AWS::Partition}:iam::111111111111:role/cdk-hnb659fds-deploy-role-111111111111-us-west-2',
      cloudFormationExecutionRoleArn:
        'arn:${AWS::Partition}:iam::111111111111:role/cdk-hnb659fds-cfn-exec-role-111111111111-us-west-2',
    };
    const r = analyzeManifest(
      {
        artifacts: {
          [support.id]: {
            type: 'aws:cloudformation:stack',
            environment: 'aws://111111111111/us-west-2',
            properties: {
              stackName: support.stackName,
              assumeRoleArn: 'arn:${AWS::Partition}:iam::111111111111:role/cdk-hnb659fds-deploy-role-modified',
              cloudFormationExecutionRoleArn: support.cloudFormationExecutionRoleArn,
            },
          },
        },
      },
      {
        ...TARGET,
        deployRoleArn: DEPLOY_ROLE,
        cloudFormationExecutionRoleArn: CFN_EXEC_ROLE,
        appStagingSupportStack: support,
      },
    );
    expect(r.stacks[0].kind).toBe('deploy-role-mismatch');
    expect(r.ok).toBe(false);
  });

  test('fails closed when the configured deployment role is missing or changed in the assembly', () => {
    const missing = analyzeManifest(manifestWith('aws://111111111111/us-west-2'), {
      ...TARGET,
      deployRoleArn: DEPLOY_ROLE,
    });
    expect(missing.stacks[0].kind).toBe('deploy-role-mismatch');
    expect(missing.errors[0]).toMatch(/missing the configured deployment role/);

    const changed = analyzeManifest(
      manifestWith('aws://111111111111/us-west-2', {
        assumeRoleArn: 'arn:aws:iam::111111111111:role/OtherDeploy',
      }),
      { ...TARGET, deployRoleArn: DEPLOY_ROLE },
    );
    expect(changed.stacks[0].kind).toBe('deploy-role-mismatch');
    expect(changed.errors[0]).toMatch(/expected/);
  });

  test('fails closed when the configured CloudFormation execution role changes', () => {
    const r = analyzeManifest(
      manifestWith('aws://111111111111/us-west-2', {
        cloudFormationExecutionRoleArn: 'arn:aws:iam::111111111111:role/OtherCfnExec',
      }),
      { ...TARGET, cloudFormationExecutionRoleArn: CFN_EXEC_ROLE },
    );
    expect(r.stacks[0].kind).toBe('cfn-execution-role-mismatch');
    expect(r.ok).toBe(false);
  });

  test('rejects a synthesized role in a foreign account even without an exact configured role', () => {
    const deploy = analyzeManifest(
      manifestWith('aws://111111111111/us-west-2', {
        assumeRoleArn: 'arn:aws:iam::222222222222:role/Deploy',
      }),
      TARGET,
    );
    expect(deploy.stacks[0].kind).toBe('deploy-role-mismatch');
    expect(deploy.errors[0]).toMatch(/account 222222222222.*stage target is 111111111111/);

    const cfn = analyzeManifest(
      manifestWith('aws://111111111111/us-west-2', {
        cloudFormationExecutionRoleArn: 'arn:aws:iam::222222222222:role/CfnExec',
      }),
      TARGET,
    );
    expect(cfn.stacks[0].kind).toBe('cfn-execution-role-mismatch');
  });

  test('accepts CDK default-role ARNs with an unresolved partition and the concrete target account', () => {
    const r = analyzeManifest(
      manifestWith('aws://111111111111/us-west-2', {
        assumeRoleArn: 'arn:${AWS::Partition}:iam::111111111111:role/cdk-hnb659fds-deploy-role',
        cloudFormationExecutionRoleArn: 'arn:${AWS::Partition}:iam::111111111111:role/cdk-hnb659fds-cfn-exec-role',
      }),
      TARGET,
    );
    expect(r.stacks[0].kind).toBe('ok');
    expect(r.ok).toBe(true);
  });

  test('accepts role environment placeholders retained by an environment-agnostic stack', () => {
    const r = analyzeManifest(
      manifestWith('aws://111111111111/unknown-region', {
        assumeRoleArn: 'arn:${AWS::Partition}:iam::111111111111:role/cdk-shop-deploy-role-111111111111-${AWS::Region}',
      }),
      {
        ...TARGET,
        deployRoleArn: 'arn:${AWS::Partition}:iam::111111111111:role/cdk-shop-deploy-role-111111111111-us-west-2',
      },
    );
    expect(r.stacks[0].kind).toBe('agnostic');
    expect(r.ok).toBe(true);
  });

  test('requires qualifier placeholders to resolve to the configured effective qualifier', () => {
    const matching = analyzeManifest(
      manifestWith('aws://111111111111/us-west-2', {
        assumeRoleArn: 'arn:${AWS::Partition}:iam::111111111111:role/cdk-ctxqual-deploy-role-111111111111-us-west-2',
      }),
      {
        ...TARGET,
        qualifier: 'ctxqual',
        deployRoleArn:
          'arn:${AWS::Partition}:iam::111111111111:role/cdk-${Qualifier}-deploy-role-111111111111-us-west-2',
      },
    );
    expect(matching.stacks[0].kind).toBe('ok');
    expect(matching.ok).toBe(true);

    const changed = analyzeManifest(
      manifestWith('aws://111111111111/us-west-2', {
        assumeRoleArn: 'arn:${AWS::Partition}:iam::111111111111:role/cdk-other-deploy-role-111111111111-us-west-2',
      }),
      {
        ...TARGET,
        qualifier: 'ctxqual',
        deployRoleArn:
          'arn:${AWS::Partition}:iam::111111111111:role/cdk-${Qualifier}-deploy-role-111111111111-us-west-2',
      },
    );
    expect(changed.stacks[0].kind).toBe('deploy-role-mismatch');
    expect(changed.ok).toBe(false);
  });

  test('requires repeated qualifier placeholders to resolve to the same identifier', () => {
    const matching = analyzeManifest(
      manifestWith('aws://111111111111/us-west-2', {
        assumeRoleArn: 'arn:${AWS::Partition}:iam::111111111111:role/ctxqual/ctxqual',
      }),
      {
        ...TARGET,
        qualifier: 'ctxqual',
        deployRoleArn: 'arn:${AWS::Partition}:iam::111111111111:role/${Qualifier}/${Qualifier}',
      },
    );
    expect(matching.stacks[0].kind).toBe('ok');
    expect(matching.ok).toBe(true);

    const r = analyzeManifest(
      manifestWith('aws://111111111111/us-west-2', {
        assumeRoleArn: 'arn:${AWS::Partition}:iam::111111111111:role/ctxqual/other',
      }),
      {
        ...TARGET,
        qualifier: 'ctxqual',
        deployRoleArn: 'arn:${AWS::Partition}:iam::111111111111:role/${Qualifier}/${Qualifier}',
      },
    );
    expect(r.stacks[0].kind).toBe('deploy-role-mismatch');
    expect(r.ok).toBe(false);
  });

  test('non-stack artifacts (assets, tree) are skipped', () => {
    const manifest = {
      artifacts: {
        Assets: { type: 'cdk:asset-manifest' },
        Tree: { type: 'cdk:tree' },
        Stack: { type: 'aws:cloudformation:stack', environment: 'aws://111111111111/us-west-2' },
      },
    };
    const r = analyzeManifest(manifest, TARGET);
    expect(r.stacks.map((s) => s.stack)).toEqual(['Stack']);
  });
});

describe('m3-drift-check: checkAssembly', () => {
  test('reads manifest.json from the assembly dir', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'manifest.json'),
        JSON.stringify(diskManifestWith('aws://000000000000/us-west-2')),
      );
      expect(checkAssembly(dir, TARGET).ok).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('recurses through an actual synthesized cdk.Stage and blocks its foreign-account stack', () => {
    // aws-cdk-lib is the wrapper package's installed peer and is used here only as the schema oracle.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, import/no-extraneous-dependencies
    const cdk: any = require('aws-cdk-lib');
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-stage-'));
    try {
      const app = new cdk.App({ outdir: outDir });
      const stage = new cdk.Stage(app, 'Prod', {
        env: { account: '000000000000', region: TARGET.region },
      });
      new cdk.Stack(stage, 'Foreign', { stackName: 'foreign-prod-stack' });
      app.synth();

      const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf-8'));
      expect(Object.values<any>(manifest.artifacts)).toContainEqual(
        expect.objectContaining({
          type: 'cdk:cloud-assembly',
          properties: expect.objectContaining({ directoryName: expect.any(String) }),
        }),
      );

      const result = checkAssembly(outDir, TARGET);
      expect(result.ok).toBe(false);
      expect(result.stacks).toHaveLength(1);
      expect(result.stacks[0]).toMatchObject({
        account: '000000000000',
        region: TARGET.region,
        kind: 'account-mismatch',
      });
      expect(result.stacks[0].stack).toContain('assembly-Prod/');
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  test('fails closed when a deployable assembly contains no stacks', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-empty-'));
    try {
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version: '41.0.0', artifacts: {} }));
      expect(() => checkAssembly(dir, TARGET)).toThrow(/contains no deployable CloudFormation stacks/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('throws a clear error when there is no assembly', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-'));
    try {
      expect(() => checkAssembly(dir, TARGET)).toThrow(/synth first/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rejects an unsupported cloud-assembly schema version before traversing artifacts', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-version-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'manifest.json'),
        JSON.stringify({ ...diskManifestWith('aws://111111111111/us-west-2'), version: '999.0.0' }),
      );
      expect(() => checkAssembly(dir, TARGET)).toThrow(/Maximum schema version supported.*999\.0\.0/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('accepts schema version 48 assemblies supported by the installed CDK CLI', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-version-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'manifest.json'),
        JSON.stringify({ ...diskManifestWith('aws://111111111111/us-west-2'), version: '48.0.0' }),
      );
      expect(checkAssembly(dir, TARGET).ok).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rejects a malformed stack artifact before creating a partial deployment plan', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-malformed-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'manifest.json'),
        JSON.stringify({
          version: '41.0.0',
          artifacts: {
            Broken: {
              type: 'aws:cloudformation:stack',
              environment: 'aws://111111111111/us-west-2',
              properties: {},
            },
          },
        }),
      );
      expect(() => checkAssembly(dir, TARGET)).toThrow(/Invalid assembly manifest|templateFile/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
