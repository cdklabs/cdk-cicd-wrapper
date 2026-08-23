// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Construct } from 'constructs';
import { ResourceContext } from '../spi';

/**
 * Represents the phases in a pipeline.
 */
export enum PipelinePhases {
  /**
   * The initialize phase.
   */
  INITIALIZE = 'initialize',

  /**
   * The pre-build phase.
   */
  PRE_BUILD = 'preBuild',

  /**
   * The build phase.
   */
  BUILD = 'runBuild',

  /**
   * The testing phase.
   */
  TESTING = 'testing',

  /**
   * The pre-deploy phase.
   */
  PRE_DEPLOY = 'preDeploy',

  /**
   * The post-deploy phase.
   */
  POST_DEPLOY = 'postDeploy',
}

/**
 * The phases in an integration pipeline.
 */
export const INTEGRATION_PHASES = [PipelinePhases.PRE_BUILD, PipelinePhases.BUILD, PipelinePhases.TESTING];

/**
 * Represents a phase command.
 */
export interface IPhaseCommand {
  /**
   * The command to run during the phase.
   */
  readonly command: string;
}

/**
 * Represents a pipeline plugin
 */
export interface IPlugin {
  /**
   * The name of the plugin.
   */
  readonly name: string;

  /**
   * The version of the plugin.
   */
  readonly version: string;

  /**
   * The method called when the Pipeline configuration finalized.
   */
  create(context: ResourceContext): void;

  /**
   * The method called before the stage is created.
   */
  beforeStage(scope: Construct, context: ResourceContext): void;

  /**
   * The method called after the stage is created.
   */
  afterStage(scope: Construct, context: ResourceContext): void;
}

export abstract class PluginBase implements IPlugin {
  abstract readonly name: string;

  abstract readonly version: string;

  create(context: ResourceContext): void {
    void context;
  }

  beforeStage(scope: Construct, context: ResourceContext): void {
    void scope;
    void context;
  }

  afterStage(scope: Construct, context: ResourceContext): void {
    void scope;
    void context;
  }
}
