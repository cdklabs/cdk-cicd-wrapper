---
name: cdk-cicd-pipeline
description: Use when asked to launch an AWS CodePipeline for a CDK app with cdk-cicd-wrapper (Autopilot), with a CodeCommit, GitHub (CodeStar) or S3 source, deploying to one or more stages in one or more AWS accounts or Regions; to set one up from a fresh `cdk init` app; to add a stack or a stage to an existing cdk-cicd pipeline; or to find out why a cdk-cicd pipeline run failed.
---

# cdk-cicd-pipeline

cdk-cicd-wrapper turns a plain CDK app into one CodePipeline:
`Source → Build (checks + synth) → UpdatePipeline → one deploy stage per stage`. Two files carry the
setup, `cicd.config.ts` and the `app` line in `cdk.json`. The app's own code stays plain CDK.

The pipeline, and a CodeCommit source repository, live in one account and Region: the **pipeline
account**. Each stage deploys the app into its own account and Region, which can be the pipeline's or
another one.

## Safety, before anything that touches AWS

- **Prove the account first:** run `aws sts get-caller-identity` and compare the account with the
  pipeline account the user named. `cdk-cicd deploy-ci` deploys to whatever account these credentials
  point at. Stop if they differ, or if the user named none and it might be production.
- **Set the pipeline Region explicitly:** `export AWS_REGION=<pipeline region>`. `deploy-ci` creates the
  pipeline in the ambient Region, and every stage without an `env` deploys there. `cdk-cicd synth` reads the
  Region from `CDK_DEFAULT_REGION`, `AWS_REGION` or `AWS_DEFAULT_REGION`, and `init` from the last two, never
  from a profile.
- `cdk-cicd deploy-ci` creates real resources in the pipeline account: a CodePipeline, CodeBuild projects
  (two for the pipeline itself, plus one per stage target), an S3 artifact bucket, a KMS key, IAM roles
  and, for a CodeCommit source, the repository. Say so before you run it.
- Bootstrapping an account is a change to that account. Ask before bootstrapping any account, and never
  bootstrap a production account without the user's explicit go-ahead.
- Never pass `--disposable` for a pipeline someone will keep. It deletes the artifact bucket and key
  along with the stack.
- Deleting a pipeline (`cdk destroy`, deleting stacks or repositories) needs the user's explicit go-ahead,
  every time. A CodeCommit repository that `deploy-ci` created belongs to the pipeline stack: deleting
  the stack deletes the repository and its history. Prefer `--existing` with a repository the user
  created, so the source outlives the pipeline.
- Approving a manual-approval stage releases a change into that stage. Leave approvals to the user
  unless they ask you to approve.

## What you need first

1. **Tools:** Node.js with npm, the AWS CLI v2, and git.
2. **Credentials for the pipeline account**, checked as above.
3. **A source in the pipeline account:**
   - **CodeCommit:** check access with `aws codecommit list-repositories`.
   - **GitHub:** a CodeStar connection (AWS CodeConnections). A new connection stays `Pending` until a
     person completes the handshake in the console; the pipeline cannot read GitHub before that.
   - **S3:** cdk-cicd imports the bucket, it does not create it. The bucket must exist, with versioning
     turned on, as a CodePipeline S3 source requires.
4. **The bootstrap qualifier: read what is configured, and run every check below with it.** Never
   assume a qualifier, and never fall back to the CDK's built-in one because nothing is set.
   - **Stage deploys** take `qualifier` from `cicd.config.ts`. Without it, a config with `application`
     derives one from the application name (its letters and digits, lowercased, first 10 characters); work
     it out from the name. Only a config with neither falls back to the `cdk.json` context.
   - **The pipeline stack** ignores `qualifier` in `cicd.config.ts`. It takes only the
     `@aws-cdk/core:bootstrapQualifier` context in `cdk.json`.
   - **For a new pipeline**, ask the user which qualifier their accounts are bootstrapped with, and pass it
     as `cdk-cicd init --qualifier <qualifier>`. Leave `--qualifier` out only when the user wants the derived
     one: `init` then keeps a qualifier `cdk.json` already sets, and otherwise derives it. Either way `init`
     writes the qualifier into the `cdk.json` context and a matching `toolkitStackName`, so the stages, the
     pipeline stack and a `cdk bootstrap` run in the project all use the same one, and it prints it.
   - **For an existing pipeline**, if `cdk.json` sets no context, say so and ask the user. Don't fill one in:
     adding the context moves the running pipeline to that qualifier, and its UpdatePipeline role holds only
     the old qualifier's roles. That change needs the new bootstrap first and one `cdk-cicd deploy-ci` by hand.
   - **Never run `cdk bootstrap` in a project whose `cdk.json` sets the context but no `toolkitStackName`.**
     It takes the qualifier from the context and rewrites the stack named `CDKToolkit`, which may hold the
     account's other qualifier and serve other apps. Always pass `--toolkit-stack-name`.
