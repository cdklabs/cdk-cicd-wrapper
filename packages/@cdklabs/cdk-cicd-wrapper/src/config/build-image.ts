// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The Docker deployer-image build for the two-repo container mode (Repo 1). When a config carries a
// `build`, the CodePipeline engine renders a SECONDARY pipeline that runs CI and then builds & pushes a
// config-agnostic deployer image to ECR -- it deploys nothing. The image payload is the CDK app + its
// npm deps (installed in the image), NOT `cdk.out`, so Repo 2 can synth-and-deploy it offline against any
// target's config. See docs/design/v3-devops-experience.md (Level 2, two-repository split).

/**
 * Validate the shared `ci.image` string contract before an engine classifies the image.
 *
 * Registry credentials must never be embedded in the image string: CodeBuild receives them through
 * Secrets Manager, while GitHub Actions receives secret expressions in `container.credentials`.
 */
export function assertValidCiImageReference(image: string): void {
  const invalidReference = (): never => {
    throw new Error(
      'cdk-cicd: ci.image must be a non-empty Docker/OCI image reference without a URL scheme or whitespace.',
    );
  };

  if (image.trim() !== image || image.length === 0 || /\s/.test(image) || /^[a-z][a-z0-9+.-]*:\/\//i.test(image)) {
    invalidReference();
  }

  const firstAt = image.indexOf('@');
  if (firstAt >= 0) {
    const digest = image.slice(firstAt + 1);
    const isDigestReference =
      firstAt > 0 &&
      image.indexOf('@', firstAt + 1) < 0 &&
      /^[A-Za-z][A-Za-z0-9]*(?:[+._-][A-Za-z0-9]+)*:[A-Za-z0-9=_-]+$/.test(digest);
    if (!isDigestReference) {
      throw new Error(
        'cdk-cicd: ci.image must not embed registry credentials, and digest references must use ' +
          "`<image>@<algorithm>:<digest>`; use the engine's explicit build-registry credentials configuration.",
      );
    }
  }

  const imageName = firstAt >= 0 ? image.slice(0, firstAt) : image;
  if (imageName.startsWith('/') || imageName.endsWith('/') || imageName.includes('//')) {
    invalidReference();
  }
  const finalSlash = imageName.lastIndexOf('/');
  const tagSeparator = imageName.lastIndexOf(':');
  if (tagSeparator > finalSlash && tagSeparator === imageName.length - 1) {
    invalidReference();
  }
}

/** Return the lower-cased registry hostname without changing the repository/tag/digest portion. */
export function ciImageRegistryHost(image: string): string | undefined {
  const firstSlash = image.indexOf('/');
  return firstSlash > 0 ? image.slice(0, firstSlash).toLowerCase() : undefined;
}

/** Whether a normalized registry hostname belongs to, or is shaped like, a private ECR endpoint. */
export function isPrivateEcrRegistryHost(registryHost: string | undefined): boolean {
  return registryHost !== undefined && /\.dkr(?:\.ecr(?:-fips)?|-ecr(?:-fips)?)\./.test(registryHost);
}

/** Whether a normalized registry hostname is the Amazon ECR Public registry. */
export function isPublicEcrRegistryHost(registryHost: string | undefined): boolean {
  return registryHost === 'public.ecr.aws';
}

/** How the pushed image is tagged. */
export enum ImageTagStrategy {
  /**
   * Tag with the resolved Git commit SHA, or a deterministic SHA-256 of a non-Git source revision.
   * The default.
   */
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
