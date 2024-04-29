# Contributing Guidelines

Thank you for your interest in contributing to the {{ project_name }}. Whether it's a bug report, new feature, correction, or additional documentation, we greatly value feedback and contributions from our community.

Please read through this document before submitting any issues or pull requests to ensure we have all the necessary information to effectively respond to your bug report or contribution.

## Project Structure

The structure of this project is as follows:

```bash
├── docs                                  # Documentation 
├── packages                              # Packages
│   └── @cdklabs
│       ├── cdk-cicd-wrapper              # CDK CI/CD Wrapper Blueprint
│       └── cdk-cicd-wrapper-cli          # CLI tools to support the Blueprint
├── projenrc                              # Projen source
├── samples                               # Samples folder for demonstrating various aspects of the tool
├── .projenrc.ts                          # Projen file to manage project structure
├── CHANGELOG.md
├── CODE_OF_CONDUCT.md
├── CONFIGVARS.md
├── CONTRIBUTING.md
├── LICENSE
├── NOTICE
├── OSS_License_Summary.csv
├── README.md
├── Taskfile.yml                          # Contains helpful tasks that are useful during development
├── bandit.yaml
├── licensecheck.json
├── package-verification.json
├── package.json
├── tsconfig.dev.json
├── tsconfig.json
└── yarn.lock
```

### **docs**

This is where the documentation site is defined and built.

### **packages**

This folder the sources are located


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
3. Run `task build` to ensure everything builds and tests correctly.
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

> cdk-cicd-wrapper@1.2.3 commitlint
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

> cdk-cicd-wrapper@1.2.3 commitlint
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

## Working with documentation
The documentation for the CDK CI/CD Wrapper Core is stored under the docs/ (index file: index.md) and is designed to be viewed as an MkDocs html site. Before heading to the documentation we highly recommend you:

test
- Run the build docs script `task docs` using you UNIX cli
- Start the local mkdocs webserver to view locally the ConfigBuilder documentation site with the `task docs:serve` command; the documentation will then be available at http://localhost:8000

## Testing Packages locally
This section explains how you can run local versions of the {{ project_name }} packages that you have made changes to.
You would typically do this when testing new features or fixes that you are trying to contribute to this project.

### Prerequisite
An AWS account available for testing with Administrator access.

### First steps

Configure the following environment variables:

|Name|Description|Required|Default|Example|
|----|-----------|---|---|----|
|AWS_PROFILE|[AWS Profile](https://docs.aws.amazon.com/sdkref/latest/guide/file-format.html#file-format-profile) to use for interacting with the AWS account. This profile is used to create an AWS CodeArtifact to host the {{ project_name }} packages, while the version is not publicly available. | true | | 123456789012 |
|DOMAIN     |AWS CodeArtifact Domain name to use     | true | cdk-cicd-wrapper | |
|REPOSITORY |AWS CodeArtifact repository name to use | true | cdk-cicd-wrapper | |
|SECRET_ID  |AWS SecretManager Secret name to publish to login token. This token will be used by the {{ project_name }} pipeline to be able to pull the packages at the Synth stage. | true | cdk-cicd-wrapper | |

The values can be placed into a `.env` file in the root of the project as well.

### Publish the CDK CI/CD packages into AWS CodeArtifact

#### Login to CodeArtifact
It is highly recommended to set up a separate AWS CodeArtifact for testing and developing the {{ project_name }}.
With a single ```task codeartifact:login``` command you can login to the AWS CodeArtifact.
In case the AWS CodeArtifact Domain or Repository are not existing, then it creates it based on the provided DOMAIN, REPOSITORY.

The created AWS CodeArtifact Domain and Repository can be deleted with the `task codeartifact:repository:delete` command.

**Note**
The command might fail with message like `exit status 255` or similar. This means your AWS Session has been expired.

#### Publish 
The {{ project_name }} packages can be publish with the `task codeartifact:publish` command.

This command unpublish the previous package in cases where the package version has not been changed.

### Use the packages from AWS CodeArtifact

The {{ project_name }} packages can be added to any CDK project from the AWS CodeArtifact with the `npm install --save @cdklabs/cdk-cicd-wrapper @cdklabs/cdk-cicd-wrapper-cli`. Then you can follow the [Getting Started](../getting_started/index.md) Guide.

#### Configure the pipeline to use the AWS CodeArtifact

### Use a sample app for development
The repository comes with a `samples` folder that host example projects to understood the benefit of the {{ project_name }}.

Once you've selected a sample, that you'd like to use as baseline. 
The available samples can be listed, with the `task samples:list` command.
Set the `SAMPLE_APP` environment variable name as the folder is called inside the sample folder.

You can use e.g: `export SAMPLE_APP=ts-cdk-project-with-private-repository;`. 
In case you want to use the `ts-cdk-project-with-private-repository` you can skip this step as that is the default sample used.

Then you need to execute the `task samples:dev:init` command.
This command create the `development/project` temporarily folder and initialize the project with [Projen](https://projen.io/).

#### Configure environment variables for the sample application
The environment variables listed on the [Variables](../developer_guides/variables.md) page.
These variables can be included into the `.env` file in either the root or int he `development/project` folder.

The requirements for the samples projects can be different, so check the **README.md** file of the sample application for further details.

You can verify the recognized configuration with the `task samples:dev:info`. This is recommended if you manage multiple AWS accounts.

#### 

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
