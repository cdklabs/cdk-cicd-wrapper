# Container mode: build a deployer image to ECR

For an enterprise / "Automation Framework" flow, v3 supports a **two-repo split**:

- **Repo 1 (this chapter)** — the CDK app repo. Its pipeline runs CI and then builds & pushes a
  **config-agnostic deployer image** (your CDK code + its npm deps + the wrapper tooling) to ECR. It
  deploys nothing.
- **Repo 2** — a generic deployer that runs that image against each target's config and `cdk deploy`s,
  synthesizing per target at run time. One image → many deployments. (Repo 2 is on the roadmap.)

## Turn the pipeline into an image builder

Add a `deployerImage` to the config. The pipeline then renders as `Source → BuildImage` — no deploy
stages:

```ts
import { defineCICD, Repository, BuildImage } from '@cdklabs/cdk-cicd-wrapper';

export default defineCICD({
  application: 'my-app',
  repository: Repository.github('my-org/my-app'),
  deployerImage: BuildImage.docker({
    dockerfile: 'Dockerfile',      // default; the image payload is your app + deps, NOT cdk.out
    // repositoryName: 'my-app-deployer',   // reference an existing ECR repo; omit to provision one
    // tagStrategy: ImageTagStrategy.GIT_SHA,  // default: tag by commit; or LATEST
  }),
});
```

## What the pipeline does

`cdk-cicd deploy-ci` provisions a **secondary CodePipeline** whose single build project:

1. runs `npm ci` and `cdk-cicd check` (CI as a validation gate),
2. logs in to ECR (`aws ecr get-login-password | docker login …`),
3. `docker build`s your Dockerfile and pushes the image, tagged by the resolved commit.

If you don't name an existing repo, the pipeline **provisions** one (`<application>-deployer`); a
disposable pipeline empties and deletes it on teardown.

## Why the image, not `cdk.out`

The image bakes code + deps but **never** `cdk.out`, so Repo 2 can synth-and-deploy it **offline** against
any target's config — no `npm install` and no registry access at deploy time. That's what collapses the
per-target pipeline sprawl: targets become config rows a single image is run against, not pipeline
resources.
