# Using private NPM registry

A private npm registry is a custom repository for hosting Node.js packages, which are not available to the general public.
The private NPM registry has to be configured in both local and on the CI/CD environment.

## Local setup

Configuring a private npm registry using the .npmrc file involves specifying the registry URL and authentication credentials. Here's a step-by-step guide:

1. Obtain Authorization Token:
   To access private packages from a registry, you need an authorization token. This token grants you permission to download and publish packages to the private registry. You can generate a token from your private registry's administrative dashboard or using the registry's authentication mechanism.

2. Create a .npmrc File:
   Create a file named `.npmrc` in the root directory of your project. This file will store your registry URL and authentication credentials.

3. Specify Registry URL:

In the .npmrc file, add the URL of your private registry. For instance, if your registry URL is https://private-registry.example.com, add the following line:

```
registry=https://private-registry.example.com
```

3.1 Specify scope
In case you want to use the registry only for [scoped dependencies](https://docs.npmjs.com/about-scopes), add the scope definition before the registry.

```
@harvesting-vp:registry=https://private-registry.example.com
```

4. Add Authentication Credentials:

To authenticate with the private registry, you need to specify your authorization token. There are two ways to do this:

**Basic Authentication:**

Add the following lines to your `.npmrc`` file:

```
//private-registry.example.com/:_authToken=your-token

```

**API Token:**

If your registry supports API tokens, you can use the `//registry.npmjs.org/:_authToken=${NPM_TOKEN}` format.
Set the `NPM_TOKEN` environment variable to your API token value.

### Example:

```
# Content of .npmrc
@cdklabs:registry=https://jfrog.com/artifactory/api/npm/cdklabs-npm-release/
//jfrog.com/artifactory/api/npm/cdklabs-npm-release/:_authToken=eya......
```

Anytime you modify the `.npmrc` file it is highly recommended to verify the new configuration. It can be done with an `npm ci` call.

**Note**
Never share your authentication tokens or commit the .npmrc file.

**Note**
.npmrc file must be placed into the project root folder as it is used by the various audit processes as well to interact with the repository


## CI/CD environment setup

The private npm registry information must to be configured for the CI CD pipeline as well.

The `{{ project_name }}Builder` has a configuration method which accepts:

- url: NPM registry url
- basicAuthSecretArn: AWS SecretManager Secret arn, will be detailed soon
- scope: NPM Registry scope if it is used

To set this configuration you must add the following to your code where you have defined {{ project_name }}Builder
```
import * as vp from '{{ npm_codepipeline }}';

const npmRegistryConfig: vp.NPMRegistryConfig = {
  url: "https://<your-domain>-<your-aws-account-id>.d.codeartifact.<region>.amazonaws.com/npm/<your-repository>/", 
  basicAuthSecretArn: "<your-secret-arn>", 
  scope: "<scope>" 
};

vp.{{ project_name }}Blueprint.builder().npmRegistry(npmRegistryConfig).synth(app);
```

The NPM Authentication Token needs to remain secret that is why the {{ project_name }} uses AWS SecretManager to store it.

Create a secret in AWS Secrets Manager and store the authentication token as plaintext. This is viable for long living tokens. The value of the secret needs to be **only** the token. Provide the arn of this secret as `basicAuthSecretArn` either as a hardcoded string  in your npmRegistryConfig or through an environment variable but in this case the environment variable name **must** be `NPM_BASIC_AUTH_ID`.

**Note** It is recommended to use technical users and token dedicated to them, rather than personal tokens.
