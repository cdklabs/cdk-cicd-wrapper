// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The opt-in DevOps Agent failure forwarder, as each CodePipeline-based engine renders it.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { App, Aspects, Stack, Stage } from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { AwsSolutionsChecks } from 'cdk-nag';
import { BuildImage } from '../../../src/config/build-image';
import { defineCICD, defineDeployment } from '../../../src/config/define';
import { Repository } from '../../../src/config/repository';
import { DevOpsAgentConfig } from '../../../src/config/types';
import { CdkPipelinesEngine, IStageProvider } from '../../../src/engine/cdkpipelines/CdkPipelinesEngine';
import { CodePipelineEngine } from '../../../src/engine/codepipeline/CodePipelineEngine';
import { DeploymentPipeline } from '../../../src/engine/codepipeline/DeploymentPipeline';

const ENV = { account: '111111111111', region: 'eu-west-1' };
const AGENT: DevOpsAgentConfig = { agentSpaceId: 'as-123' };

function flatPipeline(devopsAgent?: DevOpsAgentConfig): Stack {
  const stack = new Stack(new App(), 'PipelineStack', { env: ENV });
  new CodePipelineEngine().render(stack, {
    config: defineCICD({
      application: 'shop',
      repository: Repository.s3('shop-src/app.zip'),
      stages: ['dev'],
      devopsAgent,
    }),
    pipelineName: 'shop-pipeline',
  });
  return stack;
}

function forwarderFunction(t: Template): any {
  const fns = Object.values(
    t.findResources('AWS::Lambda::Function', {
      Properties: { Environment: { Variables: { AGENT_SPACE_ID: Match.anyValue() } } },
    }),
  );
  expect(fns).toHaveLength(1);
  return fns[0];
}

function failureRules(t: Template): any[] {
  return Object.values(
    t.findResources('AWS::Events::Rule', {
      Properties: { EventPattern: { 'detail-type': ['CodePipeline Action Execution State Change'] } },
    }),
  );
}

