// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { defineCICD, defineDeployment, normalizeDevOpsAgent } from '../../src/config/define';
import { Repository } from '../../src/config/repository';
import { EngineType } from '../../src/config/types';

const base = { application: 'shop', repository: Repository.codecommit('shop'), stages: ['dev'] };

describe('devopsAgent config', () => {
  test('is off unless configured, and absent from the resolved config', () => {
    expect(normalizeDevOpsAgent(undefined)).toBeUndefined();
    expect('devopsAgent' in defineCICD(base)).toBe(false);
    expect('devopsAgent' in defineDeployment({ image: 'repo:1', targets: [] })).toBe(false);
  });

  test('trims the ID and Region and carries them into both resolved configs', () => {
    const input = { agentSpaceId: '  as-123  ', region: ' eu-west-1 ' };
    expect(defineCICD({ ...base, devopsAgent: input }).devopsAgent).toEqual({
      agentSpaceId: 'as-123',
      region: 'eu-west-1',
    });
    expect(defineDeployment({ image: 'repo:1', targets: [], devopsAgent: input }).devopsAgent).toEqual({
      agentSpaceId: 'as-123',
      region: 'eu-west-1',
    });
    expect(normalizeDevOpsAgent({ agentSpaceId: 'as-123' })).toEqual({ agentSpaceId: 'as-123' });
  });

  test.each([
    ['', /agentSpaceId is required/],
    ['   ', /agentSpaceId is required/],
    ['arn:aws:aidevops:eu-west-1:111111111111:agentspace/as-123', /not its ARN/],
    ['agentspace/as-123', /not a valid Agent Space ID/],
    ['as 123', /not a valid Agent Space ID/],
    ['a'.repeat(2049), /not a valid Agent Space ID/],
  ])('rejects agentSpaceId %j', (agentSpaceId, error) => {
    expect(() => normalizeDevOpsAgent({ agentSpaceId })).toThrow(error);
  });

  test.each(['', 'Europe', 'eu_west_1', 'eu-west'])('rejects region %j', (region) => {
    expect(() => normalizeDevOpsAgent({ agentSpaceId: 'as-123', region })).toThrow(/not an AWS Region name/);
  });

  test('fails closed on the GitHub Actions engine, which emits no CodePipeline events', () => {
    expect(() =>
      defineCICD({
        ...base,
        repository: Repository.github('org/shop'),
        engine: EngineType.GITHUB_ACTIONS,
        devopsAgent: { agentSpaceId: 'as-123' },
      }),
    ).toThrow(/GitHub Actions engine/);
  });
});
