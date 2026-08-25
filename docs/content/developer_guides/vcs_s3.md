# Amazon S3 based Git Repository Integration

As AWS CodeCommit is deemphasized for new customers, you can use S3 as a Git repository with {{ project_name }}. This approach uses the [git-remote-s3](https://github.com/awslabs/git-remote-s3) tool to enable S3 as a git remote and LFS server.

## Prerequisites

Install the git-remote-s3 Python package:

```bash
pip install git-remote-s3
```

## Configuration

`Repository.s3(name, branch?)` takes a versioned S3 object as `bucket/key` (a bucket-only name defaults the key to `source.zip`). The pipeline's source action watches that **exact** object key — `git-remote-s3` itself writes each branch's zip under `refs/heads/<branch>/repo.zip` (see below), so point `name` at that literal path for the branch you want to trigger the pipeline:

```typescript
import { defineCICD, Repository } from '@cdklabs/cdk-cicd-wrapper';

export default defineCICD({
  application: 'my-app',
  repository: Repository.s3('my-git-bucket/my-repo/refs/heads/main/repo.zip'),
  stages: ['dev', 'prod'],
});
```

`Repository.s3`'s `branch` argument (unlike `codecommit`/`github`) is not read by the S3 source action — the object key alone determines what the pipeline watches, so it is only informational here.

**Note**: unlike Blueprint (0.x)'s `RepositorySource.s3({ bucketName, prefix, roles })`, v3's `Repository.s3(...)` has no `roles` option to scope down bucket access — grant access to the bucket separately if you need to restrict who can push.

## Cloning the Repository

```bash
# For repositories without a prefix
git clone s3+zip://my-git-bucket my-local-repo

# For repositories with a prefix
git clone s3+zip://my-git-bucket/my-repo my-local-repo
```

The `s3+zip://` protocol ensures that an additional zip archive is created alongside the git bundle, which is required for AWS CodePipeline integration.

## Working with Branches

Creating and pushing branches works as with any other Git repository:

```bash
git checkout -b feature/new-feature
git add .
git commit -m "feat: add new feature"
git push origin feature/new-feature
```

## Large File Storage (LFS) Support

The S3-based repository supports Git LFS:

1. Install [git-lfs](https://git-lfs.com/).
2. In your repository:

```bash
git-lfs-s3 install
git lfs track "*.zip"  # Track large files
git add .gitattributes
```

## Security Considerations

- All data is encrypted at rest using Amazon S3's encryption capabilities.
- Use bucket policies and IAM roles to control access — see the note under Configuration above.

## Using with AWS CodePipeline

The Amazon S3 based repository automatically creates ZIP archives that the pipeline's source action reads directly. The ZIP files are stored at:

```
s3://my-git-bucket/my-repo/refs/heads/<branch>/repo.zip
```

## Known Limitations

- No built-in pull request functionality.
- Concurrent writes need to be managed carefully.
- Branch deletion must be done using the `git-remote-s3` CLI.

For more information about git-remote-s3, visit the [official repository](https://github.com/awslabs/git-remote-s3).
