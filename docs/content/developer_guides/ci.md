# Continuous Integration

CI (Continuous Integration) is a continuous method of software development, where you continuously build and test iterative code changes.

This iterative process helps reduce the chance that you develop new code based on buggy or failed previous versions. The {{ project_name }} can catch bugs early in the development cycle, and help ensure that all the code deployed to production complies with your established code standards.

The CI functionality of the {{ project_name }} can be utilized in any software development process, it is not bound to infrastructure development or AWS CDK projects.

## Common terms

### PhaseCommand

PhaseCommand represent a single step that is executed by the CI/CD pipeline.

These are the available PhaseCommands types:

- NPMPhaseCommand - defines an NPM script execution
- ShellScriptPhaseCommand - defines a shell script execution
- ShellCommandPhaseCommand - defines a shell command for execution
- PythonPhaseCommand - defines a python script execution
- InlineShellPhaseCommand - _internal_ move the given script file content to the build as is. This PhaseCommand is useful in situations where the {{ project_name }} sources are not available, for example before network access or NPM registry setups.

### Phases

The {{ project_name }} has 7 phases which covers every CI/CD project lifecycle. Some of the stages like `preDeploy` and `postDeploy` are executed multiple times, while others are only executed once. When a phase is executed it needs to execute all the [PhaseCommands](#phasecommand) defined for the phase in order until completion otherwise the step fails.

The following phases are available:

- **initialize** - initializes CI environment before the actual build process can be started. In this phase the networking and the NPM registry connection is established.
- **preBuild** - verifies the project is ready for the build
- **build** - builds the source code
- **testing** - runs testing activities to verify the quality of the product
- **preDeploy** - [CD phase](./cd.md) - prepares and verifies the environment for the deploy
- **deploy** - [CD phase](./cd.md) - deploys the CDK stacks to the stage. This phase can not be modified
- **postDeploy** - [CD phase](./cd.md) - verifies the environment after the deployment and finalize the environment setup

## What are the default set of PhaseCommands for the {{ project_name }}?

The {{ project_name }} comes with a pre-set list of PhaseCommand definitions for each stage that provides a good starting point for any AWS CDK projects.

### Initialize Phase

| Type                    | PhaseCommand            | Description                                                                                                                                                         |
| ----------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| InlineShellPhaseCommand | CONFIGURE_HTTP_PROXY    | This step configures the HTTP proxy in case it is needed for accessing external resources. You can read more about this in the [networking](./networking.md) guide. |
| InlineShellPhaseCommand | ENVIRONMENT_PREPARATION | Populates the environment variables from [ParameterStore](./global_resource.md#parameterstore).                                                                     |
| InlineShellPhaseCommand | NPM_LOGIN               | Configures the [private NPM registry](./private_npm_registry.md) in case it is needed.                                                                              |

### PreBuild Phase

| Type            | PhaseCommand | Description                                                                                                                                                        |
| --------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| NPMPhaseCommand | VALIDATE     | Executes the `npm run validate` command. You can define the command by yourself or you can use {{ project_name }} - [CLI Validate](../cli/cli_validate.md) command |
| NPMPhaseCommand | CHECK_AUDIT  | Executes the `npm run audit` command. You can define the command by yourself or you can our recommended [audit definition](./audit.md).                            |
| NPMPhaseCommand | NPM_CI       | Runs the `npm ci` command and downloads all dependencies                                                                                                           |
| NPMPhaseCommand | CHECK_LINT   | Executes the `npm run audit` command. You can define the command by yourself                                                                                       |

### Build Phase

| Type            | PhaseCommand | Description                           |
| --------------- | ------------ | ------------------------------------- |
| NPMPhaseCommand | BUILD        | Executes the `npm run build` command. |

### Testing Phase

| Type                    | PhaseCommand           | Description                                                                                                                                                   |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NPMPhaseCommand         | TEST                   | Executes the `npm run test` command.                                                                                                                          |
| InlineShellPhaseCommand | CDK_SYNTH_WITH_LOOK_UP | Executes the `cdk synth` command to synthesize the CDK project code and runs the CDK NAG. This version allows the CDK to perform [lookups](./cdk_context.md). |

## What are the available PhaseCommands?

| Type                    | PhaseCommand              | Description                                                                                                                                                           |
| ----------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| InlineShellPhaseCommand | CONFIGURE_HTTP_PROXY      | This step configures the HTTP proxy in case it is needed for accessing external resources. You can read more about this in the [networking](./networking.md) guide.   |
| InlineShellPhaseCommand | ENVIRONMENT_PREPARATION   | Populates the environment variables from [ParameterStore](./global_resource.md#parameterstore).                                                                       |
| InlineShellPhaseCommand | NPM_LOGIN                 | Configures the [private NPM registry](./private_npm_registry.md) in case it is needed.                                                                                |
| NPMPhaseCommand         | VALIDATE                  | Executes the `npm run validate` command. You can define the command by yourself or you can use {{ project_name }} - [CLI Validate](../cli/cli_validate.md) command    |
| NPMPhaseCommand         | CHECK_AUDIT               | Executes the `npm run audit` command. You can define the command by yourself or you can our recommended [audit definition](./audit.md).                               |
| NPMPhaseCommand         | NPM_CI                    | Runs the `npm ci` command and downloads all dependencies                                                                                                              |
| NPMPhaseCommand         | CHECK_LINT                | Executes the `npm run audit` command. You can define the command by yourself                                                                                          |
| NPMPhaseCommand         | BUILD                     | Executes the `npm run build` command.                                                                                                                                 |
| NPMPhaseCommand         | TEST                      | Executes the `npm run test` command.                                                                                                                                  |
| InlineShellPhaseCommand | CDK_SYNTH_WITH_LOOK_UP    | Executes the `cdk synth` command to synthesize the CDK project code and runs the CDK NAG. This version allows the CDK to perform [lookups](./cdk_context.md).         |
| InlineShellPhaseCommand | CDK_SYNTH_WITHOUT_LOOK_UP | Executes the `cdk synth` command to synthesize the CDK project code and runs the CDK NAG. This version does not allow the CDK to perform [lookups](./cdk_context.md). |

## How to define a new PhaseCommand?

There are cases when a new command needs to be added to the CI/CD pipeline. As a first step you need to determine the type of the command. See the list of available [PhaseCommand types](#phasecommand), if none of those types seems to fit, you always have an option to define [your own type](#how-to-define-a-new-phasecommand-type).

Let's see the two most common cases you could encounter.

### Define NPM script based PhaseCommand

First ensure the `script` is defined in your package.json file and the scripts execution result the expected outcome. So your package.json might look like this:

```json
{
    ...
    "scripts":
    {
        ...
        "my-script": "ls"
        ...
    },
    ...
}
```

Then you can create an NPMPhaseCommand with:

```typescript
const myScriptPhaseCommand = new NPMPhaseCommand('my-script');
```

Now the command is ready, we need to include it into our desired [phase](#phases). Once a [default phase](#what-are-the-available-phasecommands) has been modified we require you to explicitly define the PhaseCommands for that phase.

The phase can be defined with the `definePhase` method that is available on the VanillaPipelineBuilder.

```typescript
const myScriptPhaseCommand = new NPMPhaseCommand('my-script');

PipelineBlueprint.builder()
  .addStack((context) => {
    new DemoStack(context.scope, 'DemoStack');
  })
  .definePhase(PipelinePhases.PRE_BUILD, [
    PhaseCommands.VALIDATE,
    myScriptPhaseCommand,
    PhaseCommands.CHECK_AUDIT,
    PhaseCommands.NPM_CI,
    PhaseCommands.CHECK_LINT
  ])
  .build(app);
```

Here, you can see how to define the [order of the commands](#how-to-define-the-order-of-the-phasecommands), for the phase.

### Define Shell command based PhaseCommand

You can create a ShellCommandPhaseCommand with:

```typescript
const myScriptPhaseCommand = new sh('ls');
```

Now, the command is ready, we need to include into our desired [phase](#phases). Once a [default phase](#what-are-the-available-phasecommands) has been modified we require you to explicitly define the PhaseCommands for that phase.

The phase can be defined with the `definePhase` method that is available on the VanillaPipelineBuilder.

```typescript
PipelineBlueprint.builder()
  .addStack((context) => {
    new DemoStack(context.scope, 'DemoStack');
  })
  .definePhase(PipelinePhases.PRE_BUILD, [
    PhaseCommands.VALIDATE,
    sh('ls'),
    PhaseCommands.CHECK_AUDIT,
    PhaseCommands.NPM_CI,
    PhaseCommands.CHECK_LINT
  ])
  .build(app);
```

## How to define a new PhaseCommand Type?

Every PhaseCommand must implement the PhaseCommand interface that has only one required command property. This command property must contain an executable command that the `sh` shell engine can execute, as this command will be added to the underlining AWS CodeBuild project `buildSpec.yaml` as part of the [commands](https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html) list.


## How to define the order of the PhaseCommands?

The execution order of the PhaseCommands follows the PhaseCommand position in the definition array.

```typescript
const myScriptPhaseCommand = new NPMPhaseCommand('my-script');

PipelineBlueprint.builder()
  .addStack((context) => {
    new DemoStack(context.scope, 'DemoStack');
  })
  .definePhase(PipelinePhases.PRE_BUILD, [
    PhaseCommands.VALIDATE,
    myScriptPhaseCommand,
    PhaseCommands.CHECK_AUDIT,
    PhaseCommands.NPM_CI,
    PhaseCommands.CHECK_LINT
  ])
  .build(app);
```

The `npm run validation` will be executed before the `npm run my-script` command.
