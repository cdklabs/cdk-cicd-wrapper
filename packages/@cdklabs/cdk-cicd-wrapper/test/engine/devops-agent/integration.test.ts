// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The DevOps Agent integration, level by level, as each CodePipeline-based engine renders it.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { App, Aspects, Stack, Stage } from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { AwsSolutionsChecks } from 'cdk-nag';
import { BuildImage } from '../../../src/config/build-image';
import { defineCICD, defineDeployment } from '../../../src/config/define';
import { Repository } from '../../../src/config/repository';
import { DevOpsAgentConfig, DevOpsAgentPriority, RegionOrder } from '../../../src/config/types';
import { CdkPipelinesEngine, IStageProvider } from '../../../src/engine/cdkpipelines/CdkPipelinesEngine';
import { CodePipelineEngine } from '../../../src/engine/codepipeline/CodePipelineEngine';
import { DeploymentPipeline } from '../../../src/engine/codepipeline/DeploymentPipeline';
import { INVESTIGATION_SKILL_FILES } from '../../../src/engine/devops-agent/investigation-skill.generated';

const ENV = { account: '111111111111', region: 'eu-west-1' };
const CONNECTION = 'arn:aws:codestar-connections:eu-west-1:111111111111:connection/EXAMPLE-NOT-A-REAL-ID';

function flat(devopsAgent?: DevOpsAgentConfig, extra: object = {}): Template {
  return Template.fromStack(flatStack(devopsAgent, extra));
}

function flatStack(devopsAgent?: DevOpsAgentConfig, extra: object = {}): Stack {
  const stack = new Stack(new App(), 'PipelineStack', { env: ENV });
  new CodePipelineEngine().render(stack, {
    config: defineCICD({
      application: 'shop',
      repository: Repository.codestarConnection('org/shop', CONNECTION),
      stages: ['dev', { name: 'prod', manualApproval: true }],
      devopsAgent,
      ...extra,
    }),
    pipelineName: 'shop-pipeline',
  });
  return stack;
}

function rule(t: Template, state: string): any | undefined {
  return Object.values(t.findResources('AWS::Events::Rule')).find(
    (r: any) => r.Properties.EventPattern?.detail?.state?.[0] === state,
  );
}

function forwarder(t: Template): any {
  const fns = Object.values(
    t.findResources('AWS::Lambda::Function', {
      Properties: { Environment: { Variables: { AGENT_SPACE_ID: Match.anyValue() } } },
    }),
  );
  expect(fns).toHaveLength(1);
  return fns[0];
}

function assets(t: Template): any[] {
  return Object.values(t.findResources('AWS::DevOpsAgent::Asset'));
}

function actions(t: Template): string[] {
  return Object.values(t.findResources('AWS::IAM::Policy'))
    .flatMap((p: any) => p.Properties.PolicyDocument.Statement)
    .flatMap((st: any) => (Array.isArray(st.Action) ? st.Action : [st.Action]));
}

describe('off by default', () => {
  test('without devopsAgent nothing is rendered', () => {
    const t = flat();
    expect(Object.keys(t.findResources('AWS::Events::Rule'))).toHaveLength(0);
    expect(assets(t)).toHaveLength(0);
    expect(JSON.stringify(t.toJSON())).not.toContain('aidevops');
  });
});

