// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/** Where a v3 pipeline's source lives. (Named `RepositorySourceType` rather than `RepositoryType`
 * because the latter is a distinct TS-only union alias already on the published v2 surface.) */
export enum RepositorySourceType {
  /** GitHub, via a CodeStar (CodeConnections) connection. */
  GITHUB = 'github',
  /** AWS CodeCommit. */
  CODECOMMIT = 'codecommit',
  /** Any provider reachable through a CodeStar/CodeConnections connection. */
  CODESTAR_CONNECTION = 'codestar_connection',
  /** A versioned S3 object as the source. */
  S3 = 's3',
}

/**
 * The source repository for a v3 pipeline. Constructed through the static factories rather than
 * directly, so the shape a caller writes (`Repository.github('org/repo')`) is the shape that reads
 * cleanly in every jsii language.
 */
export class Repository {
  /** GitHub `owner/name`, deployed through a CodeStar connection. */
  public static github(name: string, branch?: string): Repository {
    return new Repository(RepositorySourceType.GITHUB, name, branch);
  }

  /** An AWS CodeCommit repository by name. */
  public static codecommit(name: string, branch?: string): Repository {
    return new Repository(RepositorySourceType.CODECOMMIT, name, branch);
  }

  /** A provider reachable through an existing CodeStar/CodeConnections connection ARN. */
  public static codestarConnection(name: string, connectionArn: string, branch?: string): Repository {
    return new Repository(RepositorySourceType.CODESTAR_CONNECTION, name, branch, connectionArn);
  }

  /** A versioned S3 object (`bucket/key`) as the source. */
  public static s3(name: string, branch?: string): Repository {
    return new Repository(RepositorySourceType.S3, name, branch);
  }

  /** The kind of source. */
  public readonly repositoryType: RepositorySourceType;
  /** Provider-specific identifier: `owner/repo` for GitHub, the repository/bucket name otherwise. */
  public readonly name: string;
  /** Tracked branch. Defaults to `main`. */
  public readonly branch: string;
  /** The CodeStar/CodeConnections connection ARN, set only for `CODESTAR_CONNECTION`. */
  public readonly connectionArn?: string;

  private constructor(repositoryType: RepositorySourceType, name: string, branch?: string, connectionArn?: string) {
    this.repositoryType = repositoryType;
    this.name = name;
    this.branch = branch ?? 'main';
    this.connectionArn = connectionArn;
  }
}
