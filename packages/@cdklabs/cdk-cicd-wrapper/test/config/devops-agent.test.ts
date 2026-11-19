// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { BuildImage } from '../../src/config/build-image';
import { defineCICD, defineDeployment } from '../../src/config/define';
import { Repository } from '../../src/config/repository';
import { DevOpsAgentConfig, DevOpsAgentPriority, EngineType } from '../../src/config/types';

const CONNECTION = 'arn:aws:codestar-connections:eu-west-1:111111111111:connection/EXAMPLE-NOT-A-REAL-ID';
const base = {
  application: 'shop',
  repository: Repository.codestarConnection('org/shop', CONNECTION),
  stages: ['dev', { name: 'prod', manualApproval: true }],
};
const cicd = (devopsAgent: DevOpsAgentConfig) => defineCICD({ ...base, devopsAgent });
const deployment = (devopsAgent?: DevOpsAgentConfig) =>
  defineDeployment({
    image: 'repo:1',
    targets: [{ stage: 'prod', env: { account: '222222222222', region: 'eu-west-1' }, manualApproval: true }],
    devopsAgent,
  });

describe('devopsAgent config', () => {
  test('is off unless configured, and absent from the resolved config', () => {
    expect('devopsAgent' in defineCICD(base)).toBe(false);
    expect('devopsAgent' in deployment()).toBe(false);
  });

  test('a block that enables no level is rejected rather than doing nothing', () => {
    expect(() => cicd({ agentSpaceId: 'as-123' })).toThrow(/enables no level/);
  });

  test('each level stands alone, and the resolved config keeps only the levels that were set', () => {
    expect(cicd({ agentSpaceId: ' as-123 ', region: ' eu-west-1 ', investigations: {} }).devopsAgent).toEqual({
      agentSpaceId: 'as-123',
      region: 'eu-west-1',
      investigations: {},
    });
    expect(cicd({ agentSpaceId: 'as-123', knowledge: {} }).devopsAgent).toEqual({
      agentSpaceId: 'as-123',
      knowledge: {},
    });
    expect(deployment({ agentSpaceId: 'as-123', investigations: { stages: [' prod '] } }).devopsAgent).toEqual({
      agentSpaceId: 'as-123',
      investigations: { stages: ['prod'] },
    });
  });

  test.each([
    ['', /agentSpaceId is required/],
    ['   ', /agentSpaceId is required/],
    ['arn:aws:aidevops:eu-west-1:111111111111:agentspace/as-123', /not its ARN/],
    ['agentspace/as-123', /not a valid Agent Space ID/],
    ['as 123', /not a valid Agent Space ID/],
    ['a'.repeat(2049), /not a valid Agent Space ID/],
  ])('rejects agentSpaceId %j', (agentSpaceId, error) => {
    expect(() => cicd({ agentSpaceId, investigations: {} })).toThrow(error);
  });

  test.each(['', 'Europe', 'eu_west_1', 'eu-west'])('rejects region %j', (region) => {
    expect(() => cicd({ agentSpaceId: 'as-123', region, investigations: {} })).toThrow(/not an AWS Region name/);
  });

  test('fails closed on the GitHub Actions engine, which renders no CodePipeline', () => {
    expect(() =>
      defineCICD({
        ...base,
        repository: Repository.github('org/shop'),
        engine: EngineType.GITHUB_ACTIONS,
        devopsAgent: { agentSpaceId: 'as-123', investigations: {} },
      }),
    ).toThrow(/GitHub Actions engine renders none/);
  });
});