5. **A CDK bootstrap in every account and Region involved:** the pipeline's, and each stage's. Check
   each one with that account's credentials:
   ```sh
   aws ssm get-parameter --name /cdk-bootstrap/<qualifier>/version --region <region> \
     --query Parameter.Value --output text
   aws cloudformation describe-stacks --region <region> --output text --query \
     "Stacks[?Parameters[?ParameterKey=='Qualifier' && ParameterValue=='<qualifier>']].[StackName, Parameters[?ParameterKey=='TrustedAccounts'] | [0].ParameterValue, Parameters[?ParameterKey=='CloudFormationExecutionPolicies'] | [0].ParameterValue]"
   ```
   The second command finds the bootstrap stack by its `Qualifier` parameter, because its name varies
   (`CDKToolkit-<qualifier>` is common). It prints the stack name, the trusted accounts and the execution
   policies. With no such stack, and only after the user agrees, create one:
   `npx cdk bootstrap aws://<ACCOUNT>/<REGION> --qualifier <qualifier> --toolkit-stack-name CDKToolkit-<qualifier>`,
   plus the trust options below for a stage in another account.
   - **A stage in the pipeline account** (any Region) needs a bootstrap with that qualifier there, and no
     trust.
   - **A stage in another account** needs its bootstrap to trust the pipeline account: `TrustedAccounts`
     must list it. If it does not, the command, run with that stage account's credentials and only after
     the user agrees, is:
     ```sh
     npx cdk bootstrap aws://<STAGE_ACCOUNT>/<STAGE_REGION> --qualifier <qualifier> \
       --toolkit-stack-name <THAT_STACK_NAME> \
       --trust <PIPELINE_ACCOUNT> --trust <EACH_ACCOUNT_ALREADY_TRUSTED> \
       --cloudformation-execution-policies <CURRENT_POLICIES>
     ```
     `--toolkit-stack-name` must name the stack found above. Without it, `cdk bootstrap` updates the stack
     named `CDKToolkit`, which may hold another qualifier.
     `--trust` replaces the list: an account already in `TrustedAccounts` that you leave out loses its
     access. Keep the current `CloudFormationExecutionPolicies` rather than widening them. An empty
     value means the bootstrap default, `arn:aws:iam::aws:policy/AdministratorAccess`, which `--trust`
     requires you to name. Narrow it if the user's organization requires.

## Plan the stages

- **One account, one Region:** `--stages dev,prod` is enough. `dev` deploys on every push. Every other
  stage except `res` waits for a manual approval by default. Stages that share an account and Region
  need distinct stack names; see step 3 below.
- **Another Region or another account:** give the stage an `env` in `cicd.config.ts`. A stage without
  `env` deploys into the pipeline's account and Region.
  ```ts
  stages: [
    'dev',
    { name: 'prod', env: { account: '<PROD_ACCOUNT>', region: '<PROD_REGION>' } }, // manual approval by default
  ],
  ```
  Set `manualApproval: false` on a stage to deploy it without waiting, and `manualApproval: true` on
  `dev` to gate it too.

## Launch a new pipeline