describe('investigations', () => {
  test('{} forwards every failed action except approvals to a Lambda scoped to one Agent Space', () => {
    const t = flat({ agentSpaceId: 'as-123', investigations: {} });
    const failed = rule(t, 'FAILED');
    expect(failed.Properties.EventPattern.detail).toEqual({
      state: ['FAILED'],
      type: { category: [{ 'anything-but': ['Approval'] }] },
    });
    expect(JSON.stringify(failed.Properties.EventPattern.resources)).toContain(':codepipeline:eu-west-1:111111111111:');
    expect(rule(t, 'STARTED')).toBeUndefined();
    expect(forwarder(t).Properties.Environment.Variables).toMatchObject({
      AGENT_SPACE_ID: 'as-123',
      AGENT_SPACE_REGION: 'eu-west-1',
      INVESTIGATION_PRIORITY: 'HIGH',
    });
    // Fails on an empty set: a scan that found no aidevops statement must not pass.
    const aidevops = actions(t).filter((a) => a.startsWith('aidevops:'));
    expect(aidevops.length).toBeGreaterThan(0);
    expect(new Set(aidevops)).toEqual(new Set(['aidevops:CreateBacklogTask']));
    expect(actions(t)).not.toContain('codepipeline:GetPipelineExecution');
    expect(assets(t)).toHaveLength(0);
    // Undeliverable events and invocations that still fail after Lambda's retries share one DLQ.
    t.hasResourceProperties('AWS::Lambda::EventInvokeConfig', {
      MaximumRetryAttempts: 2,
      MaximumEventAgeInSeconds: 21600,
    });
    t.hasResourceProperties('AWS::SQS::Queue', { SqsManagedSseEnabled: true, MessageRetentionPeriod: 1209600 });
  });

  test("stages narrows the rule to those stages and the pipeline's own actions", () => {
    const detail = rule(flat({ agentSpaceId: 'as-123', investigations: { stages: ['prod'] } }), 'FAILED').Properties
      .EventPattern.detail;
    expect(detail.$or).toEqual([{ stage: ['Source', 'Build', 'UpdatePipeline', 'prod'] }, { action: ['Deploy-prod'] }]);
  });

  test('includePipelineActions: false keeps only environment stages', () => {
    const all = rule(flat({ agentSpaceId: 'as-123', investigations: { includePipelineActions: false } }), 'FAILED');
    expect(all.Properties.EventPattern.detail.stage).toEqual([
      { 'anything-but': ['Source', 'Build', 'UpdatePipeline'] },
    ]);
    const prod = rule(
      flat({ agentSpaceId: 'as-123', investigations: { stages: ['prod'], includePipelineActions: false } }),
      'FAILED',
    );
    expect(prod.Properties.EventPattern.detail.$or).toEqual([{ stage: ['prod'] }, { action: ['Deploy-prod'] }]);
  });

  test('priority reaches the forwarder', () => {
    const t = flat({ agentSpaceId: 'as-123', investigations: { priority: DevOpsAgentPriority.CRITICAL } });
    expect(forwarder(t).Properties.Environment.Variables.INVESTIGATION_PRIORITY).toBe('CRITICAL');
  });

  test('an Agent Space in another Region is called there', () => {
    const t = flat({ agentSpaceId: 'as-123', region: 'us-east-1', investigations: {} });
    expect(forwarder(t).Properties.Environment.Variables.AGENT_SPACE_REGION).toBe('us-east-1');
    expect(JSON.stringify(t.findResources('AWS::IAM::Policy'))).toContain(
      ':aidevops:us-east-1:111111111111:agentspace/as-123',
    );
  });

  test('container mode (Repo 1) forwards image-build failures', () => {
    const t = flat({ agentSpaceId: 'as-123', investigations: {} }, { deployerImage: BuildImage.docker() });
    expect(rule(t, 'FAILED')).toBeDefined();
  });
});

describe('knowledge', () => {
  test('{} publishes the investigation skill and a generated pipeline map, and needs no Lambda', () => {
    const t = flat({ agentSpaceId: 'as-123', knowledge: {} });
    expect(
      Object.keys(
        t.findResources('AWS::Lambda::Function', {
          Properties: { Environment: { Variables: { AGENT_SPACE_ID: Match.anyValue() } } },
        }),
      ),
    ).toHaveLength(0);
    const [skill, map] = assets(t);
    expect(skill.Properties).toMatchObject({
      AgentSpaceId: 'as-123',
      AssetType: 'skill',
      Metadata: { name: 'cdk-cicd-pipeline-failure-investigation', agent_types: ['GENERIC'] },
    });
    expect(skill.Properties.Files.map((f: any) => f.Path)).toEqual(INVESTIGATION_SKILL_FILES.map((f) => f.path));
    expect(map.Properties.Metadata.name).toBe('cdk-cicd-pipeline-map-pipelinestack'); // the stack, not the app
    expect(map.Properties.Metadata.name).toMatch(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/);
    const content = JSON.stringify(map.Properties.Files);
    expect(content).toContain(
      '| `prod` | the pipeline account | the pipeline Region | yes (`Approve-prod`) | stage `prod`, action `Deploy-prod` |',
    );
  });

  test('each skill can be left out', () => {
    expect(assets(flat({ agentSpaceId: 'as-123', knowledge: { pipelineMap: false } }))).toHaveLength(1);
    expect(
      assets(flat({ agentSpaceId: 'as-123', knowledge: { investigationSkill: false } }))[0].Properties.Metadata.name,
    ).toBe('cdk-cicd-pipeline-map-pipelinestack');
  });

  test("needs the Agent Space in the pipeline stack's Region", () => {
    expect(() => flat({ agentSpaceId: 'as-123', region: 'us-east-1', knowledge: {} })).toThrow(
      /must be in its Region \(eu-west-1\)/,
    );
  });
});

