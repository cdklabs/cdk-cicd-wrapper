# cdk-cicd-wrapper-example

The Autopilot shape of the CDK CI/CD Wrapper. The point: **the app is ordinary CDK**, whose one wrapper import
(`stageStackName`) only names its stacks, and one `cicd.config.ts` turns it into a pipeline.

```
bin/app.ts        plain `new App()` + your stacks — no PipelineBlueprint, no builder chain
lib/stack.ts      your application stack (unchanged CDK)
cicd.config.ts    defineCICD({ application, repository, stages }) — the whole pipeline definition
cdk.json          "app": "npx cdk-cicd exec bin/app.ts"  — the wrapper injects config/tags around the app;
                  plus the bootstrap qualifier for the pipeline stack and its bootstrap stack name
```

Compare with the Blueprint shape — `PipelineBlueprint.builder()…synth(app)` built inside `src/main.ts`, with
the projen `CdkCICDWrapper` generating the scaffolding — preserved, untouched, on the `legacy-blueprint`
branch (its `cdk-ts-example` sample was removed from `main` in `m8-remove-v2`).

## Use it

Copy this directory out of the repository: the pipeline builds the repository it follows from its root. Then,
with credentials for the account and Region the pipeline is to live in:

```bash
npm install
npx cdk-cicd synth --all   # check that dev and prod synthesize
```

`dev` and `prod` name no account, so both deploy into the pipeline's account and Region. Bootstrap it with
`cdkcicdwra`, the qualifier `defineCICD` derives from `application` when `cicd.config.ts` sets no `qualifier`.
The pipeline stack uses the same one, from `@aws-cdk/core:bootstrapQualifier` in `cdk.json`:

```bash
npx cdk bootstrap aws://PIPELINE_ACCOUNT/REGION --qualifier cdkcicdwra --toolkit-stack-name CDKToolkit-cdkcicdwra
```

A pipeline deployed from this sample before its `cdk.json` set that context runs on the CDK's own qualifier.
After you pull this change, bootstrap `cdkcicdwra` as above and run `npx cdk-cicd deploy-ci` once, so the pipeline
moves to it instead of trying to update itself on roles it was never granted.

If you give a stage its own account or Region (`{ name: 'prod', env: { account: '111111111111', region: 'eu-west-1' } }`),
bootstrap that one too, trusting the pipeline account:

```bash
npx cdk bootstrap aws://STAGE_ACCOUNT/STAGE_REGION --qualifier cdkcicdwra --toolkit-stack-name CDKToolkit-cdkcicdwra \
  --trust PIPELINE_ACCOUNT \
  --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
```

Re-bootstrapping replaces what the bootstrap stack holds. An account the stack trusts that the command does not pass
with its own `--trust` loses its access ([`cdk bootstrap` reference](https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-bootstrap.html)),
and `--cloudformation-execution-policies` replaces the stored policies, so narrowed ones become what you pass. Before you
re-bootstrap an account and Region, read the stack's `TrustedAccounts` and `CloudFormationExecutionPolicies`:
`aws cloudformation describe-stacks --stack-name CDKToolkit-cdkcicdwra --region STAGE_REGION --query "Stacks[0].Parameters"`.

Provision the pipeline. It also creates the CodeCommit repository `cdk-cicd-wrapper-example`; push the sample to
its `main` branch to start the first run:

```bash
npx cdk-cicd deploy-ci
git init -b main && git add -A && git commit -m 'Deliver the sample through cdk-cicd-wrapper'
git remote add origin https://git-codecommit.REGION.amazonaws.com/v1/repos/cdk-cicd-wrapper-example
git config credential.https://git-codecommit.REGION.amazonaws.com.helper ''
git config --add credential.https://git-codecommit.REGION.amazonaws.com.helper '!aws codecommit credential-helper $@'
git config credential.https://git-codecommit.REGION.amazonaws.com.UseHttpPath true
git push -u origin main
```

The pipeline then runs Source, Build (`npm ci`, a warning for each of the `audit`, `build` and `test` scripts
this sample does not define, then `cdk-cicd synth --all --require-account`), UpdatePipeline, `Deploy-dev`, and
`Approve-prod` before `Deploy-prod`. `dev` deploys the stack `cdk-cicd-wrapper-example-dev` and `prod` deploys
`cdk-cicd-wrapper-example-prod`: `bin/app.ts` uses `stageStackName` to name them.

## Migrating an existing Blueprint app

`cdk-cicd migrate --entry src/main.ts` scaffolds the `cicd.config.ts`. To keep already-deployed resources
(update in place instead of recreating), name your stacks to match what Blueprint deployed —
`stageStackName('app', { stageFirst: true, uppercaseStage: true })` reproduces Blueprint's `DEV-app`. See the
repo `MIGRATION.md` (*Preserving already-deployed resources*).
