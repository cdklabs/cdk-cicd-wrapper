# Migration Guide for CDK CI/CD Wrapper

This document outlines the notable migration and cleanup tasks involved in upgrading this CDK CI/CD Wrapper project to different versions.

## Version Compatibility

Each section details the changes introduced between specific version ranges (e.g., [0.0.0] - [0.0.6]).

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