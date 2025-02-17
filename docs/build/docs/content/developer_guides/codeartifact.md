# Using CodeArtifact

AWS CodeArtifact is a fully managed artifact repository service that makes it easy for organizations of any size to securely store, publish, and share software packages used in their development process. AWS CodeArtifact supports popular package formats and works with commonly used build tools and package managers.

## Prerequisites
- If you do not have an existing AWS CodeArtifact repository please create one using the AWS Management Console or AWS CLI. For more information, see [Creating a repository](https://docs.aws.amazon.com/codeartifact/latest/ug/getting-started.html#get-started-create-repo). Ensure the repository is configured to upstream the desired package sources, you must be able to fetch 'aws-cdk-lib' and 'cdklabs' packages from the repository.

## Configuring the CI/CD pipeline

To use AWS CodeArtifact in your pipeline, you need to configure the `CodeArtifactPlugin` plugin. This plugin is responsible for setting up the necessary commands to authenticate with the AWS CodeArtifact repository and manage the required IAM permissions for the pipeline.

```typeScript
import { PipelineBlueprint, CodeArtifactPlugin } from '@cdklabs/cdk-cicd-wrapper';

const pipeline = PipelineBlueprint.builder()
  .plugin(new CodeArtifactPlugin({
    domain: 'my-domain',
    repositoryName: 'my-repo',
  }))
  .synth(app);
```

The above snippet configures the pipeline to authenticate with the AWS CodeArtifact repository `my-domain/my-repo`. The plugin will automatically set up the necessary IAM permissions for the pipeline to access the repository.

## Using AWS CodeArtifact for Python/Swift/dotnet packages

To use AWS CodeArtifact for Python, Swift, or dotnet packages, you need to configure the plugin for those package types. The `CodeArtifactPlugin` accepts an optional `repositoryTypes` parameter that allows you to specify the package types you want to use with AWS CodeArtifact.

```typeScript
import { PipelineBlueprint, CodeArtifactPlugin, CodeArtifactRepositoryTypes} from '@cdklabs/cdk-cicd-wrapper';

const pipeline = PipelineBlueprint.builder()
  .plugin(new CodeArtifactPlugin({
    domain: 'my-domain',
    repositoryName: 'my-repo',
    repositoryTypes: [CodeArtifactRepositoryTypes.NPM, CodeArtifactRepositoryTypes.PIP, CodeArtifactRepositoryTypes.SWIFT, CodeArtifactRepositoryTypes.NUGET],
  }))
  .addStack(new MyStack())
  .synth(app);
```