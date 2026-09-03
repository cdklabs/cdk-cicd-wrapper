# Container mode: build once, deploy many

!!! abstract "What you'll build" - **Repo 1 — CI pipeline:** runs CI and pushes a config-agnostic deployer image to ECR — it deploys
nothing. - **Repo 2 — CD pipeline:** a config-only `deploy.config.ts` whose pipeline pulls that image and
deploys each target (or run the same executor locally with `cdk-cicd deploy --from-image`). - An understanding of the "one image → many deployments" scale-out and rollback-by-retag.

For an enterprise / "Automation Framework" flow, Autopilot supports a **two-repo split**:

- **Repo 1 (CI pipeline)** — the CDK app repo. Its pipeline runs CI and then builds & pushes a
  **config-agnostic deployer image** (your CDK code + its npm deps + the wrapper tooling) to ECR. It
  deploys nothing.
- **Repo 2 (CD pipeline)** — a config-only repo (no CDK code) whose pipeline pulls that image and runs it
  against each target's config, synthesizing per target at run time. One image → many deployments.

## Repo 1 — turn the pipeline into an image builder

Add a `deployerImage` to the config. The pipeline then renders as `Source → BuildImage` — no deploy
stages:

```ts
import { defineCICD, Repository, BuildImage } from '@cdklabs/cdk-cicd-wrapper';

export default defineCICD({
  application: 'my-app',
  repository: Repository.codestarConnection(
    'my-org/my-app',
    'arn:aws:codestar-connections:eu-west-1:111111111111:connection/01234567-89ab-cdef-0123-456789abcdef',
  ),
  stages: ['dev'], // required by defineCICD; deployerImage mode creates no deploy actions
  deployerImage: BuildImage.docker({
    dockerfile: 'Dockerfile', // default; the image payload is your app + deps, NOT cdk.out
    // repositoryName: 'my-app-deployer',   // reference an existing ECR repo; omit to provision one
    // tagStrategy: ImageTagStrategy.GIT_SHA,  // default: immutable revision tag; or LATEST
  }),
});
```

`stages` remains required by the `defineCICD` API, but `deployerImage` mode does not render deployment
actions for those stages.

Repo 1 may preserve `APP_STAGING` in the image because this pipeline performs no application deployment.
The generated Repo 2 pipeline rejects that synthesizer; an `APP_STAGING` image must be run through the
local/direct `cdk-cicd deploy --from-image` path. Its targets may configure `deployRole` and
`cfnExecutionRole` for application-stack deployment; staging support resources still use caller/base
credentials. A deploy-role ExternalId remains unsupported.

### What the Repo 1 pipeline does

`cdk-cicd deploy-ci` provisions a **secondary CodePipeline** whose single build project:

1. runs `npm ci` and your CI scripts (`npm run audit`/`build`/`test`, CI as a validation gate),
2. logs in to ECR (`aws ecr get-login-password | docker login …`),
3. `docker build`s your Dockerfile and pushes the image, tagged by the lowercase Git commit SHA or,
   for a non-Git source revision, a deterministic SHA-256 of that revision.

<!-- SCREENSHOT: CodePipeline console showing the Repo 1 pipeline as Source → BuildImage (no deploy stages) -->

If you don't name an existing repo, the pipeline **provisions** one (`<application>-deployer`); a
disposable pipeline empties and deletes it on teardown.

### Why the image, not `cdk.out`

The image bakes code + deps but **never** `cdk.out`, so the deployer container can synth-and-deploy
without installing the application or contacting its package registry. Repo 2's small outer CodeBuild
step still runs `npm ci` to install the wrapper before launching the image, so configure its package
registry access when the wrapper is not available from public npm.

## Repo 2 — the CD pipeline that deploys the image

Repo 2 is a small, app-agnostic **config repo** (no CDK code) that says **which image** to run and
**where** to deploy it. Describe that with `defineDeployment` in a `deploy.config.ts`:

