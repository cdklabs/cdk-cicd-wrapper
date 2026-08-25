// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The CD (deploy-side) CodePipeline of the container two-repo split (m6-container, Repo 2). Where the CI
// pipeline (CodePipelineEngine + `deployerImage`) builds & pushes config-agnostic image(s), THIS pipeline
// consumes them: a config-only source repo (the `deploy.config.ts`, no CDK code) triggers a CodePipeline
// with one Deploy action per target. Each target deploys from ITS OWN image version -- the tag/digest lives
// on the target in deploy.config and is read at RUN time -- so bumping one stage's image and committing
// deploys only that stage. Non-gated targets deploy in parallel; a gated target waits on a manual approval.
//
// Source -> Deploy (per-target privileged CodeBuild actions). Each action runs `cdk-cicd deploy --from-image
// --target <stage>`, which pulls that target's image and synth-and-deploys the stage offline in-container.

import { DefaultStackSynthesizer, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { buildSourceAction } from './source';
import { NpmRegistryConfig, ResolvedDeploymentConfig } from '../../config/types';
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
 * Renders the CD CodePipeline into `scope` (a Stack): Source (the config repo) -> a "Deploy" stage with one
 * privileged-CodeBuild action per ungated target (parallel), then a "DeployGated" stage with the gated
 * targets, each behind its own manual approval. Each action runs `cdk-cicd deploy --from-image --target
 * <stage>` -- pulling that target's own image version, read from deploy.config at run time. The CLI is
 * installed from the source repo's `package.json` (`npm ci`), so the config repo carries no CDK code.
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

    const sourceOutput = new codepipeline.Artifact();
    const support = new SupportResources(this, 'Support', { removalPolicy });
    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', { artifactBucket: support.artifactBucket });

    pipeline.addStage({ stageName: 'Source', actions: [buildSourceAction(this, config.repository, sourceOutput)] });

    // Log in to every distinct ECR registry across the targets' images (config default + per-target
    // overrides). The registry host is stable across version bumps -- only the tag changes, and the tag is
    // read from deploy.config at run time -- so logging in to the provision-time set of hosts is enough.
    const images = config.targets.map((t) => t.image ?? config.image).filter((i): i is string => i !== undefined);
    const ecrHosts = new Set(images.map((i) => i.split('/')[0]).filter((h) => h.includes('.dkr.ecr.')));
    const ecrLoginCommands = [...ecrHosts].map(
      (h) =>
        `aws ecr get-login-password --region ${h.split('.')[3]} | docker login --username AWS --password-stdin ${h}`,
    );

    // Optional CodeArtifact login so `npm ci` can install a pre-release wrapper CLI.
    const ca = config.codeArtifact;
    const codeArtifactLogin = ca
      ? [
          `aws codeartifact login --tool npm --domain ${ca.domain} --domain-owner ${ca.account ?? stack.account} ` +
            `--repository ${ca.repository} --region ${ca.region ?? stack.region}` +
            (ca.npmScope ? ` --namespace ${ca.npmScope}` : ''),
        ]
      : [];

    // Optional generic private-registry login, same shape and provenance as the CI engine's.
    const npmRegistry = config.npmRegistry;
    const npmRegistryLogin = npmRegistry ? npmRegistryLoginCommands(npmRegistry) : [];

    // ONE deploy build, run once per target as a separate pipeline action that sets TARGET_STAGE. It
    // deploys just that target from ITS OWN image version (read from deploy.config at run time), so bumping
    // a stage's image tag and committing deploys only that stage. Privileged for docker; creds materialized
    // to static env vars (CodeBuild serves them via the container-credentials endpoint) so
    // `deploy --from-image` can forward them into the deployer container by name.
    const commands = [
      ...ecrLoginCommands,
      ...codeArtifactLogin,
      ...npmRegistryLogin,
      'npm ci',
      'eval "$(aws configure export-credentials --format env 2>/dev/null)" || { ' +
        'CREDS=$(curl -s "http://169.254.170.2${AWS_CONTAINER_CREDENTIALS_RELATIVE_URI}"); ' +
        'export AWS_ACCESS_KEY_ID=$(echo "$CREDS" | jq -r .AccessKeyId); ' +
        'export AWS_SECRET_ACCESS_KEY=$(echo "$CREDS" | jq -r .SecretAccessKey); ' +
        'export AWS_SESSION_TOKEN=$(echo "$CREDS" | jq -r .Token); }',
      'npx cdk-cicd deploy --from-image --target "$TARGET_STAGE" --yes',
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
        // The bearer token `npmRegistryLoginCommands` writes into .npmrc; resolved by CodeBuild at
        // container start, not read via a shell `aws secretsmanager` call.
        ...(npmRegistry ? { env: { 'secrets-manager': { NPM_AUTH_TOKEN: npmRegistry.basicAuthSecretArn } } } : {}),
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
            roleArns.add(
              `arn:${stack.partition}:iam::${account}:role/cdk-${qualifier}-${kind}-role-${account}-${region}`,
            );
          }
          versionParams.add(
            `arn:${stack.partition}:ssm:${region}:${account}:parameter/cdk-bootstrap/${qualifier}/version`,
          );
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
      project.addToRolePolicy(
        new iam.PolicyStatement({ actions: ['ssm:GetParameter'], resources: [...versionParams] }),
      );
    }
    // CodeArtifact read for the build's `npm ci` (pre-release CLI install).
    if (ca) {
      const caAccount = ca.account ?? stack.account;
      const caRegion = ca.region ?? stack.region;
      project.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['codeartifact:GetAuthorizationToken'],
          resources: [`arn:${stack.partition}:codeartifact:${caRegion}:${caAccount}:domain/${ca.domain}`],
        }),
      );
      project.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['codeartifact:GetRepositoryEndpoint', 'codeartifact:ReadFromRepository'],
          resources: [
            `arn:${stack.partition}:codeartifact:${caRegion}:${caAccount}:repository/${ca.domain}/${ca.repository}`,
          ],
        }),
      );
      project.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['sts:GetServiceBearerToken'],
          resources: ['*'],
          conditions: { StringEquals: { 'sts:AWSServiceName': 'codeartifact.amazonaws.com' } },
        }),
      );
    }
    // The private-registry bearer token `npmRegistryLoginCommands` resolves via Secrets Manager.
    if (npmRegistry) {
      project.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'],
          resources: [npmRegistry.basicAuthSecretArn],
        }),
      );
    }

    // Each target deploys from its OWN image version (read from deploy.config at run time via `--target`).
    // Duplicate target stages would collide on action names -- reject them early with a clear message.
    const names = config.targets.map((t) => t.stage);
    const dup = names.find((s, i) => names.indexOf(s) !== i);
    if (dup !== undefined) {
      throw new Error(`cdk-cicd: duplicate deploy.config target stage '${dup}' -- each target needs a unique stage`);
    }
    const deployAction = (target: (typeof config.targets)[number], runOrder?: number) =>
      new actions.CodeBuildAction({
        actionName: `Deploy-${target.stage}`,
        project,
        input: sourceOutput,
        runOrder,
        environmentVariables: { TARGET_STAGE: { value: target.stage } },
      });

    // Two stages, so a pending gated approval never blocks the ungated targets:
    //  - "Deploy": every ungated target, in parallel (bump one, e.g. dev, and only it redeploys).
    //  - "DeployGated": every gated target, each behind its own manual approval; the deploys then run in
    //    parallel after approval (int + prod promote together).
    const ungated = config.targets.filter((t) => !t.manualApproval);
    const gated = config.targets.filter((t) => t.manualApproval);
    if (ungated.length > 0) {
      pipeline.addStage({ stageName: 'Deploy', actions: ungated.map((t) => deployAction(t)) });
    }
    if (gated.length > 0) {
      const gatedActions: codepipeline.IAction[] = [];
      for (const target of gated) {
        gatedActions.push(new actions.ManualApprovalAction({ actionName: `Approve-${target.stage}`, runOrder: 1 }));
        gatedActions.push(deployAction(target, 2));
      }
      pipeline.addStage({ stageName: 'DeployGated', actions: gatedActions });
    }

    // cdk-nag suppressions, mirroring the CI engine so a real `deploy-ci` synth (which runs
    // AwsSolutionsChecks via DeploymentPipelineApp) does not abort on expected pipeline findings.
    NagSuppressions.addResourceSuppressions(
      project,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'CodeBuild default log/report/artifact wildcards, plus scoped sts:AssumeRole on the CDK bootstrap roles.',
        },
        {
          id: 'AwsSolutions-CB3',
          reason: 'Privileged mode is required to run the deployer image (docker) inside CodeBuild.',
        },
      ],
      true,
    );
    NagSuppressions.addResourceSuppressions(support.artifactBucket, [
      { id: 'AwsSolutions-S1', reason: 'Pipeline artifact bucket; server access logging is not required for it.' },
    ]);
    NagSuppressions.addResourceSuppressions(
      pipeline,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'CodePipeline and its source/action roles use CDK-generated wildcard permissions.',
        },
      ],
      true,
    );

    this.pipeline = pipeline;
  }
}

/**
 * Writes a `.npmrc` authenticating npm against a generic private registry (mirrors the CI engine's
 * `npmRegistryLogin`; see there for the v2 `npm-login.sh` provenance).
 */
function npmRegistryLoginCommands(npm: NpmRegistryConfig): string[] {
  const host = npm.url.replace(/^https?:\/\//, '');
  const scope = npm.scope !== undefined && npm.scope.length > 0 ? npm.scope : undefined;
  const scopePrefix = scope !== undefined ? `${scope.startsWith('@') ? scope : `@${scope}`}:` : '';
  return [
    `echo "${scopePrefix}registry=${npm.url}" > ./.npmrc`,
    `echo "//${host}:_authToken=$NPM_AUTH_TOKEN" >> ./.npmrc`,
  ];
}
