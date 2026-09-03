# Container mode (two-repository Docker deploy)

Container mode splits build from deploy into **two repositories**: a CI repository builds and pushes a
config-agnostic **deployer image**, and a config-only CD repository runs that image against as many
targets as you like. One image drives _N_ deployments, and rollback is a retag.

!!! info "Engine support"
Container mode is a feature of the default **CodePipeline engine** (`EngineType.CODEPIPELINE`). The
`CDK_PIPELINES` and `GitHubActions` engines deploy stages directly by replaying the app per stage;
they do not build or consume a deployer image.

## When to use it

Reach for container mode when you want to build the deployable artifact **once** and promote that exact
artifact through stages — including across repositories or teams — rather than re-synthesizing per stage
from source. Because the image bakes the CDK app and its npm dependencies, the CD side needs no source,
no `npm install`, and no registry access at deploy time: it can synth-and-deploy **offline** against each
target's configuration.

## Repo 1 — build the deployer image

The CI repository is your normal CDK app. Add a `deployerImage` to `cicd.config.ts` and the pipeline
renders as `Source → BuildImage` with **no deploy stages** — it builds and pushes an image instead of
deploying:

```typescript
import { defineCICD, Repository, BuildImage, ImageTagStrategy } from '@cdklabs/cdk-cicd-wrapper';

export default defineCICD({
  application: 'my-app',
  repository: Repository.codestarConnection(
    'my-org/my-app',
    'arn:aws:codestar-connections:eu-west-1:111111111111:connection/01234567-89ab-cdef-0123-456789abcdef',
  ),
  stages: ['dev'], // required by defineCICD; deployerImage mode creates no deploy actions
  deployerImage: BuildImage.docker({
    dockerfile: 'Dockerfile', // default; the image payload is your app + deps, NOT cdk.out
    // repositoryName: 'my-app-deployer', // reference an existing ECR repo; omit to provision one
    // tagStrategy: ImageTagStrategy.GIT_SHA, // default: tag by resolved commit; or ImageTagStrategy.LATEST
  }),
});
```

`stages` remains required by the `defineCICD` API, but `deployerImage` mode does not render deployment
actions for those stages.

`cdk-cicd deploy-ci` provisions the CI pipeline. Its single build project:

1. runs `npm ci` and `cdk-cicd check` (CI as a validation gate),
2. logs in to ECR,
3. `docker build`s your Dockerfile and pushes the image, tagged by strategy (`GIT_SHA` by default —
   immutable; `LATEST` is simplest but not immutable).

If you do not name an existing repository, the pipeline **provisions** one named `<application>-deployer`;
a disposable pipeline (`deploy-ci --disposable`) empties and deletes it on teardown.

### Why the image, not `cdk.out`

The image bakes code + dependencies but **never** `cdk.out`, so the CD side can synth-and-deploy it
offline against any target's config. That is what collapses per-target pipeline sprawl: targets become
config rows a single image is run against, not pipeline resources.

## Repo 2 — deploy the image

The CD repository is a small, app-agnostic **config repository** (no CDK code). It declares **which
image** to run and **where** to deploy it, via `defineDeployment` in a `deploy.config.ts`:

```typescript
// deploy.config.ts
import { defineDeployment, Repository } from '@cdklabs/cdk-cicd-wrapper';

export default defineDeployment({
  // Repeat the deployer image's application/qualifier so Repo 2 can scope bootstrap-role IAM.
  application: 'my-app',
  qualifier: 'myapp',

  // The BASE deployer image repository (no tag). The per-stage version is appended at deploy time.
  image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/my-app-deployer',

  // The config-only source repo this CD pipeline watches (deploy.config.ts + config/<stage>.json).
  // Omit it to use only the local `cdk-cicd deploy --from-image` executor with no CD pipeline.
  repository: Repository.codecommit('my-app-deploy-config'),

  // Targets say WHERE (account/region/role) + gating. The VERSION each runs comes from config/<stage>.json.
  targets: [
    { stage: 'dev', env: { account: '111111111111', region: 'eu-west-1' } },
    { stage: 'int', env: { account: '111111111111', region: 'eu-west-1' }, manualApproval: true },
    {
      stage: 'prod',
      env: { account: '222222222222', regions: ['eu-west-1', 'us-east-1'] },
      manualApproval: true,
      deployment: { deployRole: 'arn:aws:iam::222222222222:role/automation-deployer' },
    },
  ],
});
```

`application`, `qualifier`, and `synthesizer` must match the image's `cicd.config` when it uses a
custom bootstrap qualifier or `APP_STAGING`; Repo 2 needs that identity to grant the correct
bootstrap and app-scoped asset roles.

Each stage's **version lives in its own config file** in the CD repository (a hash or semver) — _not_
baked in the image:

```jsonc
// config/dev.json          config/int.json           config/prod.json
{ "version": "1.5.0" }      { "version": "1.4.2" }     { "version": "1.4.2" }
```

The deploy resolves `image = <base-repo>:<version from config/<stage>.json>`, so `dev` can run a newer
version than `prod`, and the version is plain config, reviewable in a pull request.

### Provision the CD pipeline, or run locally

With a `repository` set, `cdk-cicd deploy-ci` provisions the CD pipeline (the deploy-side twin of the CI
`deploy-ci`): a `Source` stage, then a `Deploy` stage with every **ungated** target running in parallel,
then a `DeployGated` stage where each **gated** target sits behind its own manual-approval action. Each
deploy action runs `cdk-cicd deploy --from-image --target <stage>`, which reads that stage's `version` at
run time, pulls `<base-repo>:<version>`, and synth-and-deploys the stage.

The same executor runs locally without any pipeline:

```bash
npx cdk-cicd deploy --from-image           # every target (gated targets require --yes)
npx cdk-cicd deploy --from-image --target dev
```

On a runner whose default Docker network cannot reach AWS, add `--docker-network host`. The local
executor is fail-closed: it refuses a target with `manualApproval: true` unless you pass `--yes`.

## Division of authority: WHAT vs WHERE

The **image** is authoritative for _what_ to deploy — the app code and its stage definitions are baked in
at build time. The **`deploy.config.ts` target** is authoritative for _where_ — the account, region(s),
and forced role for each stage. That is why each run pins a single `--region`: the target's environment
overrides whatever region set the image's own `cicd.config.ts` carries, so the CD repository — not the
image — decides the deployment topology.

## Rollback is a retag

To roll back, point a stage's version file at the previous tag (e.g. `config/prod.json`'s `version` back
to `1.4.1`) and re-run. Because the image pins code + deps and config supplies the lookups, the same image

- same config always synthesizes the same template — a deterministic rollback with no rebuild.

## See also

- [Continuous Deployment](./cd.md) — stages, approvals, and per-stage configuration.
- The workshop module [Container mode: build once, deploy many](../workshops/autopilot-pipeline/05-container-mode.md)
  walks the same flow end to end.
