# Advanced Pipeline Configuration Options

These new options allow you to configure the [AWS CDK CodePipeline](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.pipelines.CodePipeline.html) values.

In this guide, we'll explore new properties for configuring your CI/CD pipeline using the CDK CI/CD Wrapper, along with their benefits, use cases, and code examples.

## Self-Mutation
Ideal for projects that require infrequent updates to the pipeline configuration, ensuring the pipeline remains the same.

**Property**: `selfMutation`
- **Description**: Allows the pipeline to update itself.
- **Type**: `boolean`
- **Default**: `true`

**Code Example**:
```typescript
import { PipelineBlueprint } from '@cdklabs/cdk-cicd-wrapper';

const pipeline = PipelineBlueprint.builder()
   .pipelineOptions({
       selfMutation: false,
    }).synth(app);
```

## Publish Assets in Parallel
Beneficial for large projects with multiple assets, where improving concurrency and reducing publishing latency can significantly speed up the CI/CD process, but may also increase overall provisioning time of the CodeBuild projects.

**Property**: `publishAssetsInParallel`
- **Description:** Publishes assets using multiple CodeBuild projects.
- **Type:** `boolean`
- **Default:** true

**Code Example**:
```typescript
import { PipelineBlueprint } from '@cdklabs/cdk-cicd-wrapper';

const pipeline = PipelineBlueprint.builder()
   .pipelineOptions({
       publishAssetsInParallel: false,
    }).synth(app);
```

## Docker Credentials
Necessary for projects that involve building, synthesizing, updating, or publishing Docker images, ensuring secure and efficient access to Docker registries.

**Property**: `dockerCredentials`
- **Description**: List of credentials for authenticating to Docker registries.
- **Type**: `pipelines.DockerCredential[]`
- **Default**: `[]`

**Code Example**:
```typescript
import { PipelineBlueprint } from '@cdklabs/cdk-cicd-wrapper';
import { DockerCredential } from 'aws-cdk-lib/pipelines';

const dockerCreds: DockerCredential[] = [
    DockerCredential.ecr('arn:aws:iam::123456789012:role/MyECRRole'),
];

const pipeline = PipelineBlueprint.builder()
   .pipelineOptions({
       dockerCredentials: dockerCreds,
    }).synth(app);
```

## Use Change Sets
Recommended for projects that require thorough review before deployment, as it allows for safe execution and rollback if needed. However, this option may increase deployment time due to the additional change set creation and execution steps.

**Property**: `useChangeSets`
- **Description**: Deploys stacks by creating and executing change sets.
- **Type**: `boolean`
- **Default**: `true`

**Code Example**:
```typescript
import { PipelineBlueprint } from '@cdklabs/cdk-cicd-wrapper';

const pipeline = PipelineBlueprint.builder()
   .pipelineOptions({
       useChangeSets: false,
    }).synth(app);
```