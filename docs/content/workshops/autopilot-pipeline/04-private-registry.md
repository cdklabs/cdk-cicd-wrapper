# Private npm registry (CodeArtifact)

!!! abstract "What you'll build"
    - A pipeline whose builds authenticate to a private AWS CodeArtifact repository before `npm ci`.
    - The read permissions the build roles need, granted automatically from one config block.

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
    `ci.image` (chapter 1), make sure it has the AWS CLI on `PATH`.

## Verify

!!! success "Verify"
    - In a CI build's logs, a `pre_build` step runs `aws codeartifact login --tool npm …` and the
      subsequent `npm ci` resolves your private packages.
    - The build fails fast with an auth error if the domain/repository names are wrong or the role lacks
      access — a clear signal the block is misconfigured rather than a silent public-registry fallback.

## Recap

One `codeArtifact` block wires every build project to your private registry and grants the read
permissions automatically — no per-project buildspec edits.

!!! tip "Non-CodeArtifact registries"
    For any npm-compatible registry that isn't CodeArtifact, use `npmRegistry` instead of `codeArtifact`:
    `npmRegistry: { url: 'https://npm.example.com/', basicAuthSecretArn: '<secret-arn>', scope: 'mycompany' }`.
    Each build writes a scoped `.npmrc` with a bearer token read from the given Secrets Manager secret. See
    the [Configuration Reference](https://cdklabs.github.io/cdk-cicd-wrapper/developer_guides/configuration.html).

Next: container mode, where a single config-agnostic image deploys to many targets.
