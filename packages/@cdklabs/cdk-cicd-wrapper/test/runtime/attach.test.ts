// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// attach.test.ts deliberately does NOT import register.ts -- it exercises the explicit escape
// hatch on a STOCK, unpatched App, which is the bundled/ESM situation attach exists for.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { App, Aspects, IAspect, Stack, Stage } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { AwsSolutionsChecks } from 'cdk-nag';
import { IConstruct } from 'constructs';
import { AppConfig, CdkCicd } from '../../src';
import {
  appsConstructed,
  COMPLIANCE_LOG_BUCKET_ACCOUNT_FLAG,
  COMPLIANCE_LOG_BUCKET_NAME_FLAG,
  COMPLIANCE_LOG_BUCKET_REGION_FLAG,
} from '../../src/runtime/inject';
import { DEFAULT_LOG_RETENTION_DAYS } from '../../src/support/LogRetentionAspect';

describe('m2-attach: CdkCicd.attach', () => {
  test('applies cdk-nag to a stock (unwrapped) App', () => {
    const app = new App();
    expect(Aspects.of(app).all.some((a) => a instanceof AwsSolutionsChecks)).toBe(false);

    CdkCicd.attach(app);

    expect(Aspects.of(app).all.some((a) => a instanceof AwsSolutionsChecks)).toBe(true);
  });

  test('applies injected cicd:config tags to the synthesized template', () => {
    const app = new App({ context: { [AppConfig.CONTEXT_KEY]: { tags: { Owner: 'attach', Stage: 'prod' } } } });
    CdkCicd.attach(app);
    const stack = new Stack(app, 'AttachStack');
    new ssm.StringParameter(stack, 'P', { stringValue: 'v' });

    Template.fromStack(stack).hasResourceProperties('AWS::SSM::Parameter', {
      Tags: { Owner: 'attach', Stage: 'prod' },
    });
  });

  test('is safe when no cicd:config is present (no tags, still applies nag)', () => {
    const app = new App();
    expect(() => CdkCicd.attach(app)).not.toThrow();
    const stack = new Stack(app, 'BareStack');
    new ssm.StringParameter(stack, 'P', { stringValue: 'v' });

    // No Tags property is emitted when there is nothing to tag.
    const params = Template.fromStack(stack).findResources('AWS::SSM::Parameter');
    const only = Object.values(params)[0] as { Properties?: { Tags?: unknown } };
    expect(only.Properties?.Tags).toBeUndefined();
  });

  test('tags apply even when attach is called AFTER stacks are added', () => {
    // Aspects/Tags resolve at synth regardless of add order, so attach need not precede the stacks
    // -- pin it, since a bundled bin/ may call attach at the very end.
    const app = new App({ context: { [AppConfig.CONTEXT_KEY]: { tags: { Order: 'after' } } } });
    const stack = new Stack(app, 'LateAttachStack');
    new ssm.StringParameter(stack, 'P', { stringValue: 'v' });
    CdkCicd.attach(app);

    Template.fromStack(stack).hasResourceProperties('AWS::SSM::Parameter', { Tags: { Order: 'after' } });
  });

  test('counts as a wrapped App so the bundled-app diagnostic stays silent', () => {
    const before = appsConstructed();
    CdkCicd.attach(new App());
    expect(appsConstructed()).toBe(before + 1);
  });

  test('forces the default log retention when no cicd:config is present', () => {
    const app = new App();
    CdkCicd.attach(app);
    const stack = new Stack(app, 'NoConfigRetentionStack');
    new logs.CfnLogGroup(stack, 'Logs');

    Template.fromStack(stack).hasResourceProperties('AWS::Logs::LogGroup', {
      RetentionInDays: DEFAULT_LOG_RETENTION_DAYS,
    });
  });

  test('applies a log retention from the injected cicd:config', () => {
    const app = new App({ context: { [AppConfig.CONTEXT_KEY]: { logRetentionInDays: 30 } } });
    CdkCicd.attach(app);
    const stack = new Stack(app, 'ConfiguredRetentionStack');
    new logs.CfnLogGroup(stack, 'Logs');

    Template.fromStack(stack).hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 });
  });

  test('applies pipeline-injected compliance logging to application stacks', () => {
    const previous = {
      name: process.env[COMPLIANCE_LOG_BUCKET_NAME_FLAG],
      account: process.env[COMPLIANCE_LOG_BUCKET_ACCOUNT_FLAG],
      region: process.env[COMPLIANCE_LOG_BUCKET_REGION_FLAG],
    };
    process.env[COMPLIANCE_LOG_BUCKET_NAME_FLAG] = 'compliance-bucket';
    process.env[COMPLIANCE_LOG_BUCKET_ACCOUNT_FLAG] = '111111111111';
    process.env[COMPLIANCE_LOG_BUCKET_REGION_FLAG] = 'us-west-2';
    try {
      const app = new App();
      CdkCicd.attach(app);
      const stack = new Stack(app, 'ApplicationStack', {
        env: { account: '111111111111', region: 'us-west-2' },
      });
      new s3.Bucket(stack, 'ApplicationBucket');

      Template.fromStack(stack).hasResourceProperties('AWS::S3::Bucket', {
        LoggingConfiguration: {
          DestinationBucketName: 'compliance-bucket',
        },
      });
    } finally {
      setOrDeleteEnv(COMPLIANCE_LOG_BUCKET_NAME_FLAG, previous.name);
      setOrDeleteEnv(COMPLIANCE_LOG_BUCKET_ACCOUNT_FLAG, previous.account);
      setOrDeleteEnv(COMPLIANCE_LOG_BUCKET_REGION_FLAG, previous.region);
    }
  });

  test('applies compliance logging across Stage boundaries created after attach', () => {
    const previous = {
      name: process.env[COMPLIANCE_LOG_BUCKET_NAME_FLAG],
      account: process.env[COMPLIANCE_LOG_BUCKET_ACCOUNT_FLAG],
      region: process.env[COMPLIANCE_LOG_BUCKET_REGION_FLAG],
    };
    process.env[COMPLIANCE_LOG_BUCKET_NAME_FLAG] = 'compliance-bucket';
    process.env[COMPLIANCE_LOG_BUCKET_ACCOUNT_FLAG] = '111111111111';
    process.env[COMPLIANCE_LOG_BUCKET_REGION_FLAG] = 'us-west-2';
    try {
      const app = new App();
      CdkCicd.attach(app);
      const outer = new Stage(app, 'OuterStage', {
        env: { account: '111111111111', region: 'us-west-2' },
      });
      const inner = new Stage(outer, 'InnerStage', {
        env: { account: '111111111111', region: 'us-west-2' },
      });
      const stack = new Stack(inner, 'NestedApplicationStack');
      new s3.Bucket(stack, 'NestedApplicationBucket');

      Template.fromStack(stack).hasResourceProperties('AWS::S3::Bucket', {
        LoggingConfiguration: {
          DestinationBucketName: 'compliance-bucket',
        },
      });
    } finally {
      setOrDeleteEnv(COMPLIANCE_LOG_BUCKET_NAME_FLAG, previous.name);
      setOrDeleteEnv(COMPLIANCE_LOG_BUCKET_ACCOUNT_FLAG, previous.account);
      setOrDeleteEnv(COMPLIANCE_LOG_BUCKET_REGION_FLAG, previous.region);
    }
  });

  test('fails closed when compliance is attached after a nested Stage has already synthesized', () => {
    const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'late-compliance-'));
    const app = new App({ outdir });
    const stage = new Stage(app, 'AlreadySynthesized', {
      env: { account: '111111111111', region: 'us-west-2' },
    });
    const stack = new Stack(stage, 'ApplicationStack');
    new s3.Bucket(stack, 'ApplicationBucket');
    stage.synth();

    const previous = {
      name: process.env[COMPLIANCE_LOG_BUCKET_NAME_FLAG],
      account: process.env[COMPLIANCE_LOG_BUCKET_ACCOUNT_FLAG],
      region: process.env[COMPLIANCE_LOG_BUCKET_REGION_FLAG],
    };
    process.env[COMPLIANCE_LOG_BUCKET_NAME_FLAG] = 'compliance-bucket';
    process.env[COMPLIANCE_LOG_BUCKET_ACCOUNT_FLAG] = '111111111111';
    process.env[COMPLIANCE_LOG_BUCKET_REGION_FLAG] = 'us-west-2';
    try {
      expect(() => CdkCicd.attach(app)).toThrow(/cached cloud assembly cannot be retrofitted/);
    } finally {
      setOrDeleteEnv(COMPLIANCE_LOG_BUCKET_NAME_FLAG, previous.name);
      setOrDeleteEnv(COMPLIANCE_LOG_BUCKET_ACCOUNT_FLAG, previous.account);
      setOrDeleteEnv(COMPLIANCE_LOG_BUCKET_REGION_FLAG, previous.region);
      fs.rmSync(outdir, { recursive: true, force: true });
    }
  });

  test('fails closed when an application stack cannot use the injected compliance destination', () => {
    const previous = {
      name: process.env[COMPLIANCE_LOG_BUCKET_NAME_FLAG],
      account: process.env[COMPLIANCE_LOG_BUCKET_ACCOUNT_FLAG],
      region: process.env[COMPLIANCE_LOG_BUCKET_REGION_FLAG],
    };
    process.env[COMPLIANCE_LOG_BUCKET_NAME_FLAG] = 'compliance-bucket';
    process.env[COMPLIANCE_LOG_BUCKET_ACCOUNT_FLAG] = '111111111111';
    process.env[COMPLIANCE_LOG_BUCKET_REGION_FLAG] = 'us-west-2';
    try {
      const app = new App();
      CdkCicd.attach(app);
      const stack = new Stack(app, 'CrossRegionApplicationStack', {
        env: { account: '111111111111', region: 'us-east-1' },
      });
      new s3.Bucket(stack, 'ApplicationBucket');

      expect(() => Template.fromStack(stack)).toThrow(/same account and region/);
    } finally {
      setOrDeleteEnv(COMPLIANCE_LOG_BUCKET_NAME_FLAG, previous.name);
      setOrDeleteEnv(COMPLIANCE_LOG_BUCKET_ACCOUNT_FLAG, previous.account);
      setOrDeleteEnv(COMPLIANCE_LOG_BUCKET_REGION_FLAG, previous.region);
    }
  });

  test('skipDefaults opts out of every plugin (no cdk-nag)', () => {
    const app = new App();
    CdkCicd.attach(app, { skipDefaults: true });
    expect(Aspects.of(app).all.some((a) => a instanceof AwsSolutionsChecks)).toBe(false);
  });

  test('an explicit empty plugins list opts out of every plugin', () => {
    const app = new App();
    CdkCicd.attach(app, { plugins: [] });
    expect(Aspects.of(app).all.some((a) => a instanceof AwsSolutionsChecks)).toBe(false);
  });

  test('a plugins override wins over the injected config plugins', () => {
    const app = new App({
      context: { [AppConfig.CONTEXT_KEY]: { plugins: [{ name: 'AwsSolutionsChecks', version: '1' }] } },
    });
    // Options override with an empty list -> nothing applies, despite the config asking for cdk-nag.
    CdkCicd.attach(app, { plugins: [] });
    expect(Aspects.of(app).all.some((a) => a instanceof AwsSolutionsChecks)).toBe(false);
  });

  test('addPlugin registers a custom Aspect that a config plugins entry then selects', () => {
    const visited: string[] = [];
    class CustomAspect implements IAspect {
      public visit(node: IConstruct): void {
        visited.push(node.node.id);
      }
    }
    const app = new App({
      context: { [AppConfig.CONTEXT_KEY]: { plugins: [{ name: 'MyOrgRule', version: '1.0.0' }] } },
    });
    CdkCicd.addPlugin(app, new CustomAspect(), { name: 'MyOrgRule', version: '1.0.0' });
    CdkCicd.attach(app);

    const stack = new Stack(app, 'CustomPluginStack');
    new ssm.StringParameter(stack, 'P', { stringValue: 'v' });
    Template.fromStack(stack); // force synth -> aspects visit

    expect(visited.length).toBeGreaterThan(0);
    // The custom Aspect is the only plugin (config list overrides defaults), so cdk-nag did not apply.
    expect(Aspects.of(app).all.some((a) => a instanceof AwsSolutionsChecks)).toBe(false);
  });

  test('a config plugins entry naming an unregistered custom plugin throws an actionable error', () => {
    const app = new App({
      context: { [AppConfig.CONTEXT_KEY]: { plugins: [{ name: 'NotRegistered', version: '1' }] } },
    });
    expect(() => CdkCicd.attach(app)).toThrow(/NotRegistered/);
    expect(() => CdkCicd.attach(app)).toThrow(/addPlugin/);
  });
});

function setOrDeleteEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
