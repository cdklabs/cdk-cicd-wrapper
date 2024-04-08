# Contributing Guidelines

Thank you for your interest in contributing to the {{ project_name }}. Whether it's a bug report, new feature, correction, or additional documentation, we greatly value feedback and contributions from our community.

Please read through this document before submitting any issues or pull requests to ensure we have all the necessary information to effectively respond to your bug report or contribution.

## Project Structure

The structure of this project is as follows:

```bash
├── bin
├── docs
├── lib
│   ├── cli ### the cli code
│   ├── code-pipeline
│   ├── constructs ### constructs distributed through NPM
│   ├── examples
│   ├── resource-providers
│   ├── spi
│   ├── stacks
│   └── utils
├── scripts
│   └── lib
├── src
│   ├── codebuild
│   ├── lambda-functions
│   └── lambda-layer
├── test
│   ├── constructs
│   ├── examples
│   └── stacks
└── utils
    └── license-checker
```

### **docs**

This is where the documentation site is defined and built.

### **lib**

#### Testing xxx constructs

## Reporting Bugs/Feature Requests

We welcome you to use the GitHub issue tracker to report bugs or suggest features.

When filing an issue, please check existing open, or recently closed, issues to make sure somebody else hasn't already
reported the issue. Please try to include as much information as you can. Details like these are incredibly useful:

- A reproducible test case or series of steps
- The version of our code being used (semver)
- Any modifications you've made relevant to the bug
- Anything unusual about your environment or deployment

## Contributing via Pull Requests

Contributions via pull requests are much appreciated. Before sending us a pull request, please ensure that:

1. You are working against the latest source on the _main_ branch.
2. You check existing open, and recently merged, pull requests to make sure someone else hasn't addressed the problem already.
3. You open an issue to discuss any significant work - we would hate for your time to be wasted.

To send us a pull request, please:

1. Fork the repository.
2. Modify the source; please focus on the specific change you are contributing. If you also reformat all the code, it will be hard for us to focus on your change.
3. Run `npm run checks` to ensure everything builds and tests correctly.
   > This will execute all necessary verification `verification`, `build`, `test`, `audit`.
