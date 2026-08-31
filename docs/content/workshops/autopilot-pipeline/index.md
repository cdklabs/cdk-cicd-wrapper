# Autopilot pipelines — the config-driven CDK CI/CD Wrapper

This workshop walks through the **Autopilot** usage patterns of the CDK CI/CD Wrapper. Autopilot is a redesign around
one idea:

> **Your app stays ordinary CDK. One `cicd.config.ts` turns it into a pipeline — no wrapper code in your
> app, no builder chain.**

Where Blueprint built the pipeline *inside* your app with `PipelineBlueprint.builder()…synth(app)`, Autopilot keeps
your `bin/` exactly as `cdk init` produced it and reads a separate config file. The pipeline is one flat
CodePipeline (source → CI → self-update → one deploy action per stage), not the 100+ CodeBuild projects
Blueprint's CDK-Pipelines footprint grew.

## Why Autopilot — what you get

Autopilot is a breaking major, so it earns its keep in concrete, end-user terms. The wins are about *your* app
and *your* pipeline, not the wrapper's internals:

| You want to… | Blueprint made you… | Autopilot gives you… |
|---|---|---|
| Keep your app portable | Wrap `bin/` in `PipelineBlueprint.builder()…synth(app)` — wrapper code you own forever | An ordinary `cdk init` app. Zero wrapper imports in `bin/` for the basic flow |
| Describe stages & accounts | Encode them in builder calls + `ACCOUNT_*` env vars | Declare them as data in `cicd.config.ts` — read, diff, and review a plain object |
| Understand the pipeline | Trace 100+ CodeBuild projects (per-asset, per-stage pre/post, self-mutation) | One flat CodePipeline: `Source → Build → UpdatePipeline → deploy per stage` |
| Run the CI checks | Wire npm scripts, `jq` surgery, `package-verification.json` | Your own `npm run` scripts run by default — a fresh project passes, with the wrapper's checks available to point them at |
| Change the pipeline | Re-run a build command by hand | Edit config, push — the pipeline self-updates before the stages it affects |
| Scale to many targets | Grow pipeline resources per target | **Container mode**: one config-agnostic image, many deploy targets as config rows |
| Adopt it on a live app | Risk recreating deployed stacks | A codemod + a stack-name helper that keep already-deployed resources **in place** |

The through-line: **fewer moving parts you have to own, and a pipeline you can read.** Everything below is
a usage pattern that leans on one of these wins.

## What you'll learn

Each chapter is a distinct usage pattern; they build on the first but can be read on their own. Every
chapter opens with what you'll build, ends with a **Verify** step and a recap, and the workshop closes
with a **cleanup** you should run to avoid leaving billable resources behind.

1. **A config-driven pipeline** — the core Autopilot flow, and a field-by-field tour of `cicd.config.ts`
   (`defineCICD`) including how to customize CI.
2. **Stages, approvals, and stack names** — dev→prod, manual-approval gates, per-stage regions and
   accounts, forced deployment roles, and controlling CloudFormation stack names with `stageStackName`.
3. **Deploy models and pipeline tuning** — assembly promotion (the default) vs deploy-time synth, async
   deploy, and disposable pipelines.
4. **Private npm registry** — authenticating the pipeline's builds to a private CodeArtifact repo.
5. **Container mode** — building a config-agnostic deployer image (Repo 1) and deploying it against
   per-target config (Repo 2): one image → many deployments.
6. **Migrating from Blueprint** — the `cdk-cicd migrate` codemod, and keeping already-deployed resources.
7. **Recap and cleanup** — what you built, and how to tear it all down.

## Target audience

Software / DevOps / Cloud engineers comfortable with AWS CDK. **Expected time:** ~1 hour.

!!! note "Autopilot is pre-release"
    Autopilot develops on a dedicated branch and is **not yet on the public npm `latest` tag**. Where a chapter
    says `npm install @cdklabs/cdk-cicd-wrapper`, use your pre-release channel (or the private CodeArtifact
    repo your team publishes to) until Autopilot ships under an alpha tag. The commands and config are otherwise
    exactly what a released Autopilot uses.
