# Continuous Integration

CI (Continuous Integration) is a continuous method of software development, where you continuously build and test iterative code changes.

This iterative process helps reduce the chance that you develop new code based on buggy or failed previous versions. The {{ project_name }} can catch bugs early in the development cycle, and help ensure that all the code deployed to production complies with your established code standards.

The CI functionality of the {{ project_name }} can be used in any software development process — it is not bound to infrastructure development or AWS CDK projects.

## How the CI build is assembled

There is no `PhaseCommand`/`definePhase` model in v3. The CI build's commands, per `CiConfig` (the `ci` field on `cicd.config.ts`), are:

```
npm ci
<your ci.steps, in the order you wrote them — or, if you set none, the single default step "npx cdk-cicd check">
cdk synth (+ CDK Nag)
```

`cdk synth` is always appended at the end and is **never** replaced by `ci.steps` — dropping it would render a pipeline with nothing to deploy. Setting `ci.steps`, however, **replaces** the default `npx cdk-cicd check` step rather than adding to it, so include it explicitly if you still want those checks alongside your own commands.

## Default checks: `cdk-cicd check`

With no `ci.steps` configured, the CI build runs `npx cdk-cicd check`, which itself runs four sub-checks in order — `validate`, `audit`, `license`, `security` — each **skipped**, not failed, when the project has no baseline for it (a fresh `cdk init`-ed project has to pass this):

| Check | What it runs | Skipped when |
| --- | --- | --- |
| `validate` | `cdk-cicd validate` — lock-file checksum against `package-verification.json` | no lock file, or no `package-verification.json` yet (run `cdk-cicd validate --fix`) |
| `audit` | `cdk-cicd check-dependencies --npm`/`--python` — see the [Audit guide](./audit.md) | no npm lock file and no `Pipfile` |
| `license` | `cdk-cicd license` — open-source license checking against `package-verification.json` | no `package-verification.json` yet (run `cdk-cicd license --fix`) |
| `security` | `cdk-cicd security-scan --bandit --shellcheck --semgrep` — see the [Security guide](./security.md) | never (always runs) |

## Adding your own build steps

Set `ci.steps` in `cicd.config.ts` — a named map of shell commands, run in the order they appear:

```typescript
import { defineCICD, Repository } from '@cdklabs/cdk-cicd-wrapper';

export default defineCICD({
  application: 'my-app',
  repository: Repository.codecommit('my-repo'),
  stages: ['dev', 'prod'],
  ci: {
    steps: {
      check: 'npx cdk-cicd check', // keep the default checks alongside your own steps
      build: 'npm run build',
      test: 'npm run test',
    },
  },
});
```

`npm ci` runs before your steps and `cdk synth` after them, regardless of what you configure.

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
