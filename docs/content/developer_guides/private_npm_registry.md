# Using a private NPM registry

A private npm registry is a custom repository for hosting Node.js packages that are not available to the general public. It has to be configured in both your local environment and the CI/CD pipeline.

## Local setup

Configuring a private npm registry locally is done through `.npmrc`:

1. **Obtain an authorization token** from your private registry's administrative dashboard or authentication mechanism.

2. **Create a `.npmrc` file** in the root directory of your project.

3. **Specify the registry URL**:

   ```
   registry=https://private-registry.example.com
   ```

   To scope it to a particular npm scope instead of overriding the default registry, put the scope before the registry:

   ```
   @cdklabs:registry=https://private-registry.example.com
   ```

4. **Add authentication credentials**:

   ```
   //private-registry.example.com/:_authToken=your-token
   ```

### Example

```
# Content of .npmrc
@cdklabs:registry=https://jfrog.com/artifactory/api/npm/cdklabs-npm-release/
//jfrog.com/artifactory/api/npm/cdklabs-npm-release/:_authToken=eya......
```

Run `npm ci` after any change to `.npmrc` to verify the new configuration.

**Note**: Never share your authentication tokens or commit the `.npmrc` file. It must live in the project root, since the various `cdk-cicd check`/audit commands read it from there too.

## CI/CD pipeline setup

Configure the same registry for the pipeline's own builds with the `npmRegistry` field in `cicd.config.ts`:

```typescript
import { defineCICD, Repository } from '@cdklabs/cdk-cicd-wrapper';

export default defineCICD({
  application: 'my-app',
  repository: Repository.codecommit('my-repo'),
  stages: ['dev', 'prod'],
  npmRegistry: {
    url: 'https://<your-domain>-<your-aws-account-id>.d.codeartifact.<region>.amazonaws.com/npm/<your-repository>/',
    basicAuthSecretArn: '<your-secret-arn>',
    scope: '<scope>', // e.g. 'cdklabs' for @cdklabs/* — omit to override the default registry instead
  },
});
```

`url`, `basicAuthSecretArn`, and `scope` map directly onto `NpmRegistryConfig`. When set, every build project the pipeline creates writes a `.npmrc` — scoped to `scope` when given, otherwise overriding the default registry — with the auth token read from Secrets Manager at container-start time, before `npm ci` runs.

Create a Secrets Manager secret holding **only** the token as plaintext, and pass its ARN as `basicAuthSecretArn`. Prefer a technical user's token dedicated to the pipeline over a personal token.

**Note**: this is the generic bearer-token registry path. If your private registry specifically is AWS CodeArtifact, see the [CodeArtifact guide](./codeartifact.md) instead — it authenticates via `aws codeartifact login` and IAM rather than a stored bearer token.