1. In the app: `npm i @cdklabs/cdk-cicd-wrapper @cdklabs/cdk-cicd-wrapper-cli`.
2. Configure it: `npx cdk-cicd init --stages dev,prod --qualifier <qualifier>`, with the qualifier from
   "What you need first". This writes `cicd.config.ts`, points `cdk.json` at `cdk-cicd exec`, and sets the
   qualifier context and `toolkitStackName` in `cdk.json`. For a CodeCommit repository the user already created, add `--existing`,
   plus `--repository <name>` when it is not named after the application. Use
   `--source codestar --repository owner/repo --connection-arn <arn>` for GitHub and
   `--source s3 --s3-object bucket/key.zip` for S3. Preview with `--dry-run`. Then add each stage's
   `env`, as in "Plan the stages".
3. **Bind every stack to an account.** cdk-cicd refuses to deploy a stack that names no account. In a
   `cdk init` app, uncomment the line `init` warns about:
   `env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION }`.
   cdk-cicd sets both from each stage's `env`. A stage without `env.account` gets the account of the
   credentials, which in the pipeline is the pipeline account.
   **Stages sharing an account and Region need distinct stack names.** A fixed stack name makes them
   share one stack. Give each stage a different account or Region, or add
   `stackName: stageStackName('<name>')` (imported from `@cdklabs/cdk-cicd-wrapper`; it appends the stage).
4. Check it: `npx cdk-cicd synth --all --require-account`. It synthesizes every stage into
   `cdk.out/<stage>/<region>/`, and fails on a stack without an account, as the pipeline's Build stage
   does. Plain `synth` only warns.
5. Provision it once, with the pipeline account's credentials and after the checks above:
   `npx cdk-cicd deploy-ci`. Its pipeline is named `<application>-pipeline`.
6. Start the first run from the source:
   - **CodeCommit:** commit and push. `init` prints the exact commands: a repo-local
     `aws codecommit credential-helper` remote, a commit, and a push to `main`.
   - **GitHub:** complete the connection if it is still `Pending`, then push to the configured branch.
   - **S3:** upload the zip to the configured bucket and key.
   CodePipeline also starts a run when it creates the pipeline. On a source with nothing in it yet, such
   as a new CodeCommit repository, that run fails; the push or upload starts the real one.
7. Watch the run: `aws codepipeline get-pipeline-state --name <application>-pipeline`. A gated stage stops
   at its `Approve-<stage>` action. The user approves it in the CodePipeline console, or with
   `aws codepipeline put-approval-result --pipeline-name <application>-pipeline --stage-name <stage>
   --action-name Approve-<stage> --token <token from get-pipeline-state> --result summary=...,status=Approved`.
8. Confirm each stage's stacks in its own account and Region:
   `aws cloudformation describe-stacks --stack-name <stack> --region <region>`.

## Add a stack

Add it to the app's entry (`bin/<app>.ts`) as plain CDK, with the same `env` line (and a `stageStackName`
stack name when stages share an account and Region), then `npx cdk-cicd synth --all --require-account`,
commit and push. Every stage deploys every stack of the app. There is no other wrapper code to add.

## Add a stage

Add its name, or `{ name, env, manualApproval }`, to `stages` in `cicd.config.ts`, then commit and push. A
stage in a new account or Region needs that account's bootstrap first, with the configured qualifier (see
"What you need first"). The UpdatePipeline stage applies the change, so you never need `deploy-ci` again.
A stage that shares an account and Region with another stage needs distinct stack names: a different
account or Region, or `stageStackName`.

## A run failed

Use the `cdk-cicd-pipeline-failure-investigation` skill from the same repository: it maps each action to
what it runs and where its logs and stacks live, pipeline account or stage account. If `cicd.config.ts`
sets `devopsAgent`, use `cdk-cicd-devops-agent` instead: DevOps Agent may already have opened an
investigation for the failed action. Without either skill, read the failed action's CodeBuild log
(`list-action-executions`, then `batch-get-builds`, then the log stream). A stage that deploys to several
Regions in parallel has one `Deploy-<stage>-<region>` action per Region. Messages that start with
`cdk-cicd` come from the wrapper and say what to fix. A `Deploy-<stage>` that cannot assume a role in
another account usually means that account's bootstrap does not trust the pipeline account, or uses
another qualifier.
