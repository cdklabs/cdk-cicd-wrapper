// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The engine abstraction. A pipeline engine turns a resolved cicd config into constructs under a
// scope. CodePipeline is the M4 implementation; the same seam lets a GitHub Actions or container
// engine slot in later (D4) without reworking callers. Kept side-effecting (returns void, renders
// into `scope`) so an engine that produces something other than a CDK construct tree -- e.g. a
// workflow YAML file -- still fits the interface.

import { Construct } from 'constructs';
import { ResolvedCicdConfig } from '../config/types';

/** Inputs an engine needs to render a pipeline. */
export interface EngineRenderProps {
  /** The fully resolved pipeline configuration. */
  readonly config: ResolvedCicdConfig;
  /** The pipeline's name (also drives the stack/resource naming an engine chooses). */
  readonly pipelineName: string;
}

/** Renders a resolved cicd config into a concrete pipeline. */
export interface IEngine {
  /** Build the pipeline under `scope`. Side-effecting; returns nothing. */
  render(scope: Construct, props: EngineRenderProps): void;
}
