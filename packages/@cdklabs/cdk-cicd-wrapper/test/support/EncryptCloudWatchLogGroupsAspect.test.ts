// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { App, Aspects, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';
import { EncryptCloudWatchLogGroupsAspect } from '../../src/support/EncryptCloudWatchLogGroupsAspect';

function stack(): Stack {
  return new Stack(new App(), 'LogGroupStack');
}

function logGroupKmsKeyId(s: Stack): unknown {
  const logGroups = Template.fromStack(s).findResources('AWS::Logs::LogGroup');
  const [logGroup] = Object.values(logGroups) as Array<{ Properties?: { KmsKeyId?: unknown } }>;
  return logGroup.Properties?.KmsKeyId;
}

describe('m9-migrate-security-plugins: EncryptCloudWatchLogGroupsAspect', () => {
  test('sets the KMS key on an L1 log group with none set', () => {
    const s = stack();
    const key = new kms.Key(s, 'Key');
    const keyLogicalId = s.getLogicalId(key.node.defaultChild as kms.CfnKey);
    Aspects.of(s).add(new EncryptCloudWatchLogGroupsAspect({ encryptionKey: key }));
    new logs.CfnLogGroup(s, 'Logs');

    expect(logGroupKmsKeyId(s)).toEqual({ 'Fn::GetAtt': [keyLogicalId, 'Arn'] });
  });

  test('an explicit KMS key on the log group is never overridden', () => {
    const s = stack();
    const key = new kms.Key(s, 'Key');
    const other = new kms.Key(s, 'OtherKey');
    const otherLogicalId = s.getLogicalId(other.node.defaultChild as kms.CfnKey);
    Aspects.of(s).add(new EncryptCloudWatchLogGroupsAspect({ encryptionKey: key }));
    new logs.CfnLogGroup(s, 'Logs', { kmsKeyId: other.keyArn });

    expect(logGroupKmsKeyId(s)).toEqual({ 'Fn::GetAtt': [otherLogicalId, 'Arn'] });
  });

  test('ignores non-log-group constructs', () => {
    const s = stack();
    const key = new kms.Key(s, 'Key');
    expect(() => Aspects.of(s).add(new EncryptCloudWatchLogGroupsAspect({ encryptionKey: key }))).not.toThrow();
    Template.fromStack(s).resourceCountIs('AWS::Logs::LogGroup', 0);
  });
});
