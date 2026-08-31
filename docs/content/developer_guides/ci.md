# Continuous Integration

CI (Continuous Integration) is a continuous method of software development, where you continuously build and test iterative code changes.

This iterative process helps reduce the chance that you develop new code based on buggy or failed previous versions. The {{ project_name }} can catch bugs early in the development cycle, and help ensure that all the code deployed to production complies with your established code standards.

The CI functionality of the {{ project_name }} can be used in any software development process — it is not bound to infrastructure development or AWS CDK projects.

## How the CI build is assembled

There is no `PhaseCommand`/`definePhase` model in Autopilot. The CI build's commands, per `CiConfig` (the `ci` field on `cicd.config.ts`), are:

```
<your ci.steps verbatim, in the order you wrote them — or, if you set none, the default: npm ci then npm run audit / build / test>
cdk synth (+ CDK Nag)
```

`cdk synth` is always appended at the end and is **never** replaced by `ci.steps` — dropping it would render a pipeline with nothing to deploy. Setting `ci.steps`, however, **replaces** the entire default build phase (including its `npm ci`) rather than adding to it — a project that configures its own steps owns its build phase and is responsible for its own `npm ci`.

## Default build phase: your own npm scripts

With no `ci.steps` configured, the CI build runs the project's own npm scripts, in order:

```
npm ci
npm run audit   # if the script exists; else a warning pointing at the recommended checks
npm run build   # if the script exists; else a warning
npm run test    # if the script exists; else a warning
```

Each script runs only when your `package.json` actually defines it. A missing script prints a warning that points at the [recommended checks](./audit.md) and **continues** — it never fails the build. This keeps the checks as encouraged guidance rather than hard enforcement, and keeps CI identical to what you run locally (`npm run audit` behaves the same on a laptop). A project that defines none of these scripts still builds and synthesizes; you just get three warnings in the build log.

!!! tip
    The wrapper's own checks are still available as scripts you can point these at — e.g. `"audit": "cdk-cicd check-dependencies --npm"` in your `package.json`. See the [Audit guide](./audit.md) and [Security guide](./security.md) for the recommended commands.

## Adding your own build steps

Set `ci.steps` in `cicd.config.ts` — a named map of shell commands, run in the order they appear. This **replaces** the default scripts entirely, so list everything you want the build to run, **including `npm ci`** (the engine injects nothing of its own when you configure `ci.steps`):

```typescript
import { defineCICD, Repository } from '@cdklabs/cdk-cicd-wrapper';

export default defineCICD({
  application: 'my-app',
  repository: Repository.codecommit('my-repo'),
  stages: ['dev', 'prod'],
  ci: {
    steps: {
      install: 'npm ci',
      audit: 'npm run audit',
      build: 'npm run build',
      test: 'npm run test',
    },
  },
});
```

Only `cdk synth` is appended after your steps; nothing is prepended. (With **no** `ci.steps` configured, the default build begins with its own `npm ci` — see above.)

### Controlling which stages CI synthesizes

`ci.synthStages` controls which stages the CI build's `cdk synth` synthesizes for validation, on top of whatever the active [deploy model](../getting_started/index.md) needs — `[]` (the default) defers to the engine's own default (every stage under the default assembly-promotion model, one environment under deploy-time synth); `'all'` synthesizes every configured stage; an explicit list of stage names synthesizes just those.

```typescript
ci: {
  synthStages: 'all', // or e.g. ['dev', 'prod']
},
```

### Escape hatch: a partial buildspec

For anything `ci.steps` can't express (a custom `install` phase, `runtime-versions`, `env` block, artifact/cache config), `ci.partialBuildSpec` is deep-merged (via CDK's `codebuild.mergeBuildSpecs`) into the CI build project's generated buildspec, augmenting rather than replacing the engine's own phases — scoped to the CI build project only, not the self-update or per-stage deploy projects:

```typescript
import { aws_codebuild as codebuild } from 'aws-cdk-lib';

ci: {
  partialBuildSpec: codebuild.BuildSpec.fromObject({
    version: '0.2',
    phases: {
      install: {
        'runtime-versions': { python: '3.12' },
      },
    },
  }),
},
```

### Custom CI CodeBuild image

Set `ci.image` to override the CodeBuild image the CI build project runs on.
