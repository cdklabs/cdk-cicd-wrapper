# Migration Guide for CDK CI/CD Wrapper

This document outlines the notable migration and cleanup tasks involved in upgrading this CDK CI/CD Wrapper project to different versions.

## Version Compatibility

Each section details the changes introduced between specific version ranges (e.g., [0.0.0] - [0.0.6]).

### [0.1.5] - [0.2.0] Migration - Compliance Bucket Name definition

This upgrade introduces a new property to define the name of the compliance bucket. This is required to ensure that the compliance bucket name is unique across all AWS accounts.

#### Breaking changes:

* **Compliance Bucket Name:** The compliance bucket name can be defined for each deployment stage separately. The default value is still the same as before. If you want to use the default value, you don't need to make any changes.

### [0.0.12] - [0.1.0] Migration - Updates for Multiple Languages and Hooks

This upgrade brings exciting new features like support for Python, Java, Go, and C# in your CDK CI/CD projects! Additionally, there are some changes to how hooks are defined.

#### Breaking changes:

* **Property Renaming:** The type property on the IVpcConfig object has been renamed to vpcType. Make sure to update your code accordingly to avoid errors.

* **Hook Specification Update:** Previously, the provide function in IStackProvider returned a DeploymentHookConfig object. Now, it returns void instead. To add hooks, use the new Hook.addPreHook(Step) and Hook.addPostHook(Step) functions.

#### Here's how to update your code:

* **Fix IVpcConfig property:**

Find all instances of IVpcConfig.type and rename them to IVpcConfig.vpcType.

* **Update Hook Definition:**

If you were using the provide function to return a DeploymentHookConfig object for hooks, remove that functionality.
Instead, use the new Hook.addPreHook(Step) and Hook.addPostHook(Step) functions to define pre- and post-deployment hooks as needed.

```TypeScript
PipelineBlueprint.builder()
  .workbench({
    // ... your workbench definition
  })
  .definePhase(PipelinePhases.POST_DEPLOY, [
    new ShellCommandPhaseCommand('ls -l'), // Example command execution
  ])
  .addStack({
    provide(context) {
        // ... your main stack definition 

        return {
          pre: [yourPreHook],
          post: [yourPostHook],
        }
    },
  })
  .synth(app);
```

to

```TypeScript
PipelineBlueprint.builder()
  .workbench({
    // ... your workbench definition
  })
  .definePhase(PipelinePhases.POST_DEPLOY, [
    new ShellCommandPhaseCommand('ls -l'), // Example command execution
  ])
  .addStack({
    provide(context) {
        // ... your main stack definition 

        Hook.addPreHook(yourPreHook);
        Hook.addPostHook(yourPostHook);
    },
  })
  .synth(app);
```

## [0.0.0] - [0.0.6] Migration

### Changes:

**Stack Renaming**: The stack name LogRetentionRoleStack has been renamed to PostDeployExecutorStack.
**Default Inclusion**: By default, PostDeployExecutorStack is no longer automatically included in all deployment stages.

### Actions Required:

**Stack Removal**: Remove any existing LogRetentionRoleStack deployments from your AWS accounts.
**Manual Inclusion**: Explicitly include the PostDeployExecutorStack in the stages where its functionality is required.
Example Usage (Post-Deployment Actions):

```TypeScript
PipelineBlueprint.builder()
  .workbench({
    // ... your workbench definition
  })
  .definePhase(PipelinePhases.POST_DEPLOY, [
    new ShellCommandPhaseCommand('ls -l'), // Example command execution
  ])
  .addStack({
    provide(context) {
        // ... your main stack definition 

        new PostDeployExecutorStack(context.scope, 'post-deploy-execution', {
            resAccount: context.blueprintProps.deploymentDefinition.RES.env.account,
            stageName: context.stage,
            name: context.blueprintProps.applicationName,
        });
    },
  })
  .synth(app);
```