// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { App, Aspects, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { DEFAULT_LOG_RETENTION_DAYS, LogRetentionAspect } from '../../src/support/LogRetentionAspect';

function stack(): Stack {
  return new Stack(new App(), 'RetentionStack');
}

describe('m9-migrate-log-retention: LogRetentionAspect', () => {
  test('forces the default retention on an L1 log group with none set', () => {
    // The L2 `LogGroup` always sets an explicit retention at synth (defaulting to TWO_YEARS), so it
    // can never observe "unset" -- exactly the Blueprint aspect's own limitation, since it also only visits
    // `CfnLogGroup` and only fills in a retention that is still `undefined`.
    const s = stack();
    Aspects.of(s).add(new LogRetentionAspect());
    new logs.CfnLogGroup(s, 'Logs');

    Template.fromStack(s).hasResourceProperties('AWS::Logs::LogGroup', {
      RetentionInDays: DEFAULT_LOG_RETENTION_DAYS,
    });
  });

  test('an explicit retention on the log group is never overridden', () => {
    const s = stack();
    Aspects.of(s).add(new LogRetentionAspect());
    new logs.LogGroup(s, 'Logs', { retention: logs.RetentionDays.ONE_WEEK });

    Template.fromStack(s).hasResourceProperties('AWS::Logs::LogGroup', {
      RetentionInDays: 7,
    });
  });

  test('a custom retentionInDays overrides the default', () => {
    const s = stack();
    Aspects.of(s).add(new LogRetentionAspect({ retentionInDays: 30 }));
    new logs.CfnLogGroup(s, 'Logs');

    Template.fromStack(s).hasResourceProperties('AWS::Logs::LogGroup', {
      RetentionInDays: 30,
    });
  });

  test('applies tree-wide, reaching a log group nested under another construct', () => {
    const s = stack();
    Aspects.of(s).add(new LogRetentionAspect());
    const nested = new Construct(s, 'Nested');
    new logs.CfnLogGroup(nested, 'Logs');

    Template.fromStack(s).hasResourceProperties('AWS::Logs::LogGroup', {
      RetentionInDays: DEFAULT_LOG_RETENTION_DAYS,
    });
  });

  test('ignores non-log-group constructs', () => {
    const s = stack();
    expect(() => Aspects.of(s).add(new LogRetentionAspect())).not.toThrow();
    Template.fromStack(s).resourceCountIs('AWS::Logs::LogGroup', 0);
  });

  test('sets retention on a CfnLogGroup built from a second, independently-loaded copy of aws-cdk-lib', () => {
    // `jest.isolateModules` re-executes `aws-cdk-lib` (and everything it depends on) in a fresh
    // module registry, so the `CfnLogGroup` class it returns is a distinct class object from the one
    // imported at the top of this file -- mirroring the two physical `aws-cdk-lib` copies this dev
    // tree actually resolves (root `node_modules` vs. this package's own nested `node_modules`), the
    // module-identity boundary that made `node instanceof CfnLogGroup` silently false against a real
    // deploy. The aspect must recognize the log group structurally, not by class identity.
    let otherLogGroup!: logs.CfnLogGroup;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const otherCdkLib = require('aws-cdk-lib');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const otherLogs = require('aws-cdk-lib/aws-logs');
      const otherStack = new otherCdkLib.Stack(new otherCdkLib.App(), 'OtherCopyStack');
      otherLogGroup = new otherLogs.CfnLogGroup(otherStack, 'Logs');
    });

    // Proves the object really did come from a different class -- otherwise this test would pass
    // trivially without exercising the cross-copy boundary at all.
    expect(otherLogGroup instanceof logs.CfnLogGroup).toBe(false);

    new LogRetentionAspect().visit(otherLogGroup);

    expect(otherLogGroup.retentionInDays).toEqual(DEFAULT_LOG_RETENTION_DAYS);
  });
});
