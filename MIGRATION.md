# Migration Guide for CDK CI/CD Wrapper

This document outlines the notable migration and cleanup tasks involved in upgrading this CDK CI/CD Wrapper project to different versions.

## Version Compatibility

Each section details the changes introduced between specific version ranges (e.g., [0.0.0] - [0.0.6]).

### [0.2.x] → [1.0 / v3] Migration — config-driven pipelines, zero wrapper code in your app

> **Status:** v3 develops on the `v3` branch and, when first exposed, ships as `1.0.0-alpha.N` under the
> npm dist-tag `next` — **not** `latest`. The 0.x (`PipelineBlueprint`) line keeps working and publishing
> until the v3.0 major. This chapter is the mapping you follow when you move; it is additive, so you can
> adopt v3 on a branch while 0.x stays in production. Some v2 capabilities are not in v3 yet — those rows
> are marked **(roadmap)** below, and you should not migrate a project that depends on them yet.

**The one big change.** In v2 you *wrote wrapper code in your `bin/`* — `PipelineBlueprint.builder()…
.synth(app)`. In v3 your `bin/` stays exactly what `cdk init` produced (a plain `App` with your stacks),
and the pipeline is described in a separate **`cicd.config.ts`** next to `cdk.json`. The wrapper is
injected at synth time via `cdk.json`'s app command (`npx cdk-cicd exec bin/app.ts`); with no
`cicd.config.ts` present the wrapper is inert and your app deploys as stock CDK. You provision the
pipeline once with `cdk-cicd deploy-ci`, and it self-updates from `cicd.config.ts` on every run.

#### Before (v2) → After (v3)

```TypeScript
// v2 — bin/app.ts
const app = new App();
PipelineBlueprint.builder()
  .defineStages(['RES', { stage: 'DEV', env: { account: '…', region: 'us-east-1' } }, 'PROD'])
  .addStack({ provide: (ctx) => new MyStack(ctx.scope, 'my-app') })
  .synth(app);
```

```TypeScript
// v3 — bin/app.ts stays plain CDK; cdk.json runs `npx cdk-cicd exec bin/app.ts`
const app = new App();
new MyStack(app, 'my-app');
```

```TypeScript
// v3 — cicd.config.ts (new file, next to cdk.json)
import { defineCICD, Repository } from '@cdklabs/cdk-cicd-wrapper';
export default defineCICD({
  application: 'my-app',
  repository: Repository.codestarConnection('org/my-app', 'arn:aws:codestar-connections:…'),
  stages: ['dev', { name: 'prod', env: { region: 'us-east-1' } }], // 'prod' is gated by default
});
```

#### Mapping table

