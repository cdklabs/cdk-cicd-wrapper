---
name: cdk-cicd-pipeline
description: Set up and grow an AWS CodePipeline for a CDK app with cdk-cicd-wrapper (Autopilot). Use when asked to add a CI/CD pipeline to a CDK app, create a new pipeline from a fresh `cdk init` app, add a stack or a deployment stage to an existing cdk-cicd pipeline, or check why a cdk-cicd pipeline run failed.
---

# cdk-cicd-pipeline

cdk-cicd-wrapper turns a plain CDK app into one CodePipeline:
`Source → Build (checks + synth) → UpdatePipeline → one deploy stage per stage`. Two files carry the
setup, `cicd.config.ts` and the `app` line in `cdk.json`. The app's own code stays plain CDK.

## Before anything that touches AWS

- **Prove the account first:** run `aws sts get-caller-identity` and compare the account with the one
  the user named. Stop if they differ, or if the user named none and it might be production.
- `cdk-cicd deploy-ci` creates real resources: a CodePipeline, CodeBuild projects (two for the pipeline
  itself plus one per stage target), an S3 artifact bucket, a KMS key, IAM roles and, for a CodeCommit
  source, the repository. Say so before you run it.
- Never pass `--disposable` for a pipeline someone will keep. It deletes the artifact bucket and key
  along with the stack.
- Deleting a pipeline (`cdk destroy`, deleting stacks or repositories) needs the user's explicit go-ahead,
  every time. A CodeCommit repository that `deploy-ci` created belongs to the pipeline stack: deleting
  the stack deletes the repository and its history. Prefer `--existing` with a repository the user
  created, so the source outlives the pipeline.

## New pipeline for a CDK app

1. Install it in the app:
   `npm i @cdklabs/cdk-cicd-wrapper @cdklabs/cdk-cicd-wrapper-cli`.
2. Configure it: `npx cdk-cicd init --stages dev,prod`. This writes `cicd.config.ts` and points `cdk.json` at
   `cdk-cicd exec`. Use `--source codestar --repository owner/repo --connection-arn <arn>` for GitHub and
   `--source s3 --s3-object bucket/key.zip` for S3. Run it with `--dry-run` first to preview.
3. **Bind every stack to an account.** cdk-cicd refuses to deploy a stack that names no account. In a
   `cdk init` app, uncomment the line `init` warns about:
   `env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION }`.
   cdk-cicd sets both for every stage.
4. Check it: `npx cdk-cicd synth --all --require-account`. It fails on a stack without an account, as the
   pipeline's Build stage does. Plain `synth` only warns.
5. Provision it once, after the account check above: `npx cdk-cicd deploy-ci`.
6. Commit and push. `init` prints the exact commands; for CodeCommit they set up a repo-local
   `aws codecommit credential-helper` remote, commit, and push to `main`. The pipeline run that CodePipeline
   starts on creation fails on the still-empty repository; the push starts the real one.

## Add a stack

Add it to the app's entry (`bin/<app>.ts`) as plain CDK, with the same `env` line, then
`npx cdk-cicd synth --all --require-account`, commit and push. Every stage deploys every stack of the app. There is no wrapper code
to add.

## Add a stage

Add its name, or `{ name, env, manualApproval }`, to `stages` in `cicd.config.ts` and push. The
UpdatePipeline stage applies the change; you never need `deploy-ci` again. Every stage except `dev` and
`res` asks for manual approval by default.

## Check a run

- `aws codepipeline get-pipeline-state --name <application>-pipeline` shows each stage.
- For a failed action, read its CodeBuild log (`list-action-executions`, then `batch-get-builds`, then the
  log stream). Messages that start with `cdk-cicd` come from the wrapper and say what to fix.
