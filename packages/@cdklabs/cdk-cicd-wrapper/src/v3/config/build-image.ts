// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The Docker deployer-image build for the two-repo container mode (Repo 1). When a config carries a
// `build`, the CodePipeline engine renders a SECONDARY pipeline that runs CI and then builds & pushes a
// config-agnostic deployer image to ECR -- it deploys nothing. The image payload is the CDK app + its
// npm deps (installed in the image), NOT `cdk.out`, so Repo 2 can synth-and-deploy it offline against any
// target's config. See docs/design/v3-devops-experience.md (Level 2, two-repository split).

/** How the pushed image is tagged. */
export enum ImageTagStrategy {
  /** Tag with the resolved source commit sha (CODEBUILD_RESOLVED_SOURCE_VERSION). The default. */
  GIT_SHA = 'git_sha',
  /** Tag `latest` only. Simplest, but not immutable -- prefer GIT_SHA for real pipelines. */
  LATEST = 'latest',
}

/** Props for {@link BuildImage.docker}. */
export interface DockerBuildProps {
  /** Path to the Dockerfile in the source, relative to its root. Defaults to `Dockerfile`. */
  readonly dockerfile?: string;
  /**
   * Name of the ECR repository to push to. When omitted the pipeline PROVISIONS one named
   * `<application>-deployer`; when set to an existing repo name the pipeline references it and only needs
   * push permission. (A full registry URI is derived at deploy time from the pipeline's own account.)
   */
  readonly repositoryName?: string;
  /** How the image is tagged. Defaults to {@link ImageTagStrategy.GIT_SHA}. */
  readonly tagStrategy?: ImageTagStrategy;
}

/** What kind of artifact the build produces. Only Docker today; kept an enum so more can slot in. */
export enum BuildImageKind {
  DOCKER = 'docker',
}

/**
 * A deployer-image build. Constructed through the static factory (`BuildImage.docker({...})`) so the
 * shape a caller writes reads cleanly in every jsii language, mirroring {@link Repository}.
 */
export class BuildImage {
  /** Build and push a Docker deployer image to ECR. */
  public static docker(props: DockerBuildProps = {}): BuildImage {
    return new BuildImage(
      BuildImageKind.DOCKER,
      props.dockerfile ?? 'Dockerfile',
      props.tagStrategy ?? ImageTagStrategy.GIT_SHA,
      props.repositoryName,
    );
  }

  /** The artifact kind. */
  public readonly kind: BuildImageKind;
  /** Dockerfile path relative to the source root. */
  public readonly dockerfile: string;
  /** Image tag strategy. */
  public readonly tagStrategy: ImageTagStrategy;
  /** ECR repository name to push to; when undefined the pipeline provisions `<application>-deployer`. */
  public readonly repositoryName?: string;

  private constructor(
    kind: BuildImageKind,
    dockerfile: string,
    tagStrategy: ImageTagStrategy,
    repositoryName?: string,
  ) {
    this.kind = kind;
    this.dockerfile = dockerfile;
    this.tagStrategy = tagStrategy;
    this.repositoryName = repositoryName;
  }
}
