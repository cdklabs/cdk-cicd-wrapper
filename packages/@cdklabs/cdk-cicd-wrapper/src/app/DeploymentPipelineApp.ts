// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The CDK app that holds the CD (deploy-side) pipeline of the container two-repo split. `cdk-cicd deploy-ci`
// points the CDK CLI at this via `--app` when the repo has a `deploy.config.ts` (Repo 2), so provisioning
// the CD pipeline needs no file in the user's config repo -- the same zero-touch shape as PipelineApp for
// the CI side. It renders exactly one stack: the CD pipeline (see DeploymentPipeline).

import { App, Aspects, DefaultStackSynthesizer, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { ResolvedDeploymentConfig } from '../config/types';
import { DeploymentPipeline } from '../engine/codepipeline/DeploymentPipeline';

/** Options for the CD pipeline app. */
export interface DeploymentPipelineAppProps {
  /** The resolved deployment configuration, as produced by `defineDeployment`. */
  readonly config: ResolvedDeploymentConfig;
  /** Delete the pipeline's own support resources with the stack, for throwaway pipelines. Off by default. */
  readonly disposable?: boolean;
}

/** A CloudFormation-safe stack name derived from the source repo (the deployment config has no `application`). */
function pipelineName(config: ResolvedDeploymentConfig): string {
  const base = config.repository?.name ?? 'cdk-cicd';
  const sanitized = base
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${sanitized || 'cdk-cicd'}-cd-pipeline`;
}

/**
 * A CDK app containing exactly one stack: the CD pipeline. Its environment comes from the ambient
 * credentials (the account/region `deploy-ci` is run against), matching PipelineApp -- one place to say
 * "which account", the credentials in use.
 */
export class DeploymentPipelineApp extends App {
  /** The stack holding the CD pipeline. Exposed so a test or an opt-in `bin/` can reach it. */
  public readonly pipelineStack: Stack;

  public constructor(props: DeploymentPipelineAppProps) {
    super({
      defaultStackSynthesizer: new DefaultStackSynthesizer({ qualifier: props.config.qualifier }),
    });
    const name = pipelineName(props.config);
    this.pipelineStack = new Stack(this, name, {
      stackName: name,
      env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
    });
    new DeploymentPipeline(this.pipelineStack, 'Cd', {
      config: props.config,
      removalPolicy: props.disposable ? RemovalPolicy.DESTROY : undefined,
    });
    Aspects.of(this).add(new AwsSolutionsChecks({ verbose: false }));
  }
}