| v2 | v3 |
|---|---|
| `PipelineBlueprint.builder().defineStages(...).addStack(...).synth(app)` | `defineCICD({ stages, ... })` in `cicd.config.ts`; your stacks stay in `bin/` |
| stack names auto-prefixed by the stage (`DEV-myapp`) via `AppStage` | you name stacks in `bin/` — full control; use `stageStackName(base, { stageFirst: true, uppercaseStage: true })` to reproduce v2's name and update in place (see **Preserving already-deployed resources**) |
| `ACCOUNT_<STAGE>` / `CDK_QUALIFIER` / `npm_package_config_*` env | fields in `cicd.config.ts` (env interpolation is still allowed) |
| `RepositorySource.codecommit()/github()/s3()` | `Repository.codecommit()/github()/s3()`, plus `Repository.codestarConnection(name, connectionArn)` for GitHub via a CodeStar connection |
| `IResourceProvider` + `ResourceContext.instance()` singleton | same DI concept, de-singletoned and typed (`SupportResources`), lazily provisioned |
| `ComplianceBucketProvider` / `ComplianceLogBucketStack` (`IComplianceBucket`) / `deploymentDefinition[stage].complianceLogBucketName` | `complianceLogBucketName` field (`ResolvedCicdConfig`/`cicd.config.ts`), threaded by the CodePipeline engine into `SupportResources.complianceLogBucket`, provisioned on first read (the engine forces that read whenever the field is set, matching v2's default-on-when-configured behaviour); a plain CDK-managed `Bucket` instead of v2's custom-resource Lambda (the "bucket already exists" tolerance that Lambda existed for doesn't arise here, since this construct's stack owns the bucket for the pipeline's lifetime). Folds in the TLS/SSE bucket-policy correctness fix v2's Stage-1 change (`0b7ae02`) made: the at-rest-encryption Deny statement uses the `Null` condition operator (checking the encryption header's *absence*) rather than `Bool` (which never matches a request that omits the header entirely, so it silently let unencrypted uploads through) |
| `HttpProxyProvider` / `IProxyConfig` (`PipelineBlueprint.proxy(...)`) | `proxy` field (`ProxyConfig`) in `cicd.config.ts`; same `proxySecretArn`/`noProxy`/`proxyTestUrl` shape. Applied to every CodeBuild project `CodePipelineEngine` creates (build, self-update, each per-stage deploy, and the container-mode `BuildImage` project) and to `CdkPipelinesEngine`'s Synth step; CDK Pipelines' own self-mutation/asset-publishing projects have no per-step buildspec/secrets hook to reach and are not covered |
| `ciBuildSpec` (`CDKPipelineProps`) / `CodeBuildFactoryProvider`'s `partialBuildSpec` | `ci.partialBuildSpec` (`CiConfig`) in `cicd.config.ts`; a `codebuild.BuildSpec` deep-merged (via `codebuild.mergeBuildSpecs`) into the CI build project's generated spec — same escape-hatch shape, scoped to the CI build project the way v2 scoped it to Synth |
| `PipelineBlueprint.codeBuildEnvSettings(...)` / `CodeBuildFactoryProvider` | `codeBuildEnvSettings` field (reuses CDK's own `codebuild.BuildEnvironment` — `privileged`/`computeType`/`environmentVariables`/etc.) in `cicd.config.ts`; applied to every CodeBuild project by both engines, same as v2's uniform application |
| `definePhase` / `PhaseCommand` (`IPhaseCommand`, `NPMPhaseCommand`, `ShellScriptPhaseCommand`, `PythonPhaseCommand`, `InlineShellPhaseCommand`, `ShellCommandPhaseCommand`/`sh()`) | Subsumed by `ci.steps` — a plain string is strictly more general than a typed command-builder class, so the builder classes themselves have no v3 equivalent. v2's built-in phase wiring maps as: `INITIALIZE` (proxy/npm-login commands) → the `proxy`/`npmRegistry`/`codeArtifact` config fields; `PRE_BUILD`/`BUILD`/`TESTING` (npm ci, validate, audit, lint, build, test, synth) → `ci.steps` plus the default-on `cdk-cicd check`; `PRE_DEPLOY`/`POST_DEPLOY` → dropped (deploy hooks, not migrated) |
| default-on validate/audit/license/security | same, run by `cdk-cicd check` in the CI build (no npm-script surgery needed) |
| manual approval steps | `manualApproval` per stage; non-`dev`/`res` stages are gated by default |
| `deployment.deployRole` / forced synth roles | `deployment.deployRole` on a stage (unchanged concept) |
| pipeline provisioning by deploying the app stack | `cdk-cicd deploy-ci` provisions the pipeline; it self-updates from config each run |
| Plugins (Aspect-based) | unchanged; applied by the runtime injection hook |
| `workbench(...)` | Level-0 direct `cdk deploy` (no pipeline) |
| `GitHubPipelinePlugin` / GitHub Actions | **(roadmap)** a first-class GitHub Actions engine — not in v3 yet; v3 today is the CodePipeline engine |
| container / two-repo image mode | **(roadmap)** not in v3 yet |
| `@cdklabs/cdk-cicd-wrapper-projen` project type | replaced by `cicd.config.ts` (+ `cdk-cicd` CLI); the projen product is deprecated and removed at the major |

#### Notable v3 behaviours worth knowing

- **Flat footprint.** The CodePipeline engine builds ONE pipeline: source → one CI build → a
  self-update stage → one deploy action per stage. Where v2 (CDK Pipelines) grew a CodeBuild project per
  asset per stage (100+ on a real app), v3 is `1 + 1 + <stage count>`.
- **Deploy model (default: assembly promotion).** The CI build synthesizes every stage once, keeps
  `cdk.out`, and promotes it; deploy stages consume that assembly and do not re-synthesize. A second
  model, `DeployModel.DEPLOY_TIME_SYNTH`, synthesizes per stage at deploy time (with CI synthesizing one
  env by default). Docker mode is roadmap.
- **Private registry.** Set `codeArtifact` in `cicd.config.ts` to have every build authenticate to a
  private npm repo before `npm ci`.
- **Optional async deploy.** `asyncDeploy: true` hands the CloudFormation wait to a Lambda instead of
  billing build compute for it. Opt-in; cross-account stages are not supported under it yet.

#### Preserving already-deployed resources (migrate without a redeploy)

**This is the part to get right first.** CloudFormation keys resources to a stack by its **name**, so a
v3 deploy only *updates* your existing stack (keeping its resources) if it uses the **same stack name**
v2 deployed. Deploy a different name and CloudFormation creates a brand-new stack and leaves the old one
orphaned — a full recreate, exactly what you want to avoid for stateful resources.

The naming differs by default, and it is measurable:

| | CloudFormation stack name |
|---|---|
| **v2** (your stacks were nested in an `AppStage`, i.e. a `cdk.Stage`) | `<stageId>-myapp` — the stage id prefixed **verbatim**; `DEV-myapp` with v2's default `RES`/`DEV`/`INT`/`PROD` stages, but `staging-myapp` if you defined lowercase/custom stages |
| **v3** (plain `new MyStack(app, 'myapp')` in `bin/`) | `myapp` — just the construct id |

The **logical IDs inside the stack are unchanged** between v2 and v3, so once the names match it is a
clean in-place update, not a resource replacement. To match v2's name, use `stageStackName` (a v3
TS-authoring helper) in your `bin/`:

```ts
import { stageStackName } from '@cdklabs/cdk-cicd-wrapper';

// Reproduces v2's `DEV-myapp` / `PROD-myapp`, so v3 UPDATES the existing stack in place.
new MyStack(app, 'myapp', { stackName: stageStackName('myapp', { stageFirst: true, uppercaseStage: true }) });
```

**`uppercaseStage` matches v2's *default* stages only.** cdk prefixed the stack name with your stage id
*verbatim* — it did not uppercase. `uppercaseStage: true` is right only because the built-in stages are
`RES`/`DEV`/`INT`/`PROD`. If you defined lowercase or custom-case stages in v2 (`staging`, `gamma`, `Prod`),
**drop `uppercaseStage`** (the stage is used as-is) or set `stackName` to your literal v2 name — otherwise
you will deploy a differently-cased name and recreate resources. If your v2 stack set an explicit
`stackName` (no stage prefix at all), just reuse that literal string.

For a **new** v3 project (no existing stacks to preserve) drop the options for the cleaner `myapp-dev` /
`myapp-prod`, or set `stackName` to whatever you like — you have full control. `stageStackName` reads the
stage from `CDK_STAGE`, which `cdk-cicd exec` sets per stage.

**Verify before you switch the pipeline over.** Synthesize a stage and diff it against what is deployed:

```bash
CDK_STAGE=dev npx cdk-cicd synth --stage dev
npx cdk diff --app cdk.out/dev/<region>
```

Read the diff carefully: you want **only modifications** — no resources being *destroyed* or *created*,
and no `(requires replacement)`. If the stack name does not match, `cdk diff` has no deployed stack to
compare against and shows **everything as newly-created** — that is the tell that you would recreate, not
update. Fix the name until the diff shows in-place changes only.

If names genuinely cannot be matched (you renamed stacks, or want a different scheme), the fallback for
stateful resources is: set `RemovalPolicy.RETAIN` on them, **delete the v2 stacks** (RETAIN leaves the
resources behind, un-owned), then adopt those resources into the v3 stack with `cdk import`. Note the v2
stacks must be deleted first — `cdk import` adopts *unmanaged* resources, so it conflicts if the v2 stack
still owns them. Prefer name-matching: it is a single in-place update and needs no import.

#### Codemod

`cdk-cicd migrate` scaffolds a `cicd.config.ts` from a v2 `PipelineBlueprint.builder()…synth(app)` entry:

```bash
npx cdk-cicd migrate --entry src/main.ts --application myapp   # add --dry-run to preview
```

It extracts your stages (and flags the repository, `workbench`, and any phases/hooks for you to set by
hand) and then prints the remaining manual steps — including pointing `cdk.json` at `cdk-cicd exec` and
choosing your stack names per **Preserving already-deployed resources** above. It deliberately does not
rewrite your entry file's stack construction, so review the generated config and the printed TODOs.

### [0.1.5] - [0.2.0] Migration - VPC management and compliance bucket name

This upgrade introduces a new property to define the vpc configuration and name of the compliance bucket for each stage.

#### Breaking changes:
* **Property Renaming:** The property name of the VPC configuration has been changed from `vpc` to `managedVPC`. Make sure to update your code accordingly to avoid errors.
* **Property Type Changed:** The property  type of vpcFromLookup has been changed to string. If you were using this property, you will need to provide the vpcID or ssm parameter value directly to the property instead of defining an object with a vpcId property.

#### Here's how to update your code:
```TypeScript
vpcFromLookup: 'vpc-1234567890' // or 'resolve:ssm:/path/to/parameter'
```

* **Property Removed:** The vpcType property has been removed from the IVpcConfig object. If you were using this property, you will need to update your code to use the new managedVPC property, if you want the CDK CI/CD Wrapper to manage the VPC for you, vpcFromLookup property, if you want the CDK CI/CD Wrapper to use your existing VPC, or leave it empty if you don't want that the CDK CI/CD Wrapper to use VPC for its own resources.

* **VPC configuration:** The VPC configuration can now be defined for each deployment stage separately. 

#### Here's how to update your code:
```TypeScript
const app = new App();

PipelineBlueprint.builder()
  .defineStages([
    'RES',
    { stage: 'DEV', vpc: { vpcFromLookUp: 'vpc-088aaa9cdf4563515' } },
    { stage: 'INT', vpc: { managedVPC: {  
      cidrBlock: '172.31.0.0/20',
      subnetCidrMask: 24,
      maxAzs: 2, 
    } } },
  ],
  )
  .workbench({
    provide(context) {
      new MyStack(context.scope, 'cdk-ts-example-workbench', { value: 'workbench' });
    },
  })
  .addStack({
    provide(context) {
      new MyStack(context.scope, 'cdk-ts-example');
    },
  })
  .synth(app);
```

* **Compliance Bucket Name:** The compliance bucket name can be defined for each deployment stage separately. The default value is still the same as before. If you want to use the default value, you don't need to make any changes.



### [0.0.12] - [0.1.0] Migration - Updates for Multiple Languages and Hooks

This upgrade brings exciting new features like support for Python, Java, Go, and C# in your CDK CI/CD projects! Additionally, there are some changes to how hooks are defined.

#### Breaking changes:

* **Property Renaming:** The type property on the IVpcConfig object has been renamed to vpcType. Make sure to update your code accordingly to avoid errors.

* **Hook Specification Update:** Previously, the provide function in IStackProvider returned a DeploymentHookConfig object. Now, it returns void instead. To add hooks, use the new Hook.addPreHook(Step) and Hook.addPostHook(Step) functions.

#### Here's how to update your code:

* **Fix IVpcConfig property:**

Find all instances of IVpcConfig.type and rename them to IVpcConfig.vpcType.

* **Update Hook Definition:**

If you were using the provide function to return a DeploymentHookConfig object for hooks, remove that functionality.
Instead, use the new Hook.addPreHook(Step) and Hook.addPostHook(Step) functions to define pre- and post-deployment hooks as needed.

```TypeScript
PipelineBlueprint.builder()
  .workbench({
    // ... your workbench definition
  })
  .definePhase(PipelinePhases.POST_DEPLOY, [
    new ShellCommandPhaseCommand('ls -l'), // Example command execution
  ])
  .addStack({
    provide(context) {
        // ... your main stack definition 

        return {
          pre: [yourPreHook],
          post: [yourPostHook],
        }
    },
  })
  .synth(app);
```

to

```TypeScript
PipelineBlueprint.builder()
  .workbench({
    // ... your workbench definition
  })
  .definePhase(PipelinePhases.POST_DEPLOY, [
    new ShellCommandPhaseCommand('ls -l'), // Example command execution
  ])
  .addStack({
    provide(context) {
        // ... your main stack definition 

        Hook.addPreHook(yourPreHook);
        Hook.addPostHook(yourPostHook);
    },
  })
  .synth(app);
```

## [0.0.0] - [0.0.6] Migration

### Changes:

**Stack Renaming**: The stack name LogRetentionRoleStack has been renamed to PostDeployExecutorStack.
**Default Inclusion**: By default, PostDeployExecutorStack is no longer automatically included in all deployment stages.

### Actions Required:

**Stack Removal**: Remove any existing LogRetentionRoleStack deployments from your AWS accounts.
**Manual Inclusion**: Explicitly include the PostDeployExecutorStack in the stages where its functionality is required.
Example Usage (Post-Deployment Actions):

```TypeScript
PipelineBlueprint.builder()
  .workbench({
    // ... your workbench definition
  })
  .definePhase(PipelinePhases.POST_DEPLOY, [
    new ShellCommandPhaseCommand('ls -l'), // Example command execution
  ])
  .addStack({
    provide(context) {
        // ... your main stack definition 

        new PostDeployExecutorStack(context.scope, 'post-deploy-execution', {
            resAccount: context.blueprintProps.deploymentDefinition.RES.env.account,
            stageName: context.stage,
            name: context.blueprintProps.applicationName,
        });
    },
  })
  .synth(app);
```