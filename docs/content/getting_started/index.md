# Getting Started with the {{ project_name }}

This guide walks through turning a plain AWS CDK app into a CI/CD pipeline with the {{ project_name }}: install two packages, write one `cicd.config.ts` file, and run one CLI command. It follows the same shape as the [`cdk-v3-example`](https://github.com/cdklabs/cdk-cicd-wrapper/tree/main/samples/cdk-v3-example) sample in the repository — clone that sample if you want a working starting point instead of typing this out.

## Overview

There is **no wrapper code in your app** — for a TypeScript/JavaScript CDK app. Your `bin/` entry point stays exactly what `cdk init` produced — a plain `App` with your stacks. A separate `cicd.config.ts` file, next to `cdk.json`, describes the pipeline (source repository, stages, CI steps, …). The wrapper is injected at synth time through `cdk.json`'s `app` command (a Node `require` preload); with no `cicd.config.ts` present your app deploys as stock CDK, unmodified. This walkthrough is TS/JS-specific: the preload mechanism can't attach to a non-Node app entry (e.g. Python), so those apps use the explicit `CdkCicd.attach(app)` call in `bin/` instead of the zero-touch `cdk-cicd exec` path — see the package's jsii-published bindings for the equivalent in your language.

## Prerequisites

See [Prerequisites](./prerequisites.md) for the full list (AWS CLI, Docker, Node.js, etc.). You will also need:

1. **AWS accounts** for each stage you plan to deploy to (or a single account for everything, while you evaluate).
2. **A source repository** — AWS CodeCommit, GitHub (via an [AWS CodeStar connection](../developer_guides/vcs_github.md)), or S3.

## New CDK project

If you don't already have a CDK project, create one first:

```bash
mkdir my-project
cd my-project
npx aws-cdk@latest init app --language typescript
```

## Installation

Install the wrapper library and its CLI:

```bash
npm install @cdklabs/cdk-cicd-wrapper @cdklabs/cdk-cicd-wrapper-cli
```

**Note**: If the `@cdklabs` scope is not resolvable from the public npm registry (for example while a pre-release version is only published under the `next` dist-tag, or your organization proxies npm through a private registry), configure a [private NPM registry](../developer_guides/private_npm_registry.md) or [AWS CodeArtifact](../developer_guides/codeartifact.md) first.

## Write `cicd.config.ts`

Create `cicd.config.ts` next to your `cdk.json`:

```typescript
import { defineCICD, Repository } from '@cdklabs/cdk-cicd-wrapper';

export default defineCICD({
  application: 'my-project',
  repository: Repository.codecommit('my-project'), // or Repository.s3('bucket/key'), or Repository.codestarConnection('org/my-project', connectionArn) for GitHub
  // 'dev' auto-approves (inner loop); 'prod' is gated by a manual approval by default.
  stages: ['dev', { name: 'prod', env: { account: '111111111111', region: 'eu-west-1' } }],
});
```

See the [CD developer guide](../developer_guides/cd.md) for the full stage shape (multi-region stages, per-stage manual approval, forced deploy roles) and [Repository sources](../developer_guides/vcs_codecommit.md) for CodeCommit/GitHub/S3 specifics.

## Point `cdk.json` at `cdk-cicd exec`

`cdk.json`'s `app` command is what turns your plain app into a wrapped one — nothing else in `bin/` needs to change:

```json
{
  "app": "npx cdk-cicd exec bin/my-project.ts"
}
```

`cdk-cicd exec` resolves the active stage's config, exports its account/region so a stock `env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION }` line in your stack resolves correctly, and runs your entry file under a preload that applies the wrapper's runtime hooks (tagging, default security aspects, etc.) — with zero references to the wrapper in your own code:

```typescript
// bin/my-project.ts — ordinary CDK, no wrapper imports required
import * as cdk from 'aws-cdk-lib';
import { MyStack } from '../lib/my-stack';

const app = new cdk.App();
new MyStack(app, 'my-project', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
```

**Optional**: to control the CloudFormation stack name per stage (for example `my-project-dev`/`my-project-prod`), use the `stageStackName` helper:

```typescript
import { stageStackName } from '@cdklabs/cdk-cicd-wrapper';

new MyStack(app, 'my-project', {
  stackName: stageStackName('my-project'),
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
```

## Bootstrap your stages

The {{ project_name }} uses the AWS CDK Toolkit with a cross-account trust relationship to deploy to multiple AWS accounts. Bootstrap every account/region a stage in `cicd.config.ts` targets, trusting the account the pipeline itself runs in (the account your ambient credentials point at when you run `cdk-cicd deploy-ci` below):

```bash
npx cdk bootstrap aws://<STAGE_ACCOUNT>/<STAGE_REGION> --trust <PIPELINE_ACCOUNT> \
  --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
```

If you are reusing an existing CDK bootstrap setup that already trusts the pipeline account, you can skip this step.

## Deploy the pipeline

From the account/region the pipeline itself should run in:

```bash
npx cdk-cicd deploy-ci
```

This provisions the pipeline from `cicd.config.ts` alone — nothing else needs to exist yet. From here, the pipeline self-updates from `cicd.config.ts` on every run, so you only run `deploy-ci` by hand once (and again if you ever need to recover a deleted pipeline stack).

Once deployed, the pipeline runs: **Source** → **Build** (`npm ci`, then either your configured `ci.steps` or, if you set none, the default `npx cdk-cicd check`, then `cdk synth` with CDK Nag) → **self-update** → one **deploy** action per configured stage, in order, gated by a manual approval on every stage except your inner-loop ones (`dev`/`res`) unless you set `manualApproval` explicitly.

## Configuring Continuous Integration

Leave `ci.steps` unset and the build runs `npx cdk-cicd check` by default — `validate` (lock-file integrity), `audit` (dependency CVE scanning), `license` (open-source license checking), and `security` (Bandit/Semgrep/ShellCheck), each skipped rather than failed when the project has no baseline for it yet (for example a fresh `cdk init`-ed project with no `package-verification.json`).

Setting `ci.steps` **replaces** that default `cdk-cicd check` step rather than adding to it, so include it explicitly if you still want those checks:

```typescript
export default defineCICD({
  // ...
  ci: {
    steps: {
      check: 'npx cdk-cicd check',
      build: 'npm run build',
      test: 'npm run test',
    },
  },
});
```

See the [CI developer guide](../developer_guides/ci.md) for the full picture, including the CI build's synth ordering (always appended, never replaced) and the `partialBuildSpec` escape hatch.

## Deploy changes with GitOps

After the pipeline is deployed, push to the tracked branch to trigger it. For a CodeCommit repository:

```bash
sudo pip3 install git-remote-codecommit  # once per machine
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
git remote add origin "codecommit::${AWS_REGION}://${GIT_REPOSITORY}"
git push -u origin "${CURRENT_BRANCH}:main"
```

For GitHub, add the remote the normal way and push — the CodeStar connection ARN you passed to `Repository.codestarConnection(...)` is what lets the pipeline read it. See [GitHub Integration](../developer_guides/vcs_github.md) for the connection setup and why `Repository.github(...)` alone is not enough outside the GitHub Actions engine.

## Migrating an existing v2 (Blueprint) project

If you have an existing `PipelineBlueprint.builder()…synth(app)` project, `cdk-cicd migrate` scaffolds the `cicd.config.ts` for you:

```bash
npx cdk-cicd migrate --entry src/main.ts --application my-project   # add --dry-run to preview
```

It extracts your stage list (falling back to v2's default `RES`/`DEV`/`INT` when no `.defineStages(...)` call is found), flags anything it can't safely determine — the repository is always flagged as unresolved today (set `repository: Repository.*(...)` yourself), plus hooks/phases, `workbench`, … — and prints the remaining manual steps. It deliberately does not rewrite your entry file's stack construction. Read the full mapping table and the **Preserving already-deployed resources** section in the repository's [`MIGRATION.md`](https://github.com/cdklabs/cdk-cicd-wrapper/blob/main/MIGRATION.md) before switching a production pipeline over — getting the CloudFormation stack name right is what decides whether your existing resources are updated in place or recreated.

## Next steps

Read the [Developer Guide](../developer_guides/index.md) for the full picture: repository sources, stage/CD configuration, CI steps, security scanning, VPC/proxy/private-registry support, and the container ("two-repo") deployment mode.
