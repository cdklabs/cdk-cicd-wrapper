# S3-based Git Repository Integration

As AWS CodeCommit will be deemphasized after July 25, 2024, you can use S3 as a Git repository with {{ project_name }}. This approach uses the [git-remote-s3](https://github.com/awslabs/git-remote-s3) tool to enable S3 as a git remote and LFS server.

## Prerequisites

1. Install the git-remote-s3 Python package:
```bash
pip install git-remote-s3
```


## Quick Setup

Configure your pipeline to use S3 as the repository:

```typescript
import { RepositorySource, PipelineBlueprint } from '@cdklabs/cdk-cicd-wrapper';

const pipeline = PipelineBlueprint.builder()
  .repository(RepositorySource.s3({
    bucketName: 'my-git-bucket',
    prefix: 'my-repo',  // Optional: Use a prefix to organize multiple repos
    branch: 'main',     // Optional: Defaults to 'main'
    roles: ['arn:aws:iam::123456789012:role/MyRole'] // Optional: Roles that can access the repo
  }))
  // ... other configuration
  .synth(app);
```

## Cloning the Repository

To clone a repository stored in S3:

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

The S3-based repository supports Git LFS. To use it:

1. Install git-lfs
2. In your repository:
```bash
git-lfs-s3 install
git lfs track "*.zip"  # Track large files
git add .gitattributes
```

## Security Considerations

- All data is encrypted at rest using S3's encryption capabilities
- Use bucket policies and IAM roles to control access

## Using with AWS CodePipeline

The S3-based repository automatically creates ZIP archives that can be used as source artifacts in AWS CodePipeline. The ZIP files are stored at:
```
s3://my-git-bucket/my-repo/refs/heads/<branch>/repo.zip
```

## Known Limitations

- No built-in pull request functionality
- Concurrent writes need to be managed carefully
- Branch deletion must be done using the `git-remote-s3` CLI

For more information about git-remote-s3, visit the [official repository](https://github.com/awslabs/git-remote-s3).