4. Commit to your fork on a new branch using [conventional commit messages](#commits).
5. Send us a pull request, answering any default questions in the pull request template.
6. Pay attention to any automated CI failures reported in the pull request, and stay involved in the conversation.

GitHub provides additional documentation on [forking a repository](https://help.github.com/articles/fork-a-repo/) and
[creating a pull request](https://help.github.com/articles/creating-a-pull-request/).

#### Commit Messages

By default we have enabled the commit-msg hook via [husky](https://typicode.github.io/husky/) which comes installed by default when you first run `npm ci`. We are enforcing the convention described in [conventionalcommits](https://www.conventionalcommits.org/en/v1.0.0/) by default for the commit messages to help make the collaboration between team members transparent and consistent. If your commit messages do not follow this convention, you won't be able to commit your changes from your local machine. Check the example below:
_WRONG COMMIT MESSAGE_

```bash
> git commit -m "foo: this will fail"

> harvesting-vanilla-pipeline@1.2.3 commitlint
> commitlint --edit

⧗   input: foo: this will fail
✖   type must be one of [build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test] [type-enum]

✖   found 1 problems, 0 warnings
ⓘ   Get help: https://github.com/conventional-changelog/commitlint/#what-is-commitlint

husky - commit-msg hook exited with code 1 (error)
```

_CORRECT COMMIT MESSAGE_

```bash
> git commit -m "docs: updated README.md with better instructions for the commit-msg hook"

> harvesting-vanilla-pipeline@1.2.3 commitlint
> commitlint --edit .git/COMMIT_EDITMSG

[feat/developer-tools 24192d7] docs: updated README.md with better instructions for the commit-msg hook
 1 file changed, 1 insertion(+), 1 deletion(-)
```

## Commits

This package utilizes [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) and as such all commit messages will need to adopt this format. A `commit-msg` hook is installed as part of this package to enforce correct commit message structure and will be run anytime a `git commit ...` is executed.

[Commitizen](https://github.com/commitizen/cz-cli) has been installed for your convenience which provides a guided UI
for committing changes. To commit your changes run the following commands:

```bash
git add -A # stage your changes
npx cz # launch commitizen
```

An interactive UI will be displayed which you can follow to get your change committed.

Package versioning is determined based on the semantic commit and as such it is very important this format is followed. A PR checker will also run to ensure the format of your commit message is compliant.

## Finding contributions to work on

Looking at the existing issues is a great way to find something to contribute on. As our projects, by default, use the default GitHub issue labels (enhancement/bug/duplicate/help wanted/invalid/question/wontfix), looking at any 'help wanted' issues is a great place to start.

## Code of Conduct

This project has adopted the [Amazon Open Source Code of Conduct](https://aws.github.io/code-of-conduct).
For more information see the [Code of Conduct FAQ](https://aws.github.io/code-of-conduct-faq) or contact
opensource-codeofconduct@amazon.com with any additional questions or comments.

## Security issue notifications

If you discover a potential security issue in this project we ask that you notify AWS/Amazon Security via our [vulnerability reporting page](http://aws.amazon.com/security/vulnerability-reporting/). Please do **not** create a public github issue.

## Licensing

See the [LICENSE](LICENSE) file for our project's licensing. We will ask you to confirm the licensing of your contribution.

We may ask you to sign a [Contributor License Agreement (CLA)](http://en.wikipedia.org/wiki/Contributor_License_Agreement) for larger changes.

## Testing Packages locally
This section explains how you can run local versions of the {{ project_name }} packages that you have made changes to.
You would typically do this when testing new features or fixes that you are trying to contribute to this project.
There are 2 ways of testing : 
-   Verdaicco : This is for testing your packages exclusively on your machine. Verdaccio allows you to host a local nom registry where you can then publish packages. In the context of {{ project_name }} this will come in handy in rapidly testing your initial deployments of {{ project_name }}. the main limitation of this is that once deployed your CICD pipeline will fail as it will not have access to your local npm registry. But this servers as a quick way to confirm that your modified {{ project_name }} will work for initial deployment
-   CodeArtifact : To be able to test your modified version of {{ project_name }} end to end and have it work in the {{ project_name }}'s code build instances you can use code artifact to host a private npm registry in the cloud.

See following sections explain how to set these two methods up.

### Verdaicco Setup
First, install Verdaccio on your local machine. You can do this by running ```npm install -g verdaccio``` in your command line.

After installing, start Verdaccio by running ```verdaccio``` in your command line. Verdaccio will then display the address of the local server (usually http://localhost:4873), which will serve as your local npm registry.

Create a ```.npmrc```  File: In your project directory, create a .npmrc file. Inside this file, add the following line:
```
<macro>:registry=http://localhost:4873
```
This configuration tells npm to use your local Verdaccio server as the registry for all package operations within this project.
The ```<macro>``` will scope the registry to only be used for the {{ project_name }} packages with are scoped under ```<macro>```
Ensure the ```.npmrc``` file is saved within your project directory.

####Publishing packages
Before publishing, you need to add a user to your Verdaccio registry for authentication purposes. Use the command:
```
npm adduser --registry http://localhost:4873
```
Then you can navigate to your package and run the following command to publish it
```
npm publish --registry http://localhost:4873
```

**Note**
In this repository, the {{ project_name }} packages are found in the .packages directory. 
There, you will find two separate directories: ```cdk-cicd-wrapper``` and ```cli```, which contain the two essential packages for {{ project_name }}. 
You will need to navigate (cd) into these directories individually and publish them. 
However, ensure you run ```npm run build``` before you publish them. 
When publishing the cdk-cicd-wrapper package, you must ensure you have NPM, .NET, Maven, and Python installed on your machine.

Once the packages are published, you can install them using the following command:
```
npm install <your-package-name> --registry http://localhost:4873
```
For {{ project_name }} your install commands will look like this :
```
npm install <macro>/cdk-cicd-wrapper --registry http://localhost:4873 --force
npm install <macro>/cdk-cicd-wrapper-cli --registry http://localhost:4873 --force
```
**Note**
You may need to use the --force flag here.

**Note**
Once you have completed this, you will be able to deploy from your local computer to AWS, but the CI/CD pipeline will fail as it does not have access to your local npm registry. Please follow the steps in the 'CodeArtifact for CI/CD Environment Setup' section detailing how to use CodeArtifact to host your npm registry.

### CodeArtifact for CI/CD environment setup
AWS CodeArtifact is a fully managed artifact repository service that makes it easy for developers to securely store, publish, and share software packages used in their software development process. 

Here’s how to set it up for your CI/CD environment:

Start in the AWS CodeArtifact Console by creating a domain, which is a container for repositories, and then create a repository within this domain to store your npm packages.

Alternatively you can do the above with the aws cli like so
```
aws codeartifact create-domain --domain <domain-name> 

aws codeartifact create-repository --domain <domain-name> --repository <repository-name> 
```
Replace <your-domain> and <repository-name> with your specific domain name and repository name.

Once your repository is created, use the AWS CLI to get an authorization token for your CodeArtifact repository. The command is:
```
aws codeartifact get-authorization-token --domain <your-domain> --domain-owner <your-aws-account-id> --query authorizationToken --output text
```
Replace <your-domain> and <your-aws-account-id> with your specific domain name and AWS account ID.

With your authorization token, configure npm to use your CodeArtifact repository as follows:
```
npm config set registry https://<your-domain>-<your-aws-account-id>.d.codeartifact.<region>.amazonaws.com/npm/<your-repository>/
```
Then, set the authorization token for your repository:
```
npm config set //<your-domain>-<your-aws-account-id>.d.codeartifact.eu-west-2.amazonaws.com/npm/{{ project_name }}core/:_authToken=<YOUR_AUTH_TOKEN>
```
Make sure to replace <your-domain>, <your-aws-account-id>, <region>, <your-repository>, and <YOUR_AUTH_TOKEN> with your specific details and the token you obtained in the previous step.

Now, you can publish your npm packages to your CodeArtifact repository using ```npm publish```

##### Use CodeArtifact Registry Locally
To use your CodeArtifact Registry locally on a project you will need to create a .npmrc file where you specify your registry and authorization token.

Create a ```.npmrc```  File: In your project directory, create a .npmrc file. Inside this file, add the following line:
```
<macro>:registry=https://<your-domain>-<your-aws-account-id>.d.codeartifact.<region>.amazonaws.com/npm/<your-repository>/
//<your-domain>-<your-aws-account-id>.d.codeartifact.eu-west-2.amazonaws.com/npm/{{ project_name }}core/:_authToken=<YOUR_AUTH_TOKEN>
```
Make sure to replace <your-domain>, <your-aws-account-id>, <region>, <your-repository>, and <YOUR_AUTH_TOKEN> with your specific details and the token you obtained in the previous step.
The ```<macro>``` will scope the registry to only be used for the {{ project_name }} packages with are scoped under ```<macro>```

Once the registry is set, you can install them using the following command:
```
npm install <your-package-name> --registry http://localhost:4873
```
For {{ project_name }} your install commands will look like this :
```
npm install <macro>/cdk-cicd-wrapper --registry http://localhost:4873 --force
npm install <macro>/cdk-cicd-wrapper-cli --registry http://localhost:4873 --force
```

##### Use CodeArtifact Registry in CI/CD environment
To make the Codebuild instance utilise your code artifact registry you will need to set the npmRegistry configuration in your `{{ project_name }}Builder` with the following parameters:
- url: NPM registry url
- basicAuthSecretArn: AWS SecretManager Secret arn, will be detailed soon
- scope: NPM Registry scope if it is used
  
You can do this like so:
```
import * as vp from '{{ npm_codepipeline }}';

const npmRegistryConfig: vp.NPMRegistryConfig = {
  url: "https://<your-domain>-<your-aws-account-id>.d.codeartifact.<region>.amazonaws.com/npm/<your-repository>/", 
  basicAuthSecretArn: "<your-secret-arn>", 
  scope: "<scope>" 
};
Make sure to replace <your-domain>, <your-aws-account-id>, <region>, <your-repository>, and <YOUR_AUTH_TOKEN> with your specific details and the token you obtained in the previous step.
For <scope> use <macro>

vp.{{ project_name }}Blueprint.builder().npmRegistry(npmRegistryConfig).synth(app);
```

The NPM Authentication Token needs to remain secret that is why the {{ project_name }} uses AWS SecretManager to store it.
Create a secret in AWS Secrets Manager and store the authentication token as plaintext. 
Please be aware the code artifact token expires after 12 hours so if you Codebuild runs after more than 12 hours since you last generated you auth token it will fail. So you will have to generate a new one and update your secret with it.

Your CICD environment will now automatically use your CodeArtifact Registry


## FAQ

### How do I bump dependency versions?

From the root directory run: `npm install`. This will bump all dependencies to be the same/latest versions and update the `package-lock.json` file.
Then, please update `package-verification.json` by running the following commands:

```bash
rm -rf node_modules ### remove the locally downloaded npm dependencies
npm install  ### install fresh from the package.json, this will generate package-lock.json as well
npm run validate:fix ### will generate the checksum for the package-lock.json which is checked in the CI/CD
npm run audit:fix:license ### will update the NOTICE file with the updated package versions
```

## CDK Useful commands

- `npm ci` install the packages from the frozen dependencies in the package-lock.json
- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `npm install` installs an npm package (make sure to run the npm run generate-checksum afterwards)
- `npm run generate-checksum` generate checksum of the package-lock.json (after installing new dependencies)
- `npm run audit` audits both NPM and Python dependencies
- `npm run audit-nodejs` audits NPM dependencies
- `npm run audit-python` audits Python dependencies
- `npm run lint` check for linting issues in the project
- `npm run lint-fix` fix linting issues in the project (do not forget to add & commit the fixed files)
- `cdk deploy` deploy this stack to your default AWS account/region
- `cdk diff` compare deployed stack with current state
- `cdk synth --all` emits the synthesized CloudFormation template for all stacks
