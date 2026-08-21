# v3 pipelines — the config-driven CDK CI/CD Wrapper

This workshop walks through the **v3** usage patterns of the CDK CI/CD Wrapper. v3 is a redesign around
one idea:

> **Your app stays ordinary CDK. One `cicd.config.ts` turns it into a pipeline — no wrapper code in your
> app, no builder chain.**

Where v2 built the pipeline *inside* your app with `PipelineBlueprint.builder()…synth(app)`, v3 keeps
your `bin/` exactly as `cdk init` produced it and reads a separate config file. The pipeline is one flat
CodePipeline (source → CI → self-update → one deploy action per stage), not the 100+ CodeBuild projects
v2's CDK-Pipelines footprint grew.

## What you'll learn

Each chapter is a distinct usage pattern; they build on the first but can be read on their own:

1. **A config-driven pipeline** — the core zero-touch flow: `cicd.config.ts` + `cdk-cicd deploy-ci`.
2. **Stages, approvals, and stack names** — dev→prod, manual-approval gates, per-stage config, and
   controlling CloudFormation stack names with `stageStackName`.
3. **Deploy models and async deploy** — assembly promotion (the default) vs deploy-time synth, and
   handing the CloudFormation wait to a Lambda.
4. **Private npm registry** — authenticating the pipeline's builds to a private CodeArtifact repo.
5. **Container mode** — building and pushing a config-agnostic deployer image to ECR (the two-repo split).
6. **Migrating from v2** — the `cdk-cicd migrate` codemod, and keeping already-deployed resources.

## Target audience

Software / DevOps / Cloud engineers comfortable with AWS CDK. **Expected time:** ~1 hour.

!!! note "v3 is pre-release"
    v3 develops on a dedicated branch and is **not yet on the public npm `latest` tag**. Where a chapter
    says `npm install @cdklabs/cdk-cicd-wrapper`, use your pre-release channel (or the private CodeArtifact
    repo your team publishes to) until v3 ships under an alpha tag. The commands and config are otherwise
    exactly what a released v3 uses.
