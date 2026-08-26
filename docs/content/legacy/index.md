# Legacy: Blueprint (0.x) documentation

!!! warning "You are reading Blueprint (0.x) documentation"

    This section documents **Blueprint**, the `PipelineBlueprint.builder()` API published as `{{ project_name }}` `0.x`. It is **not** the current major version.

    The current version is **Autopilot** (`1.x`): a `cicd.config.ts` file next to `cdk.json`, deployed with the `cdk-cicd` CLI, with **zero wrapper code in your `bin/`**. Start at [Getting Started](../getting_started/index.md) if you are starting a new project, or read the [Migration Guide](https://github.com/cdklabs/cdk-cicd-wrapper/blob/main/MIGRATION.md) if you have an existing Blueprint (0.x) project.

    Blueprint keeps working and publishing on the `0.x` line (branch `legacy-blueprint`) for existing projects. This page and everything under it describes that line, parked here for reference.

## What changed

The one-line summary: in Blueprint you wrote wrapper code in `bin/` (`PipelineBlueprint.builder()…addStack(...)…synth(app)`); in Autopilot your `bin/` stays exactly what `cdk init` produced, and the pipeline is described in a separate `cicd.config.ts`. See the [Migration Guide](https://github.com/cdklabs/cdk-cicd-wrapper/blob/main/MIGRATION.md) for the full before/after mapping, including how to preserve already-deployed resources during a migration.

Some Blueprint features have no Autopilot equivalent yet, and some were dropped outright (deploy hooks/pre-post-deploy steps, the `addStack` provider-registry model, the `workbench()` local-deploy shortcut — replaced by a plain `cdk deploy`). The Migration Guide's mapping table calls each of these out explicitly.

## Pages kept here

- [{{ project_name }} with Projen](projen.md) and [{{ project_name }} with Projen and Taskfile](projen_with_taskfile.md) — Blueprint's projen project type (`@cdklabs/cdk-cicd-wrapper-projen`) has been decommissioned; there is no Autopilot projen generator.
- [Global Resources](global_resource.md) — Blueprint's dependency-injection `GlobalResources`/resource-provider system. Autopilot's `bin/` is plain CDK, so there is nothing to inject: construct what you need directly.
- [Modularizing Stacks](modularizing_stacks.md) — Blueprint's `BaseStackProvider`/`DefaultStackProvider` abstraction. Autopilot has no equivalent construct; organize plain CDK classes/functions however your project needs.
- [Advanced Pipeline Configuration Options](pipeline_options.md) — Blueprint's `.pipelineOptions()` (self-mutation, parallel asset publishing, Docker credentials, change sets) for the CDK Pipelines-based engine. Not yet confirmed present on Autopilot's `CdkPipelinesEngine`.
- [Variables](variables.md) — Blueprint's environment-variable-driven configuration. Autopilot configures the equivalent settings as fields on `cicd.config.ts` instead.
- [Workshops](workshops/index.md) — the GenerativeAI Image Generation and GitHub Actions Blueprint workshops. See [the Autopilot pipelines workshop](../workshops/autopilot-pipeline/index.md) for the Autopilot equivalent.