describe('DevOps Agent failure forwarder', () => {
  test('nothing is rendered unless devopsAgent is configured', () => {
    const t = Template.fromStack(flatPipeline());
    expect(failureRules(t)).toHaveLength(0);
    expect(JSON.stringify(t.toJSON())).not.toContain('aidevops');
  });

  test('the flat engine routes its own failed actions to a Lambda scoped to one Agent Space', () => {
    const t = Template.fromStack(flatPipeline(AGENT));
    const rules = failureRules(t);
    expect(rules).toHaveLength(1);
    expect(rules[0].Properties.EventPattern).toEqual({
      source: ['aws.codepipeline'],
      'detail-type': ['CodePipeline Action Execution State Change'],
      resources: [expect.anything()],
      // A rejected or timed-out approval also ends FAILED; it must not open an investigation.
      detail: { state: ['FAILED'], type: { category: [{ 'anything-but': ['Approval'] }] } },
    });
    // The rule matches this stack's pipeline by ARN, and nothing else.
    const [pipelineId] = Object.keys(t.findResources('AWS::CodePipeline::Pipeline'));
    const resources = JSON.stringify(rules[0].Properties.EventPattern.resources);
    expect(resources).toContain(':codepipeline:eu-west-1:111111111111:');
    expect(resources).toContain(`{"Ref":"${pipelineId}"}`);
    expect(rules[0].Properties.Targets).toHaveLength(1);
    expect(rules[0].Properties.Targets[0].RetryPolicy).toEqual({
      MaximumRetryAttempts: 2,
      MaximumEventAgeInSeconds: 3600,
    });

    // Undeliverable events and invocations that still fail after Lambda's retries share one DLQ.
    const [queueId] = Object.keys(t.findResources('AWS::SQS::Queue'));
    expect(queueId).toBeDefined();
    expect(rules[0].Properties.Targets[0].DeadLetterConfig).toEqual({ Arn: { 'Fn::GetAtt': [queueId, 'Arn'] } });
    expect(forwarderFunction(t).Properties.DeadLetterConfig).toEqual({ TargetArn: { 'Fn::GetAtt': [queueId, 'Arn'] } });
    t.hasResourceProperties('AWS::Lambda::EventInvokeConfig', {
      MaximumRetryAttempts: 2,
      MaximumEventAgeInSeconds: 21600,
    });
    t.hasResourceProperties('AWS::SQS::Queue', { SqsManagedSseEnabled: true, MessageRetentionPeriod: 1209600 });

    expect(forwarderFunction(t).Properties.Environment.Variables).toEqual({
      AGENT_SPACE_ID: 'as-123',
      AGENT_SPACE_REGION: 'eu-west-1',
    });
    t.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'aidevops:CreateBacklogTask',
            Effect: 'Allow',
            Resource: {
              'Fn::Join': [
                '',
                ['arn:', { Ref: 'AWS::Partition' }, ':aidevops:eu-west-1:111111111111:agentspace/as-123'],
              ],
            },
          }),
        ]),
      },
    });
  });

  test('the only aidevops permission granted is CreateBacklogTask', () => {
    const policies = Object.values(Template.fromStack(flatPipeline(AGENT)).findResources('AWS::IAM::Policy'));
    const actions = policies
      .flatMap((p: any) => p.Properties.PolicyDocument.Statement)
      .flatMap((st: any) => (Array.isArray(st.Action) ? st.Action : [st.Action]))
      .filter((a: string) => a.startsWith('aidevops:'));
    // Fails on an empty set: a scan that found no aidevops statement must not pass.
    expect(actions.length).toBeGreaterThan(0);
    expect(new Set(actions)).toEqual(new Set(['aidevops:CreateBacklogTask']));
  });

  test('an Agent Space in another Region is called there', () => {
    const t = Template.fromStack(flatPipeline({ agentSpaceId: 'as-123', region: 'us-east-1' }));
    expect(forwarderFunction(t).Properties.Environment.Variables.AGENT_SPACE_REGION).toBe('us-east-1');
    expect(JSON.stringify(t.findResources('AWS::IAM::Policy'))).toContain(
      ':aidevops:us-east-1:111111111111:agentspace/as-123',
    );
  });

  test('the pipeline stack stays free of unsuppressed cdk-nag findings with the forwarder on', () => {
    const stack = flatPipeline(AGENT);
    Aspects.of(stack).add(new AwsSolutionsChecks({ verbose: false }));
    const findings = [
      ...Annotations.fromStack(stack).findError('*', Match.stringLikeRegexp('AwsSolutions-')),
      ...Annotations.fromStack(stack).findWarning('*', Match.stringLikeRegexp('AwsSolutions-')),
    ].map((e) => `${e.id}: ${JSON.stringify(e.entry.data)}`);
    expect(findings).toEqual([]);
  });

  test('container mode (Repo 1) forwards image-build failures too', () => {
    const stack = new Stack(new App(), 'ImageStack', { env: ENV });
    new CodePipelineEngine().render(stack, {
      config: defineCICD({
        application: 'shop',
        repository: Repository.s3('shop-src/app.zip'),
        stages: ['dev'],
        deployerImage: BuildImage.docker(),
        devopsAgent: AGENT,
      }),
      pipelineName: 'shop-images',
    });
    expect(failureRules(Template.fromStack(stack))).toHaveLength(1);
  });

  function cdkPipelinesTemplate(devopsAgent?: DevOpsAgentConfig): Template {
    class StubStages implements IStageProvider {
      public stacks(stage: Stage): void {
        new s3.Bucket(new Stack(stage, 'App'), 'Bucket');
      }
    }
    const stack = new Stack(new App(), 'PipelineStack', { env: ENV });
    new CdkPipelinesEngine(stack, 'Cd', {
      config: defineCICD({
        application: 'shop',
        repository: Repository.codecommit('shop'),
        stages: ['dev'],
        devopsAgent,
      }),
      stages: new StubStages(),
    });
    return Template.fromStack(stack);
  }

  function repo2Template(devopsAgent?: DevOpsAgentConfig): Template {
    const stack = new Stack(new App(), 'CdStack', { env: ENV });
    new DeploymentPipeline(stack, 'Cd', {
      config: defineDeployment({
        image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/my-app-deployer',
        repository: Repository.codecommit('my-deploy-config'),
        crossAccountEcrRepositoryPolicyConfigured: true,
        targets: [
          { stage: 'dev', env: { account: '111111111111', region: 'eu-west-1' }, autoDeploy: true },
          { stage: 'prod', env: { account: '111111111111', region: 'eu-west-1' }, manualApproval: true },
        ],
        devopsAgent,
      }),
    });
    return Template.fromStack(stack);
  }

  test('the CDK Pipelines engine forwards its generated pipeline, and renders nothing when off', () => {
    const t = cdkPipelinesTemplate(AGENT);
    expect(failureRules(t)).toHaveLength(1);
    expect(forwarderFunction(t).Properties.Environment.Variables.AGENT_SPACE_ID).toBe('as-123');
    const off = cdkPipelinesTemplate();
    expect(failureRules(off)).toHaveLength(0);
    expect(JSON.stringify(off.toJSON())).not.toContain('aidevops');
  });

  test('Repo 2 forwards the CD pipeline and every auto-deploy pipeline through one rule and one function', () => {
    const t = repo2Template(AGENT);
    expect(Object.keys(t.findResources('AWS::CodePipeline::Pipeline'))).toHaveLength(2);
    const rules = failureRules(t);
    expect(rules).toHaveLength(1);
    expect(rules[0].Properties.EventPattern.resources).toHaveLength(2);
    forwarderFunction(t);
    const off = repo2Template();
    expect(failureRules(off)).toHaveLength(0);
    expect(JSON.stringify(off.toJSON())).not.toContain('aidevops');
  });
});
