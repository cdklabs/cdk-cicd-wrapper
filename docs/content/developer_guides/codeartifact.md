# Using AWS CodeArtifact

AWS CodeArtifact is a fully managed artifact repository service that makes it easy for organizations of any size to securely store, publish, and share software packages used in their development process.

## Prerequisites

If you do not have an existing AWS CodeArtifact repository, create one using the AWS Management Console or AWS CLI — see [Creating a repository](https://docs.aws.amazon.com/codeartifact/latest/ug/getting-started.html#get-started-create-repo). Ensure the repository is configured to upstream the desired package sources; it must be able to fetch `aws-cdk-lib` and `@cdklabs/*` packages.

## Configuring the CI/CD pipeline

Set the `codeArtifact` field in `cicd.config.ts`:

```typescript
import { defineCICD, Repository } from '@cdklabs/cdk-cicd-wrapper';

export default defineCICD({
  application: 'my-app',
  repository: Repository.codecommit('my-repo'),
  stages: ['dev', 'prod'],
  codeArtifact: {
    domain: 'my-domain',
    repository: 'my-repo',
    // account/region default to the pipeline's own account/region
    npmScope: 'cdklabs', // omit for the default (unscoped) npm registry
  },
});
```

When set, every build project the pipeline creates runs `aws codeartifact login` before `npm ci` and is granted read access to the repository — this is also how a pipeline installs the wrapper itself before it is published to the public npm registry (e.g. while running against an alpha/`next` build).

**Note**: `codeArtifact` covers npm only. Unlike Blueprint (0.x)'s `CodeArtifactPlugin`, v3 has no `repositoryTypes` option for Python/Swift/.NET package formats through CodeArtifact — `CodeArtifactConfig` (`domain`/`repository`/`account`/`region`/`npmScope`) is npm-scoped only.

**Current limitation:** the `GITHUB_ACTIONS` engine does not yet wire `codeArtifact` up with working IAM grants (see the note in the [GitHub Integration guide](./vcs_github.md)) — this option is confirmed to work with the default `CODEPIPELINE` engine and `CDK_PIPELINES`.
