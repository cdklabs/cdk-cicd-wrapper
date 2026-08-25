// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { App, Aspects, Stack } from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { AwsSolutionsChecks } from 'cdk-nag';
import { resolveVpcNetworking } from '../../src/support/Vpc';

function stack(): Stack {
  return new Stack(new App(), 'VpcStack', { env: { account: '111111111111', region: 'us-west-2' } });
}

describe('m9-migrate-vpc: resolveVpcNetworking', () => {
  test('undefined config is v2 NoVPCStack -- no VPC created, nothing returned', () => {
    const s = stack();
    expect(resolveVpcNetworking(s, undefined, false)).toBeUndefined();
    Template.fromStack(s).resourceCountIs('AWS::EC2::VPC', 0);
  });

  test('an empty VpcConfig (neither managedVpc nor vpcId) also yields no VPC', () => {
    const s = stack();
    expect(resolveVpcNetworking(s, {}, false)).toBeUndefined();
  });

  test('managedVpc with no proxy creates a VPC with egress + public subnets, no interface endpoints', () => {
    const s = stack();
    const networking = resolveVpcNetworking(s, { managedVpc: {} }, false);

    expect(networking?.vpc).toBeDefined();
    expect(networking?.securityGroups).toHaveLength(1);
    expect(networking?.subnetSelection).toBeDefined();

    const template = Template.fromStack(s);
    template.resourceCountIs('AWS::EC2::VPC', 1);
    template.hasResourceProperties('AWS::EC2::VPC', { CidrBlock: '172.31.0.0/20' });
    // egress: one NAT-routed private subnet + one public subnet per AZ (default maxAzs: 2 -> 4 subnets).
    template.resourceCountIs('AWS::EC2::Subnet', 4);
    template.resourceCountIs('AWS::EC2::NatGateway', 2);
    template.resourceCountIs('AWS::EC2::VPCEndpoint', 0);
  });

  test('managedVpc with a proxy creates isolated subnets + the default CodeBuild interface endpoints', () => {
    const s = stack();
    const networking = resolveVpcNetworking(s, { managedVpc: {} }, true);

    expect(networking?.vpc).toBeDefined();
    const template = Template.fromStack(s);
    // isolated: one private-isolated subnet per AZ, no NAT.
    template.resourceCountIs('AWS::EC2::Subnet', 2);
    template.resourceCountIs('AWS::EC2::NatGateway', 0);
    // 6 default interface endpoints (SSM, STS, CloudWatch Logs, CloudFormation, Secrets Manager, KMS) + 1 S3 gateway endpoint.
    template.resourceCountIs('AWS::EC2::VPCEndpoint', 7);
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      SecurityGroupIngress: [Match.objectLike({ IpProtocol: 'tcp', FromPort: 443, ToPort: 443 })],
    });
  });

  test('managedVpc fields override the v2 defaults', () => {
    const s = stack();
    resolveVpcNetworking(s, { managedVpc: { cidrBlock: '10.0.0.0/16', subnetCidrMask: 26, maxAzs: 1 } }, false);

    const template = Template.fromStack(s);
    template.hasResourceProperties('AWS::EC2::VPC', { CidrBlock: '10.0.0.0/16' });
    // maxAzs: 1 -> one private + one public subnet only.
    template.resourceCountIs('AWS::EC2::Subnet', 2);
  });

  test('restrictDefaultSecurityGroup and allowAllOutbound can both be turned off (v2 always forced them on)', () => {
    const s = stack();
    const networking = resolveVpcNetworking(
      s,
      { managedVpc: { restrictDefaultSecurityGroup: false, allowAllOutbound: false } },
      false,
    );

    const template = Template.fromStack(s);
    // allowAllOutbound: false -- CDK's own SecurityGroup substitutes its "disallow all traffic"
    // placeholder egress rule (CloudFormation has no way to express "no egress rules at all") instead
    // of the wildcard allow-all-outbound egress rule the default (true) produces.
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: Match.stringLikeRegexp('egress'),
      SecurityGroupEgress: [Match.objectLike({ Description: 'Disallow all traffic' })],
    });
    expect(networking).toBeDefined();
  });

  test('flowLogsBucketName adds a VPC flow log to that bucket', () => {
    const s = stack();
    resolveVpcNetworking(s, { managedVpc: { flowLogsBucketName: 'my-compliance-log-bucket' } }, false);

    Template.fromStack(s).hasResourceProperties('AWS::EC2::FlowLog', {
      LogDestinationType: 's3',
    });
  });

  test('omitting flowLogsBucketName skips flow logs entirely', () => {
    const s = stack();
    resolveVpcNetworking(s, { managedVpc: {} }, false);
    Template.fromStack(s).resourceCountIs('AWS::EC2::FlowLog', 0);
  });

  test('an explicit subnetType wins over the useProxy-derived default', () => {
    const s = stack();
    // useProxy would default to isolated (no NAT); an explicit PRIVATE_WITH_EGRESS overrides that.
    resolveVpcNetworking(s, { managedVpc: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS } }, true);
    Template.fromStack(s).resourceCountIs('AWS::EC2::NatGateway', 2);
  });

  test('vpcId looks up an existing VPC and returns no security groups/subnet selection', () => {
    const s = stack();
    const networking = resolveVpcNetworking(s, { vpcId: 'vpc-0123456789abcdef0' }, false);

    expect(networking?.vpc).toBeDefined();
    expect(networking?.securityGroups).toBeUndefined();
    expect(networking?.subnetSelection).toBeUndefined();
    // A lookup is a context query, not a synthesized resource.
    Template.fromStack(s).resourceCountIs('AWS::EC2::VPC', 0);
  });

  test('managedVpc wins over vpcId if both are (invalidly) set', () => {
    const s = stack();
    resolveVpcNetworking(s, { managedVpc: {}, vpcId: 'vpc-0123456789abcdef0' }, false);
    Template.fromStack(s).resourceCountIs('AWS::EC2::VPC', 1);
  });

  test('a "resolve:ssm:" vpcId resolves the id from the named SSM parameter first, not literally', () => {
    const s = stack();
    const spy = jest.spyOn(ec2.Vpc, 'fromLookup');

    resolveVpcNetworking(s, { vpcId: 'resolve:ssm:/my-app/vpc-id' }, false);

    // Never the literal 'resolve:ssm:/my-app/vpc-id' string -- the prefix strips and the remainder
    // (the SSM parameter name) is resolved via StringParameter.valueFromLookup first.
    expect(spy).toHaveBeenCalledWith(s, 'Vpc', expect.objectContaining({ vpcId: expect.any(String) }));
    expect(spy.mock.calls[0][2].vpcId).not.toBe('resolve:ssm:/my-app/vpc-id');
    spy.mockRestore();
  });

  test('CONTROL: cdk-nag is LIVE here -- a deliberately non-compliant bucket produces an AwsSolutions finding', () => {
    // Same control this package's other nag-compliance tests use (see nag-compliance.test.ts): the jest
    // moduleNameMapper unifies aws-cdk-lib so cdk-nag's instanceof-based rules actually match here. This
    // fails first if that ever regresses, so the assertions below can't go vacuously green.
    const s = stack();
    new ec2.Vpc(s, 'NaughtyVpc');
    Aspects.of(s).add(new AwsSolutionsChecks());
    Template.fromStack(s);
    Annotations.fromStack(s).hasError('*', Match.stringLikeRegexp('AwsSolutions-VPC7'));
  });

  test('the default managedVpc (no flowLogsBucketName) suppresses AwsSolutions-VPC7, not just avoids it', () => {
    const s = stack();
    resolveVpcNetworking(s, { managedVpc: {} }, false);
    Aspects.of(s).add(new AwsSolutionsChecks());
    Template.fromStack(s);
    Annotations.fromStack(s).hasNoError('*', Match.stringLikeRegexp('AwsSolutions-VPC7'));
  });

  test('a managedVpc with flowLogsBucketName set has no VPC7 finding to suppress in the first place', () => {
    const s = stack();
    resolveVpcNetworking(s, { managedVpc: { flowLogsBucketName: 'my-flow-log-bucket' } }, false);
    Aspects.of(s).add(new AwsSolutionsChecks());
    Template.fromStack(s);
    Annotations.fromStack(s).hasNoError('*', Match.stringLikeRegexp('AwsSolutions-VPC7'));
  });
});
