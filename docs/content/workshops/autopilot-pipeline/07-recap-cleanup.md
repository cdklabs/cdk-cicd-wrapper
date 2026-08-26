# Recap and cleanup

!!! abstract "In this chapter"
    - A recap of what you built across the workshop.
    - How to tear down every resource you created so nothing keeps billing.

## What you built

Across the workshop you took a stock `cdk init` app and, with no wrapper code in `bin/`:

- **Turned it into one flat CodePipeline** from a single `cicd.config.ts` — `Source → Build →
  UpdatePipeline → deploy per stage` — and learned every `defineCICD` field.
- **Modeled a promotion path as data** — stages, fail-closed approval gates, multi-region fan-out, and
  forced deployment roles.
- **Chose a deploy model and tuned the pipeline** — assembly promotion vs deploy-time synth, async deploy,
  and disposable provisioning.
- **Authenticated builds to a private CodeArtifact registry** with one config block.
- **Ran container mode** — Repo 1 builds a config-agnostic image; Repo 2's `defineDeployment` deploys it
  to many targets with `cdk-cicd deploy --from-image`.
- **Saw how to migrate from Blueprint** without recreating deployed stacks.

The through-line: fewer moving parts you own, and a pipeline you can read.

## Cleanup

!!! warning "Only delete resources you created for this workshop"
    The steps below tear down the stacks this workshop created. Deleting shared or production stacks can
    cause outages or data loss. Confirm each stack name belongs to this workshop before deleting it, and
    work in your sandbox/dev account.

Delete in reverse order of creation so dependencies resolve cleanly.

### 1. Delete the application stacks

For each stage the pipeline deployed to (e.g. `dev`, `prod`), delete the application stacks in that
stage's account and region — for example `my-app-dev`, `my-app-prod` if you used `stageStackName`:

```bash
aws cloudformation delete-stack --stack-name my-app-dev --region <region>
```

### 2. Delete the pipeline and support stacks

In the hub account, delete the pipeline stack and the support stacks the wrapper provisioned (encryption,
compliance/log bucket, SSM parameters). Empty the artifact and log S3 buckets first if deletion is blocked
by non-empty buckets.

!!! tip "Disposable pipelines self-clean"
    If you provisioned with `npx cdk-cicd deploy-ci --disposable`, teardown empties and deletes the
    pipeline's own resources (including a provisioned ECR repo in container mode) for you — use it for
    throwaway experiments.

### 3. Container mode — remove the deployer image

If you ran chapter 5, delete the pushed image and, if the pipeline provisioned it, the
`<application>-deployer` ECR repository (a disposable pipeline does this automatically):

```bash
aws ecr delete-repository --repository-name my-app-deployer --force --region <region>
```

### 4. Leave the CDK bootstrap in place (usually)

The `CDKToolkit` bootstrap stack is shared across all CDK apps in an account/region. Leave it unless this
was a throwaway sandbox you're fully decommissioning.

!!! success "Verify"
    In each account/region you used, the **CloudFormation** console lists no remaining workshop stacks,
    and no CodePipeline, CodeBuild projects, or ECR repositories from this workshop remain. Any leftover
    S3 buckets from the pipeline are empty and deleted.

## Recap

You've completed the zero-touch pipeline workshop and cleaned up after it. You can now take any ordinary CDK app,
add one config file, and get a readable, config-driven pipeline — scaling out to container mode or
migrating from Blueprint when you need to.