```ts
// deploy.config.ts
import { defineDeployment, Repository } from '@cdklabs/cdk-cicd-wrapper';

export default defineDeployment({
  // Match the application/qualifier baked into the deployer image.
  application: 'my-app',
  qualifier: 'myapp',

  // The BASE deployer image repo (no tag). The per-stage version is appended at deploy time.
  image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/my-app-deployer',

  // The config-only source repo this CD pipeline watches (deploy.config.ts + config/<stage>.json here).
  repository: Repository.codecommit('my-app-deploy-config'),

  // Targets say WHERE (account/region/role) + gating. The VERSION each runs comes from config/<stage>.json.
  targets: [
    {
      stage: 'dev',
      env: { account: '111111111111', region: 'eu-west-1' },
      complianceLogBucketName: 'my-app-compliance-111111111111-eu-west-1',
    },
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

`complianceLogBucketName` references an existing destination; Repo 2 does not create it. A target using
one must provide a concrete 12-digit account and exactly one Region. The executor verifies that complete
bucket/account/Region coordinate and passes the exact
`CDK_CICD_COMPLIANCE_LOG_BUCKET_NAME`, `CDK_CICD_COMPLIANCE_LOG_BUCKET_ACCOUNT`, and
`CDK_CICD_COMPLIANCE_LOG_BUCKET_REGION` variables into the deployer container. Use a different bucket
name for a target in another account or Region; multi-Region targets cannot share one S3 logging
destination.

If the deployer image belongs to a different AWS account than the Repo 2 pipeline, its repository owner
must grant the generated CodeBuild role `ecr:BatchGetImage`, `ecr:GetDownloadUrlForLayer`, and
`ecr:BatchCheckLayerAvailability`, plus `ecr:DescribeImages` so a mutable tag is fingerprinted by its
current digest. Only then set
`crossAccountEcrRepositoryPolicyConfigured: true`; rendering fails closed without that acknowledgement.
This is a runtime pull of the deployer image. Any private ECR image used as CodeBuild's own environment
image must still be in the pipeline Region.

Each stage's **version lives in its own config file** in the CD repo (a hash or semver) — _not_ baked in
the image:

```jsonc
// config/dev.json          config/int.json           config/prod.json
{ "version": "1.5.0" }      { "version": "1.4.2" }     { "version": "1.4.2" }
```

The deploy resolves `image = <base-repo>:<version-from-config/<stage>.json>`. An existing malformed
version file fails deployment rather than silently selecting the base image. Provision the CD pipeline
— the deploy-side twin of `deploy-ci` for a CI pipeline:

```bash
npx cdk-cicd deploy-ci     # sees deploy.config.ts (not cicd.config.ts) → provisions the CD pipeline
```

This renders a second CodePipeline with **one Deploy action per target**. Each action runs
`cdk-cicd deploy --from-image --target <stage>`, which reads that stage's `version` from
`config/<stage>.json` **at run time**, pulls `<base-repo>:<version>`, and synth-and-deploys the stage. So:

- **Per-stage versions in config:** bump `config/dev.json`'s `version`, commit → only `dev` redeploys on it.
  `dev` can run a newer version than `prod`, and the version is plain config, reviewable in a PR.
- **Deployment order:** adjacent ungated targets share a parallel wave. Each gated target gets its own
  approval/deploy stage, and declaration order is preserved, so its approval blocks every later target.
- **Two pipelines total:** the CI pipeline (Repo 1) _pushes_ the image; the CD pipeline (Repo 2) _pulls_ it.

<!-- SCREENSHOT: CodePipeline console showing the Repo 2 CD pipeline as Source → Deploy (per-target actions) -->

<!-- SCREENSHOT: CodePipeline console showing the Repo 2 CD pipeline as Source → Deploy (CodeBuild) -->

!!! tip "Run it locally without a pipeline"
The CodeBuild step is just the `cdk-cicd deploy --from-image --yes` executor, which you can also run
from any machine or CI runner (it pulls the image and deploys each target). Omit `repository` from
`deploy.config.ts` to use only the local executor with no CD pipeline. On a runner whose default docker
network can't reach AWS, add `--docker-network host`.

Either way, the pinned image runs **once per (target × region)**: for each run the container synthesizes
that stage against the target's injected environment — offline, inside the image — and deploys the result.
One build produces one image, and that image drives _N_ deploys.

!!! info "Division of authority: WHAT vs WHERE"
The **image** is authoritative for _what_ to deploy — the app code and its stage definitions are baked
in at build time. The **`deploy.config.ts` target** is authoritative for _where_ — the account,
region(s), and role for each stage. A target's `deployment.deployRole` (chapter 2's shape) is threaded
through to each target's deploy.

!!! info "Manual-approval gates"
A target's `manualApproval: true` is honored on both paths. The **CD pipeline** renders two deploy
shapes: one `Deploy` stage runs every ungated target in parallel, then each gated target gets its own
pairwise approval/deploy stage in config order. The **local executor**
(`cdk-cicd deploy --from-image`) is fail-closed—it refuses a gated target unless you pass `--yes`.

!!! tip "Rollback is a retag"
To roll back, point `image:` at the previous version tag (e.g. `:1.4.1`) and re-run
`cdk-cicd deploy --from-image`. Because the image pins code + deps and config supplies the lookups,
the same image + same config always synthesizes the same template — a deterministic rollback with no
rebuild.

## Verify

!!! success "Verify" - **Repo 1 (CI pipeline):** renders as `Source → BuildImage` (no deploy stages), and after a run the
tagged image is present in ECR (`aws ecr describe-images --repository-name my-app-deployer`). - **Repo 2 (CD pipeline):** `deploy-ci` provisions a `Source → Deploy` CodePipeline; a config change
triggers the CodeBuild that pulls the image and creates/updates each target's CloudFormation stack. - Change nothing but the `image:` tag and re-run — the deploy reproduces the pinned version, proving
one image serves many deployments and rollbacks.

## Recap

Container mode splits build from deploy into **two pipelines**: the CI pipeline (Repo 1) builds and pushes
one config-agnostic, offline-capable image; the CD pipeline (Repo 2, config-only) pulls that image and
deploys as many targets as you like — the same `cdk-cicd deploy --from-image` executor you can also run
locally. Targets are config rows, not pipeline resources — that's the scale-out win — and rollback is just
pointing at a previous image tag. Next: migrating an existing Blueprint app to any of these Autopilot patterns.
