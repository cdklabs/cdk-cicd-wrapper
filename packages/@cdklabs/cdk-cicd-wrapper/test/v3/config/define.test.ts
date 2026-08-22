// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { defineCICD, defineDeployment, resolveCicdConfig } from '../../../src/v3/config/define';
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
    const cfg = defineCICD({
      repository: REPO,
      stages: [],
      ci: { steps: { lint: 'npx cdk-cicd validate' }, image: 'node:24' },
    });
    expect(cfg.ci.steps).toEqual({ lint: 'npx cdk-cicd validate' });
    expect(cfg.ci.image).toBe('node:24');
  });

  test('synthesizer defaults to DEFAULT and an explicit type wins', () => {
    expect(defineCICD({ repository: REPO, stages: [] }).synthesizer.type).toBe(SynthesizerType.DEFAULT);
    expect(
      defineCICD({ repository: REPO, stages: [], synthesizer: { type: SynthesizerType.APP_STAGING } }).synthesizer.type,
    ).toBe(SynthesizerType.APP_STAGING);
  });

  test('codeArtifact defaults to undefined (opt-in) and an explicit config passes through unchanged', () => {
    expect(defineCICD({ repository: REPO, stages: [] }).codeArtifact).toBeUndefined();
    const codeArtifact = { domain: 'd', repository: 'r', npmScope: 'cdklabs' };
    expect(defineCICD({ repository: REPO, stages: [], codeArtifact }).codeArtifact).toEqual(codeArtifact);
  });

  test('resolveCicdConfig (the YAML path) produces the same result as defineCICD', () => {
    const props = { application: 'shop', repository: REPO, stages: ['dev', 'prod'] };
    expect(resolveCicdConfig(props)).toEqual(defineCICD(props));
  });
});

describe('m6-container: defineDeployment target normalization (Repo 2)', () => {
  test('the image passes through and targets keep their order', () => {
    const cfg = defineDeployment({
      image: 'acct.dkr.ecr.eu-west-1.amazonaws.com/my-app-deployer:1.4.2',
      targets: [{ stage: 'dev' }, { stage: 'prod' }],
    });
    expect(cfg.image).toBe('acct.dkr.ecr.eu-west-1.amazonaws.com/my-app-deployer:1.4.2');
    expect(cfg.targets.map((t) => t.stage)).toEqual(['dev', 'prod']);
  });

  test('a target with no env becomes environment-agnostic (empty region list)', () => {
    const cfg = defineDeployment({ image: 'img:tag', targets: [{ stage: 'dev' }] });
    expect(cfg.targets[0]).toEqual({
      stage: 'dev',
      env: { account: undefined, regions: [], regionOrder: RegionOrder.SEQUENTIAL },
      manualApproval: false,
      deployment: undefined,
    });
  });

  test('single region and region list both normalize to a regions[] with a default order', () => {
    const single = defineDeployment({ image: 'img:tag', targets: [{ stage: 'a', env: { region: 'us-west-2' } }] });
    expect(single.targets[0].env.regions).toEqual(['us-west-2']);
    expect(single.targets[0].env.regionOrder).toBe(RegionOrder.SEQUENTIAL);

    const many = defineDeployment({
      image: 'img:tag',
      targets: [{ stage: 'a', env: { regions: ['us-west-2', 'us-west-1'], regionOrder: RegionOrder.PARALLEL } }],
    });
    expect(many.targets[0].env.regions).toEqual(['us-west-2', 'us-west-1']);
    expect(many.targets[0].env.regionOrder).toBe(RegionOrder.PARALLEL);
  });

  test('manualApproval defaults by stage name (same rule as stages) and an explicit value wins', () => {
    const cfg = defineDeployment({
      image: 'img:tag',
      targets: [{ stage: 'dev' }, { stage: 'res' }, { stage: 'prod' }, { stage: 'dev', manualApproval: true }],
    });
    expect(cfg.targets.map((t) => t.manualApproval)).toEqual([false, false, true, true]);
  });

  test('repository is optional and passes through for the CD pipeline path', () => {
    expect(defineDeployment({ image: 'img:1', targets: [{ stage: 'dev' }] }).repository).toBeUndefined();
    const repo = Repository.codecommit('my-deploy-config');
    expect(defineDeployment({ image: 'img:1', repository: repo, targets: [{ stage: 'dev' }] }).repository).toBe(repo);
  });

  test('a per-target image pins that stage version; top-level image is optional (the default)', () => {
    const cfg = defineDeployment({
      image: 'repo:base',
      targets: [
        { stage: 'dev', image: 'repo:dev-42' }, // its own version
        { stage: 'prod' }, // falls back to the top-level default
      ],
    });
    expect(cfg.targets[0].image).toBe('repo:dev-42');
    expect(cfg.targets[1].image).toBeUndefined();
    expect(cfg.image).toBe('repo:base');
    // top-level image may be omitted entirely when every target pins its own
    const noDefault = defineDeployment({ targets: [{ stage: 'dev', image: 'repo:dev-42' }] });
    expect(noDefault.image).toBeUndefined();
    expect(noDefault.targets[0].image).toBe('repo:dev-42');
  });

  test('codeArtifact passes through for the CD build (pre-release CLI install)', () => {
    const ca = { domain: 'd', repository: 'r', npmScope: 'cdklabs' };
    expect(defineDeployment({ image: 'i:1', codeArtifact: ca, targets: [{ stage: 'dev' }] }).codeArtifact).toEqual(ca);
  });

  test('the target account and forced roles pass through unchanged', () => {
    const cfg = defineDeployment({
      image: 'img:tag',
      targets: [
        {
          stage: 'prod',
          env: { account: '333333333333', region: 'eu-west-1' },
          deployment: { deployRole: 'arn:role/deploy' },
        },
      ],
    });
    expect(cfg.targets[0].env.account).toBe('333333333333');
    expect(cfg.targets[0].deployment).toEqual({ deployRole: 'arn:role/deploy' });
  });
});