describe('devopsAgent.investigations', () => {
  test('stage filters must name real stages, and an empty filter is an error, not "nothing"', () => {
    expect(() => cicd({ agentSpaceId: 'as-123', investigations: { stages: ['qa'] } })).toThrow(
      /investigations.stages names unknown stage\(s\) qa; the stages are dev, prod/,
    );
    expect(() => cicd({ agentSpaceId: 'as-123', investigations: { stages: [] } })).toThrow(/stages is empty/);
  });

  test('duplicate stage names collapse to one', () => {
    expect(
      cicd({ agentSpaceId: 'as-123', investigations: { stages: ['prod', ' prod ', 'prod'] } }).devopsAgent,
    ).toEqual({
      agentSpaceId: 'as-123',
      investigations: { stages: ['prod'] },
    });
  });

  test('a container-mode Repo 1 pipeline has no stage to filter and no environment action to keep', () => {
    const repo1 = (investigations: object) =>
      defineCICD({
        ...base,
        deployerImage: BuildImage.docker(),
        devopsAgent: { agentSpaceId: 'as-123', investigations },
      });
    expect(repo1({}).devopsAgent).toBeDefined();
    expect(() => repo1({ stages: ['prod'] })).toThrow(/nothing to filter in a container-mode Repo 1 pipeline/);
    expect(() => repo1({ includePipelineActions: false })).toThrow(/leaves nothing to investigate/);
  });

  test('priority must be a DevOps Agent priority', () => {
    expect(
      cicd({ agentSpaceId: 'as-123', investigations: { priority: DevOpsAgentPriority.LOW } }).devopsAgent,
    ).toBeDefined();
    expect(() =>
      cicd({ agentSpaceId: 'as-123', investigations: { priority: 'URGENT' as unknown as DevOpsAgentPriority } }),
    ).toThrow(/investigations.priority 'URGENT' is not one of CRITICAL, HIGH, MEDIUM, LOW, MINIMAL/);
  });
});

describe('devopsAgent.knowledge', () => {
  test('turning off both of its skills is an error', () => {
    expect(() =>
      cicd({ agentSpaceId: 'as-123', knowledge: { investigationSkill: false, pipelineMap: false } }),
    ).toThrow(/turns off both of its skills/);
  });
});

describe('devopsAgent.changeRiskAnalysis', () => {
  test('reviews before the approval of gated stages of a GitHub/CodeStar-connection pipeline', () => {
    expect(cicd({ agentSpaceId: 'as-123', changeRiskAnalysis: { beforeApprovalOf: ['prod'] } }).devopsAgent).toEqual({
      agentSpaceId: 'as-123',
      changeRiskAnalysis: { beforeApprovalOf: ['prod'] },
    });
  });

  test('a stage without a manual approval can never start a review', () => {
    expect(() => cicd({ agentSpaceId: 'as-123', changeRiskAnalysis: { beforeApprovalOf: ['dev'] } })).toThrow(
      /without a manual approval: dev/,
    );
    expect(() => cicd({ agentSpaceId: 'as-123', changeRiskAnalysis: { beforeApprovalOf: [] } })).toThrow(/is empty/);
    expect(() => cicd({ agentSpaceId: 'as-123', changeRiskAnalysis: { beforeApprovalOf: ['qa'] } })).toThrow(
      /unknown stage/,
    );
  });

  test('needs a source DevOps Agent can read: not CodeCommit or S3', () => {
    for (const repository of [Repository.codecommit('shop'), Repository.s3('bucket/app.zip')]) {
      expect(() =>
        defineCICD({
          ...base,
          repository,
          devopsAgent: { agentSpaceId: 'as-123', changeRiskAnalysis: { beforeApprovalOf: ['prod'] } },
        }),
      ).toThrow(/needs a GitHub or CodeStar-connection source/);
    }
  });

  test('container mode has no commit to review, in either repo', () => {
    expect(() =>
      defineCICD({
        ...base,
        deployerImage: BuildImage.docker(),
        devopsAgent: { agentSpaceId: 'as-123', changeRiskAnalysis: { beforeApprovalOf: ['prod'] } },
      }),
    ).toThrow(/Repo 1 only builds images/);
    expect(() => deployment({ agentSpaceId: 'as-123', changeRiskAnalysis: { beforeApprovalOf: ['prod'] } })).toThrow(
      /Repo 2 promotes an image/,
    );
  });
});