describe('every level together', () => {
  test('the pipeline stack stays free of unsuppressed cdk-nag findings', () => {
    const stack = flatStack({
      agentSpaceId: 'as-123',
      investigations: {},
      knowledge: {},
    });
    Aspects.of(stack).add(new AwsSolutionsChecks({ verbose: false }));
    const findings = [
      ...Annotations.fromStack(stack).findError('*', Match.stringLikeRegexp('AwsSolutions-')),
      ...Annotations.fromStack(stack).findWarning('*', Match.stringLikeRegexp('AwsSolutions-')),
    ].map((e) => `${e.id}: ${JSON.stringify(e.entry.data)}`);
    expect(findings).toEqual([]);
  });
});

describe('other engines', () => {
  function cdkPipelines(devopsAgent?: DevOpsAgentConfig): Template {
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
        stages: ['dev', { name: 'prod', env: { regions: ['eu-west-1', 'us-east-1'] }, manualApproval: true }],
        devopsAgent,
      }),
      stages: new StubStages(),
    });
    return Template.fromStack(stack);
  }

  function repo2(devopsAgent?: DevOpsAgentConfig): Template {
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

  test('CDK Pipelines: per-Region stages of a filtered stage are matched, and nothing renders when off', () => {
    const t = cdkPipelines({ agentSpaceId: 'as-123', investigations: { stages: ['prod'] } });
    // Two sequential Regions render one stage each; CDK Pipelines splits a stage past 50 actions (`<name>.1`).
    expect(rule(t, 'FAILED').Properties.EventPattern.detail.stage).toEqual([
      'Source',
      'Build',
      'UpdatePipeline',
      'Assets',
      'prod-eu-west-1',
      'prod-us-east-1',
      { prefix: 'Assets.' },
      { prefix: 'prod-eu-west-1.' },
      { prefix: 'prod-us-east-1.' },
    ]);
    const off = cdkPipelines();
    // The CodeCommit source has its own trigger rule; only rules on action state are ours.
    expect(
      Object.keys(
        off.findResources('AWS::Events::Rule', {
          Properties: { EventPattern: { detail: { state: Match.anyValue() } } },
        }),
      ),
    ).toHaveLength(0);
    expect(JSON.stringify(off.toJSON())).not.toContain('aidevops');
  });

  test('Repo 2: one rule over the CD and auto-deploy pipelines, filtered by deploy action, nothing when off', () => {
    const t = repo2({ agentSpaceId: 'as-123', investigations: { stages: ['prod'], includePipelineActions: false } });
    expect(Object.keys(t.findResources('AWS::CodePipeline::Pipeline'))).toHaveLength(2);
    const failed = rule(t, 'FAILED');
    expect(failed.Properties.EventPattern.resources).toHaveLength(2);
    expect(failed.Properties.EventPattern.detail.action).toEqual(['Deploy-prod']);
    const off = repo2();
    expect(
      Object.keys(
        off.findResources('AWS::Events::Rule', {
          Properties: { EventPattern: { detail: { state: Match.anyValue() } } },
        }),
      ),
    ).toHaveLength(0);
    expect(JSON.stringify(off.toJSON())).not.toContain('aidevops');
  });
});

