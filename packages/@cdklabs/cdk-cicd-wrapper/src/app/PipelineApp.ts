// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The CDK app that holds the pipeline itself. `cdk-cicd deploy-ci` points the CDK CLI at this via
// `--app`, so provisioning the pipeline needs no file in the user's repository -- the zero-touch
// default (ground rule 3). It is a plain `App` subclass rather than a function so the same class is
// also the documented explicit opt-in: a user who wants the pipeline in their own `bin/` writes
// `new PipelineApp({ config }).synth()` and nothing else.
//
// It lives in this package, not in the CLI, on purpose: rendering needs `aws-cdk-lib`, `constructs`
// and `cdk-nag`, all of which this package already declares as peers and the CLI declares none of.
// Building the App here keeps the whole construct tree on ONE copy of aws-cdk-lib -- which matters
// more than it looks, because cdk-nag's rules match resources with `instanceof` and go silently
// inert across two copies (finding `qa-duplicate-aws-cdk-lib-makes-cdk-nag-inert`).

import { App, Aspects, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { EngineType, ResolvedCicdConfig } from '../config/types';
import { CodePipelineEngine } from '../engine/codepipeline/CodePipelineEngine';
import { IEngine } from '../engine/types';

/** Name used when the config names no application. */
const DEFAULT_APPLICATION = 'cdk-cicd';

function engineFor(config: ResolvedCicdConfig, disposable: boolean): IEngine {
  // `engine` is a plain string once a config has been through YAML/JSON rather than `defineCICD`, so
  // an unknown value is reachable and worth naming rather than rendering a pipeline-less stack.
  switch (config.engine) {
    case EngineType.CODEPIPELINE:
      return new CodePipelineEngine({ removalPolicy: disposable ? RemovalPolicy.DESTROY : undefined });
    default:
      throw new Error(`cdk-cicd: unknown pipeline engine '${config.engine}' -- expected 'codepipeline'`);
  }
}

/** Options for the pipeline app. */
export interface PipelineAppProps {
  /** The resolved pipeline configuration, as produced by `defineCICD`. */
  readonly config: ResolvedCicdConfig;
  /**
   * Treat this pipeline as disposable: its own support resources (artifact bucket, encryption key)
   * are deleted with the stack instead of retained. Off by default, because losing a real pipeline's
   * artifact history to a `cdk destroy` is not a default anyone should get by accident.
   */
  readonly disposable?: boolean;
}

/**
 * A CDK app containing exactly one stack: the pipeline. The stack's environment comes from the
 * ambient credentials (`CDK_DEFAULT_ACCOUNT`/`CDK_DEFAULT_REGION`, which the CDK CLI resolves before
 * running the app), so the pipeline lands in whichever account `deploy-ci` is run against -- the
 * hub/RES account. There is deliberately no config field for it: a second place to say "which
 * account" is a second place for it to disagree with the credentials actually in use.
 */
export class PipelineApp extends App {
  /** The stack holding the pipeline. Exposed so a test or an opt-in `bin/` can reach it. */
  public readonly pipelineStack: Stack;

  public constructor(props: PipelineAppProps) {
    super();

    const config = props.config;
    const name = `${config.application ?? DEFAULT_APPLICATION}-pipeline`;

    this.pipelineStack = new Stack(this, name, {
      stackName: name,
      env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
    });

    engineFor(config, props.disposable ?? false).render(this.pipelineStack, { config, pipelineName: name });

    // Same check and verbosity Blueprint applies to its pipeline stack. NOTE: in this repository the rules
    // are inert for the reason given in the file header, so nag findings here can only be measured
    // once that duplication is fixed (task `m4-nag-compliance`) -- do not read a clean run as proof.
    Aspects.of(this).add(new AwsSolutionsChecks({ verbose: false }));
  }
}
