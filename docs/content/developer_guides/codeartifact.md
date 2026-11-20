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

When set, every build project the pipeline creates runs `aws codeartifact login` before `npm ci` and is granted read access to the repository — this is also how a pipeline installs packages that are not on the public npm registry, such as an unreleased build of the wrapper.

**Note**: `codeArtifact` covers npm only. Unlike Blueprint (0.x)'s `CodeArtifactPlugin`, Autopilot has no `repositoryTypes` option for Python/Swift/.NET package formats through CodeArtifact — `CodeArtifactConfig` (`domain`/`repository`/`account`/`region`/`npmScope`) is npm-scoped only.

`codeArtifact` is supported by all three engines (`CODEPIPELINE`, `CDK_PIPELINES` and `GITHUB_ACTIONS`). With `GITHUB_ACTIONS`, the generated workflow's synth job runs `aws codeartifact login` after it assumes the OIDC role, and that role is granted the same read access.
