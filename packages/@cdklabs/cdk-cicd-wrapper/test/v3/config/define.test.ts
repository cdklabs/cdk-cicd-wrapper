// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { defineCICD, resolveCicdConfig } from '../../../src/v3/config/define';
import { Repository } from '../../../src/v3/config/repository';
import { EngineType, RegionOrder, SynthesizerType } from '../../../src/v3/config/types';

const REPO = Repository.github('org/repo');

describe('m3-config: defineCICD stage normalization', () => {
  test('a bare-name stage becomes an object with an empty (env-agnostic) region list', () => {
    const cfg = defineCICD({ repository: REPO, stages: ['dev'] });
    expect(cfg.stages[0]).toEqual({
      name: 'dev',
      env: { account: undefined, regions: [], regionOrder: RegionOrder.SEQUENTIAL },
      manualApproval: false,
      deployment: undefined,
    });
  });

  test('single region and region list both normalize to a regions[] with a default order', () => {
    const single = defineCICD({ repository: REPO, stages: [{ name: 'a', env: { region: 'us-west-2' } }] });
    expect(single.stages[0].env.regions).toEqual(['us-west-2']);
    expect(single.stages[0].env.regionOrder).toBe(RegionOrder.SEQUENTIAL);

    const many = defineCICD({
      repository: REPO,
      stages: [{ name: 'a', env: { regions: ['us-west-2', 'us-west-1'], regionOrder: RegionOrder.PARALLEL } }],
    });
    expect(many.stages[0].env.regions).toEqual(['us-west-2', 'us-west-1']);
    expect(many.stages[0].env.regionOrder).toBe(RegionOrder.PARALLEL);
  });

  test('manualApproval defaults by stage name and an explicit value always wins', () => {
    const cfg = defineCICD({
      repository: REPO,
      stages: ['dev', 'res', 'prod', 'staging', { name: 'dev', manualApproval: true }],
    });
    expect(cfg.stages.map((s) => s.manualApproval)).toEqual([false, false, true, true, true]);
  });

  test('deployment roles pass through unchanged', () => {
    const cfg = defineCICD({
      repository: REPO,
      stages: [{ name: 'prod', deployment: { deployRole: 'arn:role/deploy', cfnExecutionRole: 'arn:role/cfn' } }],
    });
    expect(cfg.stages[0].deployment).toEqual({ deployRole: 'arn:role/deploy', cfnExecutionRole: 'arn:role/cfn' });
  });
});

describe('m3-config: defineCICD top-level defaults', () => {
  test('qualifier is derived from application: lowercased, alphanumeric, <=10 chars', () => {
    expect(defineCICD({ application: 'My-App_2024!', repository: REPO, stages: [] }).qualifier).toBe('myapp2024');
    expect(defineCICD({ application: 'averylongapplicationname', repository: REPO, stages: [] }).qualifier).toBe(
      'averylonga',
    );
  });

  test('an explicit qualifier wins, and no application means no derived qualifier', () => {
    expect(defineCICD({ application: 'app', qualifier: 'custom', repository: REPO, stages: [] }).qualifier).toBe(
      'custom',
    );
    expect(defineCICD({ repository: REPO, stages: [] }).qualifier).toBeUndefined();
  });

  test('an application that sanitizes to nothing falls back to a valid qualifier', () => {
    // e.g. an all-punctuation name -> no alphanumerics left -> must not yield an empty qualifier.
    expect(defineCICD({ application: '!!!', repository: REPO, stages: [] }).qualifier).toBe('cdkcicd');
  });

  test('engine defaults to CODEPIPELINE and ci defaults to empty (engine supplies its own steps)', () => {
    const cfg = defineCICD({ repository: REPO, stages: [] });
    expect(cfg.engine).toBe(EngineType.CODEPIPELINE);
    expect(cfg.ci).toEqual({ steps: {}, synthStages: [], image: undefined });
  });

  test("ci.synthStages 'all' collapses to an empty list; an explicit list is kept", () => {
    expect(defineCICD({ repository: REPO, stages: [], ci: { synthStages: 'all' } }).ci.synthStages).toEqual([]);
    expect(defineCICD({ repository: REPO, stages: [], ci: { synthStages: ['dev'] } }).ci.synthStages).toEqual(['dev']);
  });

  test('ci.steps overrides and image pass through', () => {
    const cfg = defineCICD({ repository: REPO, stages: [], ci: { steps: { lint: 'npx cdk-cicd validate' }, image: 'node:24' } });
    expect(cfg.ci.steps).toEqual({ lint: 'npx cdk-cicd validate' });
    expect(cfg.ci.image).toBe('node:24');
  });

  test('synthesizer defaults to DEFAULT and an explicit type wins', () => {
    expect(defineCICD({ repository: REPO, stages: [] }).synthesizer.type).toBe(SynthesizerType.DEFAULT);
    expect(
      defineCICD({ repository: REPO, stages: [], synthesizer: { type: SynthesizerType.APP_STAGING } }).synthesizer.type,
    ).toBe(SynthesizerType.APP_STAGING);
  });

  test('resolveCicdConfig (the YAML path) produces the same result as defineCICD', () => {
    const props = { application: 'shop', repository: REPO, stages: ['dev', 'prod'] };
    expect(resolveCicdConfig(props)).toEqual(defineCICD(props));
  });
});
