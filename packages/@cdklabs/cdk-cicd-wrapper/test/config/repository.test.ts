// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Repository, RepositorySourceType } from '../../src/config/repository';

describe('m3-config: Repository', () => {
  test('github carries the GITHUB type and defaults the branch to main', () => {
    const r = Repository.github('cdklabs/example');
    expect(r.repositoryType).toBe(RepositorySourceType.GITHUB);
    expect(r.name).toBe('cdklabs/example');
    expect(r.branch).toBe('main');
    expect(r.connectionArn).toBeUndefined();
  });

  test('a branch override is honoured', () => {
    expect(Repository.github('org/repo', 'release').branch).toBe('release');
  });

  test('codecommit and s3 carry their own types', () => {
    expect(Repository.codecommit('svc').repositoryType).toBe(RepositorySourceType.CODECOMMIT);
    expect(Repository.s3('bucket/key').repositoryType).toBe(RepositorySourceType.S3);
  });

  test('codestarConnection is the only factory that records a connection ARN', () => {
    const arn = 'arn:aws:codestar-connections:us-west-2:111111111111:connection/abc';
    const r = Repository.codestarConnection('org/repo', arn);
    expect(r.repositoryType).toBe(RepositorySourceType.CODESTAR_CONNECTION);
    expect(r.connectionArn).toBe(arn);
    expect(Repository.github('org/repo').connectionArn).toBeUndefined();
  });
});
