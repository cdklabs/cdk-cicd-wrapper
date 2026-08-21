# Private npm registry (CodeArtifact)

If your dependencies (or the wrapper itself, pre-release) live in a private AWS CodeArtifact repository,
the pipeline's builds must authenticate before `npm ci`. Declare it once:

```ts
export default defineCICD({
  application: 'my-app',
  repository: Repository.codecommit('my-app'),
  stages: ['dev', 'prod'],
  codeArtifact: {
    domain: 'my-domain',
    repository: 'my-repo',
    npmScope: 'mycompany',        // for @mycompany/* packages; omit for the default registry
    // account / region default to the pipeline's own
  },
});
```

With this set, **every** build project the pipeline creates — the CI build, the self-update, and each
deploy — runs `aws codeartifact login --tool npm …` in a `pre_build` step before `npm ci`, and its role is
granted the read permissions CodeArtifact needs (`GetAuthorizationToken`, `GetRepositoryEndpoint`,
`ReadFromRepository`, and a service-scoped `sts:GetServiceBearerToken`).

With no `codeArtifact` set, the pipeline renders exactly as before — this is purely additive.

!!! tip "The build image needs the AWS CLI"
    The login step uses the AWS CLI, which the default CodeBuild image ships. If you pass a custom
    `CodePipelineEngineProps.buildImage`, make sure it has the AWS CLI on `PATH`.
