// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// How each engine names its CodePipeline stages and actions, as the DevOps Agent integration needs it: to
// filter failures by stage and to describe the pipeline in the pipeline-map skill. One builder per engine,
// next to each other, so a rename in an engine has one place to follow here.

import { RegionOrder, ResolvedCicdConfig, ResolvedDeploymentConfig } from '../../config/types';

/** One environment (a config stage, or a Repo 2 target) as it appears in the pipeline. */
export interface EnvironmentLayout {
  readonly name: string;
  /** Undefined = the pipeline's own account. */
  readonly account?: string;
  /** Empty = the pipeline's own Region. */
  readonly regions: string[];
  readonly manualApproval: boolean;
  /** CodePipeline stage names that belong to this environment only (for matching; may be a superset). */
  readonly stageNames: string[];
  /** Stage-name prefixes of this environment, for stages CDK Pipelines splits at 50 actions (`prod.1`). */
  readonly stagePrefixes?: string[];
  /** Action names that deploy this environment (for matching where stages are shared, as in Repo 2). */
  readonly actionNames: string[];
  /** Exactly what the pipeline renders for this environment, for the pipeline map: `stage x` / `action y`. */
  readonly deployedBy: string[];
  /** The manual approval action, if the environment has one. */
  readonly approvalAction?: string;
}

export interface PipelineLayout {
  /** What renders the pipeline, for the pipeline map: e.g. `the CodePipeline engine`. */
  readonly description: string;
  readonly application?: string;
  readonly environments: EnvironmentLayout[];
  /** The pipeline's own stages (source, build, self-update, ...), as opposed to environment stages. */
  readonly pipelineStageNames: string[];
  /** Prefixes of the pipeline's own stages that may be split (CDK Pipelines' `Assets.1`). */
  readonly pipelineStagePrefixes?: string[];
}

/** The flat CODEPIPELINE engine: one CodePipeline stage per config stage, named after it. */
export function codePipelineLayout(config: ResolvedCicdConfig): PipelineLayout {
  if (config.deployerImage !== undefined) {
    return {
      description: 'the CodePipeline engine in container mode (Repo 1: builds and pushes the deployer image)',
      application: config.application,
      environments: [],
      pipelineStageNames: ['Source', 'BuildImage'],
    };
  }
  return {
    description: 'the CodePipeline engine',
    application: config.application,
    environments: config.stages.map((stage) => {
      const parallel = stage.env.regionOrder === RegionOrder.PARALLEL && stage.env.regions.length > 1;
      const suffixes = parallel ? stage.env.regions.map((region) => `-${region}`) : [''];
      const deploys = [
        ...suffixes.map((suffix) => `Deploy-${stage.name}${suffix}`),
        ...(config.asyncDeploy ? suffixes.map((suffix) => `Await-${stage.name}${suffix}`) : []),
      ];
      return {
        name: stage.name,
        account: stage.env.account,
        regions: stage.env.regions,
        manualApproval: stage.manualApproval,
        stageNames: [stage.name],
        actionNames: deploys,
        deployedBy: [`stage ${stage.name}`, ...deploys.map((action) => `action ${action}`)],
        ...(stage.manualApproval ? { approvalAction: `Approve-${stage.name}` } : {}),
      };
    }),
    pipelineStageNames: ['Source', 'Build', 'UpdatePipeline'],
  };
}

/** CDK_PIPELINES: a stage per config stage, or per stage and Region (`<stage>-<region>`) when it has several. */
export function cdkPipelinesLayout(config: ResolvedCicdConfig): PipelineLayout {
  return {
    description: 'the CDK Pipelines engine',
    application: config.application,
    environments: config.stages.map((stage) => {
      // Several sequential Regions render one pipeline stage each (`<stage>-<region>`); parallel Regions share a
      // wave named after the stage; a single Region renders a stage named after the stage.
      const perRegion = stage.env.regions.length > 1 && stage.env.regionOrder !== RegionOrder.PARALLEL;
      const exact = perRegion ? stage.env.regions.map((region) => `${stage.name}-${region}`) : [stage.name];
      return {
        name: stage.name,
        account: stage.env.account,
        regions: stage.env.regions,
        manualApproval: stage.manualApproval,
        stageNames: exact,
        stagePrefixes: exact.map((name) => `${name}.`),
        actionNames: [],
        deployedBy: exact.map((name) => `stage ${name}`),
        ...(stage.manualApproval ? { approvalAction: `Approve-${stage.name}` } : {}),
      };
    }),
    pipelineStageNames: ['Source', 'Build', 'UpdatePipeline', 'Assets'],
    pipelineStagePrefixes: ['Assets.'],
  };
}

/** Container mode, Repo 2: targets share numbered `Deploy-<n>` stages, so they are told apart by action. */
export function deploymentLayout(config: ResolvedDeploymentConfig): PipelineLayout {
  return {
    description: 'container mode (Repo 2: deploys the pushed deployer image to each target)',
    application: config.application,
    environments: config.targets.map((target) => {
      const parallel = target.env.regionOrder === RegionOrder.PARALLEL && target.env.regions.length > 1;
      const deploys = parallel
        ? target.env.regions.map((region) => `Deploy-${target.stage}-${region}`)
        : [`Deploy-${target.stage}`];
      return {
        name: target.stage,
        account: target.env.account,
        regions: target.env.regions,
        manualApproval: target.manualApproval,
        stageNames: [],
        actionNames: deploys,
        deployedBy: deploys.map((action) => `action ${action}`),
        ...(target.manualApproval ? { approvalAction: `Approve-${target.stage}` } : {}),
      };
    }),
    pipelineStageNames: ['Source', 'Plan'],
  };
}
