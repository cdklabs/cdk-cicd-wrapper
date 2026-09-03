// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Maps the resolved `Repository` to a CodePipeline source action. Raw aws-codepipeline-actions, not
// CDK Pipelines -- one source action, one artifact.

import {
  aws_codecommit as codecommit,
  aws_codepipeline as codepipeline,
  aws_codepipeline_actions as actions,
  aws_s3 as s3,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Repository, RepositorySourceType } from '../../config/repository';

/**
 * Resolve the CodeCommit repository for a source, creating it by default (Blueprint parity) or importing
 * it when the caller passed `Repository.codecommit(name, branch, { existing: true })`.
 *
 * A created repository is provisioned in the pipeline's own stack; an imported one must already exist.
 * The construct id is stable (`SourceRepo`) so the create/import switch does not churn the logical id of
 * downstream resources that reference it.
 */
export function resolveCodeCommitRepository(scope: Construct, repository: Repository): codecommit.IRepository {
  if (repository.existing) {
    return codecommit.Repository.fromRepositoryName(scope, 'SourceRepo', repository.name);
  }
  return new codecommit.Repository(scope, 'SourceRepo', { repositoryName: repository.name });
}

/** Build the pipeline's source action for the configured repository, writing into `output`. */
export function buildSourceAction(
  scope: Construct,
  repository: Repository,
  output: codepipeline.Artifact,
): codepipeline.IAction {
  switch (repository.repositoryType) {
    case RepositorySourceType.S3: {
      // `name` is `bucket/key`; a bucket-only name defaults the key to source.zip.
      const slash = repository.name.indexOf('/');
      const bucketName = slash >= 0 ? repository.name.slice(0, slash) : repository.name;
      const bucketKey = slash >= 0 ? repository.name.slice(slash + 1) : 'source.zip';
      return new actions.S3SourceAction({
        actionName: 'Source',
        bucket: s3.Bucket.fromBucketName(scope, 'SourceBucket', bucketName),
        bucketKey,
        output,
      });
    }
    case RepositorySourceType.CODECOMMIT:
      return new actions.CodeCommitSourceAction({
        actionName: 'Source',
        repository: resolveCodeCommitRepository(scope, repository),
        branch: repository.branch,
        output,
      });
    case RepositorySourceType.GITHUB:
    case RepositorySourceType.CODESTAR_CONNECTION: {
      if (repository.connectionArn === undefined) {
        throw new Error(
          `cdk-cicd: a CodeStar connection ARN is required for a ${repository.repositoryType} source -- ` +
            'use Repository.codestarConnection(name, connectionArn)',
        );
      }
      // name is `owner/repo`.
      const slash = repository.name.indexOf('/');
      const owner = slash >= 0 ? repository.name.slice(0, slash) : repository.name;
      const repo = slash >= 0 ? repository.name.slice(slash + 1) : repository.name;
      return new actions.CodeStarConnectionsSourceAction({
        actionName: 'Source',
        owner,
        repo,
        branch: repository.branch,
        connectionArn: repository.connectionArn,
        output,
      });
    }
    default:
      throw new Error(`cdk-cicd: unsupported repository source type '${repository.repositoryType}'`);
  }
}
