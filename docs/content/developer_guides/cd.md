# Continuous Deployment

CD(Continuous Deployment) is a continuous method of software delivery, where you continuously deploy iterative code changes through out various stages.

This iterative process helps reduce the chance that you develop new code based on buggy or failed previous versions. The {{ project_name }} can catch bugs early in the development cycle, and help ensure that all the code deployed to production complies with your established code standards.

## Common terms

### Stage

Stage is a representation of a [deployment environment](https://en.wikipedia.org/wiki/Deployment_environment#:~:text=Deployment%20architectures%20vary%20significantly%2C%20but,deployed%20to%20each%20in%20order.) where the solution is deployed. The {{ project_name }} requires the RES stage to be defined, because that is the stage where all the CI/CD infrastructure elements will be placed. We recommend to use the DEV, INT, and PROD stages, in this order, but you can define your own [Stages](#how-to-define-custom-stages).

### Stack

The unit of deployment in the AWS CDK is called a stack. See more details in the [CDK documentation](https://docs.aws.amazon.com/cdk/v2/guide/stacks.html).

## How to define Stacks to deploy on a Stage?

Stacks can be added to all of the stages or can be added only to specific stages. Any correct CDK Stacks can be added to a stage and can be deployed with the {{ project_name }}.

### Add stacks to all stages

Open your `bin/<your-main-file>.ts` file and include a stack into the Delivery Pipeline. Here we are using two of our example stacks.

```typescript
PipelineBlueprint.builder().addStack({
  provide: (context) => {
    new example.LambdaStack(context.scope, `${context.blueprintProps.applicationName}LambdaStack`, {
        applicationName: context.blueprintProps.applicationName,
        stageName: context.stage,
    });
    new example.S3BucketStack(context.scope, `${context.blueprintProps.applicationName}S3Stack`, {
        bucketName: 'test-bucket',
        stageName: context.stage,
        applicationQualifier: context.blueprintProps.applicationQualifier,
        encryptionKey: context.get(GlobalResources.ENCRYPTION)!.kmsKey,
    });
}}).synth(app);
```

You can add stacks one by one as well.

```typescript
PipelineBlueprint.builder().addStack({
  provide: (context) => {
    new example.LambdaStack(context.scope, `${context.blueprintProps.applicationName}LambdaStack`, {
        applicationName: context.blueprintProps.applicationName,
        stageName: context.stage,
    });
}}).addStack({
  provide: (context) => {
    new example.S3BucketStack(context.scope, `${context.blueprintProps.applicationName}S3Stack`, {
        bucketName: 'test-bucket',
        stageName: context.stage,
        applicationQualifier: context.blueprintProps.applicationQualifier,
        encryptionKey: context.get(GlobalResources.ENCRYPTION)!.kmsKey,
    });
}}).synth(app);
```

#### Highlights

1. Your stack's scope must be the one that comes from the `context` -> `context.scope` or any other stack you defined in the same addStack block.
2. It is recommended to use the prefixing with on the resources you are creating in your Stack otherwise your resource name can be conflicting. As best practice we use the stageName and the applicationQualifier both as that allows us to deploy multi stage CI/CD pipelines on a [single AWS account](./single_account.md).
3. You can access GlobalResources through the context `context.get(GlobalResources.ENCRYPTION)!.kmsKey`, you can read about the [GlobalResources](./global_resource.md)
4. You can access the parameters of the blueprint `context.blueprintProps`

### Add stack to a specific stage

```typescript
PipelineBlueprint.builder().addStack({
  provide: (context) => {
    new example.LambdaStack(context.scope, `${context.blueprintProps.applicationName}LambdaStack`, {
        applicationName: context.blueprintProps.applicationName,
        stageName: context.stage,
    });
}}, vp.COMMON_STAGES.DEV).addStack({
  provide: (context) => {
    new example.S3BucketStack(context.scope, `${context.blueprintProps.applicationName}S3Stack`, {
        bucketName: 'test-bucket',
        stageName: context.stage,
        applicationQualifier: context.blueprintProps.applicationQualifier,
        encryptionKey: context.get(GlobalResources.ENCRYPTION)!.kmsKey,
    });
}}, vp.COMMON_STAGES.INT, vp.COMMON_STAGES.PROD).synth(app);
```

With this configuration the `LambdaStack` will be deployed in the DEV stage only and not in the INT and PROD stages where as the `S3BucketStack` will be deployed in the INT and PROD stages.

**Note**
The deployed stacks can be different for each Stage, although the recommendation is to have similar identical deployments. This is to ensure faulty operation of the setup can be intercepted as early as possible.

## How to define custom Stages

You can define custom stages through the VanillaPipelineBuilder, so that you can adjust the CD process to your environment setup.

```typescript
PipelineBlueprint.builder()
    .defineStages([
        vp.COMMON_STAGES.RES,
        { stage: 'EXP', account: '1234567891012', region: 'eu-west-1'},
        { stage: vp.COMMON_STAGES.DEV, account: '2345678910123', region: 'eu-west-1'},
        { stage: vp.COMMON_STAGES.INT}
    ])
    .addStack({
  provide: (context) => {
        new example.LambdaStack(context.scope, `${context.blueprintProps.applicationName}LambdaStack`, {
            applicationName: context.blueprintProps.applicationName,
            stageName: context.stage,
        });
    }, 'EXP').addStack({
  provide: (context) => {
        new example.S3BucketStack(context.scope, `${context.blueprintProps.applicationName}S3Stack`, {
            bucketName: 'test-bucket',
            stageName: context.stage,
            applicationQualifier: context.blueprintProps.applicationQualifier,
            encryptionKey: context.get(GlobalResources.ENCRYPTION)!.kmsKey,
        });
    }}, vp.COMMON_STAGES.INT, vp.COMMON_STAGES.PROD).synth(app);
```

With this example you can see the options of how the Stages can be defined.

1. Define only the stage name to be a string or any of the COMMON*STAGES. This means you **must** create an environment variable called `ACCOUNT*<STAGE_NAME>`which needs to provide the AWS account id. The targeted region is determined by the`AWS_REGION` environment variable.
2. You can define an object with the `stage` property. This means you **must** create an environment variable called `ACCOUNT_<STAGE_NAME>` which needs to provide the AWS account id. The targeted region is determined by the `AWS_REGION` environment variable.
3. You can directly input the `account` and `region` in case you want to be explicit.

The order of the stage execution will follow the definition order except for the `RES` stage because that is **always** deployed first.

**Note**
If the `ACCOUNT_<STAGE_NAME>` environment variable or the `account` value is only a `-`, then that stage is considered disabled.

**Note**
The {{ project_name }} - CLI Configuration command only asks for the the RES, DEV and INT stages' account information, this means if you add a new stage, it is your responsibility to either define your `ACCOUNT_<STAGE_NAME>` environment variable and add it to the `exports_vars.sh` or explicitly add the account numbers in the command.
