// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The CD (deploy-side) CodePipeline of the container two-repo split (m6-container, Repo 2). Where the CI
// pipeline (CodePipelineEngine + `deployerImage`) builds & pushes a config-agnostic image, THIS pipeline
// consumes it: a config-only source repo (the `deploy.config.ts`, no CDK code) triggers a CodePipeline
// whose single privileged CodeBuild logs in to ECR, then runs `cdk-cicd deploy --from-image` -- which pulls
// the pinned image and runs it once per target to synth-and-deploy that stage. One image -> many CD runs.
//
// It is deliberately the deploy-side twin of `renderImageBuild`: Source -> one CodeBuild. Per-target
// manual-approval gates are a later refinement (the CI pipeline already models per-stage approvals); this
// runs every target of `deploy.config.ts` in one build, in order.

import { DefaultStackSynthesizer, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { buildSourceAction } from './source';
import { ResolvedDeploymentConfig } from '../../config/types';
import { SupportResources } from '../../support/SupportResources';

/** Node runtime for the CD build image's install phase (kept in step with the CI engine). */
const NODE_RUNTIME_VERSION = 22;
/** The CDK bootstrap roles `cdk deploy` assumes (same set the CI engine grants). */
const BOOTSTRAP_ROLE_KINDS = ['deploy', 'file-publishing', 'image-publishing', 'lookup'];

/** Options for the CD deployment pipeline. */
export interface DeploymentPipelineProps {
  /** The resolved deployment configuration (`defineDeployment`); its `repository` is the pipeline source. */
  readonly config: ResolvedDeploymentConfig;
  /** Removal policy for the pipeline's own support resources. `DESTROY` for a disposable pipeline. */
  readonly removalPolicy?: RemovalPolicy;
  /** Optional custom CodeBuild image for the deploy project (must have docker + the AWS CLI). */
  readonly buildImage?: string;
}

/**
 * Renders the CD CodePipeline into `scope` (a Stack): Source (the config repo) -> Deploy (one privileged
 * CodeBuild that ECR-logs-in and runs `cdk-cicd deploy --from-image --yes`). The CLI is installed from the
 * source repo's own `package.json` (`npm ci`), so the config repo carries no CDK code -- only config + the
 * CLI dependency.
 */
export class DeploymentPipeline extends Construct {
  public readonly pipeline: codepipeline.Pipeline;

  constructor(scope: Construct, id: string, props: DeploymentPipelineProps) {
    super(scope, id);
    const config = props.config;
    if (config.repository === undefined) {
      throw new Error(
        'cdk-cicd: defineDeployment needs a `repository` to provision a CD pipeline -- set it, or use the ' +
          'local `cdk-cicd deploy --from-image` executor instead.',
      );
    }
    const removalPolicy = props.removalPolicy;
    const stack = Stack.of(this);

    // Log in to the image's OWN ECR registry (derived from `config.image`, not the pipeline account) so a
    // cross-account/region image still pulls. Non-ECR (public/OCI) images need no login. Host shape:
    // <account>.dkr.ecr.<region>.<suffix>/<repo>:<tag>.
    const imageHost = config.image.split('/')[0];
    const isEcr = imageHost.includes('.dkr.ecr.');
    const ecrRegion = isEcr ? imageHost.split('.')[3] : stack.region;

    const sourceOutput = new codepipeline.Artifact();
    const support = new SupportResources(this, 'Support', { removalPolicy });
    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', { artifactBucket: support.artifactBucket });

    pipeline.addStage({ stageName: 'Source', actions: [buildSourceAction(this, config.repository, sourceOutput)] });

    // The deploy build: log in to ECR (so `docker run` can pull the pinned image), install the CLI from the
    // config repo, materialize credentials, then deploy every target from the image. Runs privileged for
    // the docker-in-docker. CodeBuild exposes credentials via the container-credentials endpoint, not as
    // static AWS_* env vars -- but `deploy --from-image` forwards creds into the deployer container BY NAME,
    // so we export them to static env vars first (via the AWS CLI, with a container-endpoint fallback).
    const commands = [
      ...(isEcr
        ? [`aws ecr get-login-password --region ${ecrRegion} | docker login --username AWS --password-stdin ${imageHost}`]
        : []),
      'npm ci',
      'eval "$(aws configure export-credentials --format env 2>/dev/null)" || { ' +
        'CREDS=$(curl -s "http://169.254.170.2${AWS_CONTAINER_CREDENTIALS_RELATIVE_URI}"); ' +
        'export AWS_ACCESS_KEY_ID=$(echo "$CREDS" | jq -r .AccessKeyId); ' +
        'export AWS_SECRET_ACCESS_KEY=$(echo "$CREDS" | jq -r .SecretAccessKey); ' +
        'export AWS_SESSION_TOKEN=$(echo "$CREDS" | jq -r .Token); }',
      'npx cdk-cicd deploy --from-image --yes',
    ];
    const project = new codebuild.PipelineProject(this, 'Deploy', {
      environment: {
        buildImage:
          props.buildImage !== undefined ? codebuild.LinuxBuildImage.fromDockerRegistry(props.buildImage) : undefined,
        privileged: true,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          ...(props.buildImage === undefined
            ? { install: { 'runtime-versions': { nodejs: NODE_RUNTIME_VERSION } } }
            : {}),
          build: { commands },
        },
      }),
    });

    // The deploy build runs `cdk deploy` per target, which does everything through the CDK bootstrap
    // roles -- so the project's role needs permission to assume them in EACH target's account/region (plus
    // any forced deployer role). This mirrors the CI engine's grantDeployPermissions. The qualifier is the
    // bootstrap default because that is what the wrapper's synthesizer uses; an app on a custom
    // bootstrapQualifier would need its own roles granted (finding
    // code-review-bootstrap-qualifier-not-single-source-of-truth).
    const qualifier = DefaultStackSynthesizer.DEFAULT_QUALIFIER;
    const roleArns = new Set<string>();
    const versionParams = new Set<string>();
    for (const target of config.targets) {
      const account = target.env.account;
      // A target with no explicit account deploys under the pipeline's ambient account; we cannot name its
      // bootstrap roles at synth time, so the project's own identity (or a forced role) must cover it.
      if (account !== undefined) {
        for (const region of target.env.regions) {
          for (const kind of BOOTSTRAP_ROLE_KINDS) {
            roleArns.add(`arn:${stack.partition}:iam::${account}:role/cdk-${qualifier}-${kind}-role-${account}-${region}`);
          }
          versionParams.add(`arn:${stack.partition}:ssm:${region}:${account}:parameter/cdk-bootstrap/${qualifier}/version`);
        }
      }
      // A stage's `deployRole` is a CloudFormation SERVICE role (passed as --role-arn); granting the
      // project sts:AssumeRole on it mirrors the CI engine and covers the case where the CLI assumes it.
      const forced = target.deployment?.deployRole;
      if (forced !== undefined && forced.length > 0) roleArns.add(forced);
    }
    if (roleArns.size > 0) {
      project.addToRolePolicy(new iam.PolicyStatement({ actions: ['sts:AssumeRole'], resources: [...roleArns] }));
    }
    if (versionParams.size > 0) {
      project.addToRolePolicy(new iam.PolicyStatement({ actions: ['ssm:GetParameter'], resources: [...versionParams] }));
    }

    pipeline.addStage({
      stageName: 'Deploy',
      actions: [new actions.CodeBuildAction({ actionName: 'DeployFromImage', project, input: sourceOutput })],
    });

    // cdk-nag suppressions, mirroring the CI engine so a real `deploy-ci` synth (which runs
    // AwsSolutionsChecks via DeploymentPipelineApp) does not abort on expected pipeline findings.
    NagSuppressions.addResourceSuppressions(
      project,
      [
        { id: 'AwsSolutions-IAM5', reason: 'CodeBuild default log/report/artifact wildcards, plus scoped sts:AssumeRole on the CDK bootstrap roles.' },
        { id: 'AwsSolutions-CB3', reason: 'Privileged mode is required to run the deployer image (docker) inside CodeBuild.' },
      ],
      true,
    );
    NagSuppressions.addResourceSuppressions(support.artifactBucket, [
      { id: 'AwsSolutions-S1', reason: 'Pipeline artifact bucket; server access logging is not required for it.' },
    ]);
    NagSuppressions.addResourceSuppressions(
      pipeline,
      [{ id: 'AwsSolutions-IAM5', reason: 'CodePipeline and its source/action roles use CDK-generated wildcard permissions.' }],
      true,
    );

    this.pipeline = pipeline;
  }
}