describe('the pipeline map names only what the pipeline renders', () => {
  /** Every `stage x` / `action y` in the map's "Deployed by" column. */
  function mapNames(t: Template): Array<{ kind: string; name: string }> {
    const map = assets(t).find((a: any) => a.Properties.Metadata.name.startsWith('cdk-cicd-pipeline-map-'));
    const text = JSON.stringify(map.Properties.Files);
    const names = [...text.matchAll(/(stage|action) `([^`]+)`/g)].map((m) => ({ kind: m[1], name: m[2] }));
    expect(names.length).toBeGreaterThan(0); // an empty map would pass the check below vacuously
    return names;
  }

  function rendered(t: Template): { stages: Set<string>; actions: Set<string> } {
    const pipelines = Object.values(t.findResources('AWS::CodePipeline::Pipeline')) as any[];
    const stages = pipelines.flatMap((p) => p.Properties.Stages);
    return {
      stages: new Set(stages.map((stage: any) => stage.Name)),
      actions: new Set(stages.flatMap((stage: any) => stage.Actions.map((action: any) => action.Name))),
    };
  }

  function expectExact(t: Template) {
    const { stages, actions: renderedActions } = rendered(t);
    for (const { kind, name } of mapNames(t)) {
      expect({ kind, name, rendered: (kind === 'stage' ? stages : renderedActions).has(name) }).toEqual({
        kind,
        name,
        rendered: true,
      });
    }
  }

  test('flat engine, with parallel Regions and asyncDeploy', () => {
    expectExact(
      flat(
        { agentSpaceId: 'as-123', knowledge: {} },
        {
          asyncDeploy: true,
          stages: [
            'dev',
            {
              name: 'prod',
              env: { regions: ['eu-west-1', 'eu-central-1'], regionOrder: RegionOrder.PARALLEL },
              manualApproval: true,
            },
          ],
        },
      ),
    );
  });

  test('CDK Pipelines, with sequential and parallel Regions', () => {
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
        stages: [
          { name: 'int', env: { regions: ['eu-west-1', 'eu-central-1'] } },
          {
            name: 'prod',
            env: { regions: ['eu-west-1', 'eu-central-1'], regionOrder: RegionOrder.PARALLEL },
            manualApproval: true,
          },
        ],
        devopsAgent: { agentSpaceId: 'as-123', knowledge: {}, investigations: { stages: ['prod'] } },
      }),
      stages: new StubStages(),
    });
    expectExact(Template.fromStack(stack));
  });

  test('Repo 2, with an auto-deploy target and parallel Regions', () => {
    const stack = new Stack(new App(), 'CdStack', { env: ENV });
    new DeploymentPipeline(stack, 'Cd', {
      config: defineDeployment({
        image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/my-app-deployer',
        repository: Repository.codecommit('my-deploy-config'),
        crossAccountEcrRepositoryPolicyConfigured: true,
        targets: [
          { stage: 'dev', env: { account: '111111111111', region: 'eu-west-1' }, autoDeploy: true },
          {
            stage: 'prod',
            env: { account: '111111111111', regions: ['eu-west-1', 'eu-central-1'], regionOrder: RegionOrder.PARALLEL },
            manualApproval: true,
          },
        ],
        devopsAgent: { agentSpaceId: 'as-123', knowledge: {} },
      }),
    });
    expectExact(Template.fromStack(stack));
  });
});

describe('skill names', () => {
  test('are lowercase, hyphenated and at most 64 characters, whatever the stack is called', () => {
    const stack = new Stack(
      new App(),
      'My-Very-Long-PIPELINE-Stack-Name-That-Keeps-Going-And-Going-And-Going-Forever',
      { env: ENV },
    );
    new CodePipelineEngine().render(stack, {
      config: defineCICD({
        application: 'shop',
        repository: Repository.s3('shop-src/app.zip'),
        stages: ['dev'],
        devopsAgent: { agentSpaceId: 'as-123', knowledge: { investigationSkill: false } },
      }),
      pipelineName: 'shop-pipeline',
    });
    const [map] = assets(Template.fromStack(stack));
    expect(map.Properties.Metadata.name).toMatch(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/);
    expect(map.Properties.Metadata.name.startsWith('cdk-cicd-pipeline-map-my-very-long-pipeline-stack')).toBe(true);
  });
});
