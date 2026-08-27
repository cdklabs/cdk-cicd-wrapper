# Pipeline role-name control, cross-account externalId, and CDK_PIPELINES compliance bucket

Status: design draft for review. Tracks issue #251.

## Goals

1. **Deterministic pipeline IAM role names** the consumer can set from config, so external
   cross-account trust policies / SCPs / permission boundaries that reference fixed names keep
   working after a Blueprint (0.x) → Autopilot (1.x) migration.
2. **Cross-account `externalId` control** for the forced deploy-role assumption, both a
   pipeline-level default and a per-stage override, sourced from a literal or a Secrets Manager
   reference.
3. **`complianceLogBucketName` honored under `CDK_PIPELINES`**, with the per-region name-substituting
   access-logs aspect wired in — parity with the flat engine.

Non-goals: renaming the GitHub OIDC role (already covered by `githubActions.roleName`); adding an
externalId to the CDK **bootstrap**-role assumption (done by CDK internals, not a wrapper seam — see
Open questions); cross-region **asset** replication (already native to CDK Pipelines).

## Background: why a consumer cannot do this themselves

Under `EngineType.CDK_PIPELINES` (and `GITHUB_ACTIONS`), `runtime/pipeline-assembler.ts` owns the
pipeline `App`. It replays the consumer's plain `bin/` once per configured stage into a throwaway
`cdk.Stage`, so the consumer's code never sees the pipeline stack and has no hook to reach the
pipeline roles. Blueprint's `PipelineRoleNameEnforcementPlugin` (a consumer-attached Aspect on the
pipeline stack) therefore has no equivalent seam in 1.x. The fix must live inside the wrapper, which
*does* own the pipeline stack.

## The three engines have different role sets

| Engine | Roles that exist | Naming seam |
|---|---|---|
| `CDK_PIPELINES` | CodePipeline role, Assets **file**-publishing role, Assets **docker** role (from `aws-cdk-lib/pipelines`) | internal Aspect on the engine's own pipeline stack |
| `CODEPIPELINE` (flat) | CodePipeline role + one CodeBuild role **per stage** (CI, self-update, `Deploy-<stage>`) | construct-time / internal Aspect on the wrapper-owned stack |
| `GITHUB_ACTIONS` | only the OIDC `GitHubActionRole` | already `githubActions.roleName` — no change |

Because the sets differ, the config is **engine-specific** rather than one shared shape (a single
`{pipeline, assetsFile, assetsDocker}` field would be meaningless for the flat engine, which has no
asset roles, and would hide the flat engine's per-stage build roles).

## Config surface (jsii-modeled structs on `ResolvedCicdConfig`)

```ts
/** CDK_PIPELINES pipeline role names. Any omitted → CDK-generated name (no change). */
export interface PipelineRoleNames {
  readonly pipeline?: string;       // the CodePipeline role
  readonly assetsFile?: string;     // CDK Pipelines file-publishing (assets) role
  readonly assetsDocker?: string;   // CDK Pipelines docker-publishing (assets) role
}

/** Flat CODEPIPELINE engine role names. */
export interface CodePipelineRoleNames {
  readonly pipeline?: string;        // the CodePipeline role
  readonly buildRolePrefix?: string; // per-stage CodeBuild roles → `<prefix>-<stage>`
}
```

On the config:

```ts
// ResolvedCicdConfig (and the permissive CicdConfigProps input in define.ts)
readonly pipelineRoleNames?: PipelineRoleNames;       // read only when engine === CDK_PIPELINES
readonly codePipelineRoleNames?: CodePipelineRoleNames; // read only when engine === CODEPIPELINE
readonly deployRoleExternalId?: string;               // pipeline-level externalId default
```

Per-stage externalId extends the existing `DeploymentConfig`:

```ts
export interface DeploymentConfig {
  readonly deployRole?: string;
  readonly cfnExecutionRole?: string;
  readonly externalId?: string; // NEW — overrides deployRoleExternalId for this stage
}
```

`resolveCicdConfig`/`defineCICD` pass these through unchanged (like every other resolved field). A
`string | undefined` and two flat interfaces cross the jsii boundary cleanly.

## Role-name enforcement mechanism

Match on `iam.CfnRole` under the pipeline construct **scope**, not a hard-coded leaf construct id —
the Assets file/docker role leaf ids are `aws-cdk-lib/pipelines` internals and are verified
empirically against the installed version during implementation (a synth + tree inspection), not
guessed. The 1.x node path is `<app>-pipeline/Cd/Pipeline/...` (stack `<app>-pipeline`, engine
construct id `Cd`, `pipelines.CodePipeline` id `Pipeline`), so Blueprint's `'CdkPipeline'` substring
match does not apply.

- **CDK_PIPELINES**: `CdkPipelinesEngine` already calls `this.pipeline.buildPipeline()` eagerly (so
  the generated roles exist before nag runs). Apply an internal Aspect scoped to the engine construct
  that sets `RoleName` on the CodePipeline role and the two asset roles, distinguishing them by their
  path segment under the pipeline scope. Aspect runs at `AspectPriority.MUTATING` (before the readonly
  `AwsSolutionsChecks` added in `pipeline-assembler.ts`).
- **CODEPIPELINE (flat)**: the engine constructs its own `codepipeline.Pipeline` and per-stage
  `PipelineProject`s, so it can set names directly at construct time (pipeline role) / via an Aspect on
  its scope (per-stage build roles → `<buildRolePrefix>-<stage>`). Preferred: construct-time where the
  role object is in hand, Aspect only where CDK generates the role lazily.
- Omitting a field ⇒ no `RoleName` override ⇒ CDK default. No regression for existing users.

## externalId mechanism (honest end-to-end path)

The wrapper's `sts:AssumeRole` policy grants only say a project *may* assume a role; the ExternalId is
supplied by the **caller at assume time** and enforced by the **target role's trust policy**. The one
place the wrapper actually assumes the forced deploy role is the synthesizer:
`inject.ts:resolveSynthesizer` builds `new DefaultStackSynthesizer({ deployRoleArn, cloudFormationExecutionRole })`
from `DEPLOY_ROLE_FLAG`/`CFN_EXEC_ROLE_FLAG` env vars the CLI sets (`ExecCommand.forcedRoleEnv`), and
`DeployCommand` passes `--role-arn`.

`DefaultStackSynthesizer` natively supports `deployRoleExternalId` (verified in the installed
aws-cdk-lib). So the wiring is:

```
DeploymentConfig.externalId ?? ResolvedCicdConfig.deployRoleExternalId
  → CLI ExecCommand.forcedRoleEnv sets a new EXTERNAL_ID_FLAG env var
  → resolveSynthesizer reads it → DefaultStackSynthesizer({ deployRoleArn, deployRoleExternalId, ... })
```

`--role-arn` on `cdk deploy` (DeployCommand) is the flat engine's per-stage deploy action path; the
synthesizer path above is what bakes the externalId into the change-set assumption, so the env-var
seam is the single source of truth both consume.

**Value source**: a literal, or a `resolve:secretsmanager:<arn>` reference resolved at synth time —
the same `resolve:` convention `VpcConfig.vpcId` already uses. See Open questions on the secrecy
trade-off.

## Compliance bucket under CDK_PIPELINES

- In `CdkPipelinesEngine`, when `config.complianceLogBucketName` is set, construct a `SupportResources`
  and force-read `support.complianceLogBucket` (mirroring `CodePipelineEngine`'s
  `void support.complianceLogBucket`), so the bucket is provisioned in the pipeline stack.
- Attach `AccessLogsForBucketAspect({ complianceLogBucketName, mainRegion })` to the app at
  `AspectPriority.MUTATING`, so its L1 `loggingConfiguration` override lands **before** the readonly
  `AwsSolutionsChecks` runs — otherwise `AwsSolutions-S1` false-fails (nag sees the bucket before the
  logging config is applied). No `NagSuppression` is added for S1; ordering is the fix.
- Reconcile the `AccessLogsForBucketAspect` header comment (it currently says the compliance bucket
  and its config field don't exist yet — they do, and this wires it).

## Testing strategy (TDD)

1. **Role names — CDK_PIPELINES**: synthesize a pipeline with `pipelineRoleNames` set; assert the three
   `AWS::IAM::Role` `RoleName` properties equal the configured values. A control synth without the field
   asserts no `RoleName` override (CDK default preserved).
2. **Role names — flat**: synthesize with `codePipelineRoleNames`; assert the CodePipeline role name and
   `<prefix>-<stage>` build-role names; control synth for the default.
3. **externalId**: unit-test the CLI env seam (`forcedRoleEnv` emits the flag from per-stage and from the
   pipeline-level default, per-stage wins) and `resolveSynthesizer` (the synthesizer artifact carries
   `assumeRoleExternalId`); test the `resolve:secretsmanager:` parse path.
4. **Compliance bucket**: synthesize a CDK_PIPELINES pipeline with `complianceLogBucketName`; assert the
   `ComplianceLogBucket` is present, that a secondary-region stack's bucket logs to the region-substituted
   name, and that nag passes S1 (no suppression).
5. Local synth proof (step 4 of SDLC): a CDK_PIPELINES pipeline showing (a) the three deterministic role
   names and (b) the compliance bucket with the per-region name in a secondary-region stack.

## jsii / build constraints

- New public structs (`PipelineRoleNames`, `CodePipelineRoleNames`) and the new optional fields must
  appear in the `.jsii` assembly — verified with a real jsii compile, not a tsc pass.
- `API.md` is auto-generated (`docgen:true`); regenerated by the build, never hand-edited.
- PR title uses `feat(...)` (pull-request-lint allows feat/fix/chore/refactor).

## Open questions

- **O1 — flat-engine build-role granularity.** `buildRolePrefix` yields `<prefix>-<stage>` for the
  per-stage CodeBuild roles. Per-stage explicit names are possible but add surface; the prefix is the
  proposed shape. (Maintainer decision welcome.)
- **O2 — externalId secrecy.** A `resolve:secretsmanager:` value is resolved at **synth** time, so the
  ExternalId is baked into the synthesized synthesizer config / template. That matches the existing
  `resolve:` convention but does not keep the value secret at rest in the artifact. If secrecy at rest
  is required, externalId would need a deploy-time fetch rather than a synth-time resolve. Default:
  synth-time `resolve:`, matching convention.
- **O3 — bootstrap-role externalId.** Only the *forced* deploy-role assumption is covered. The default
  bootstrap-role assumption is performed by CDK internals; the wrapper only grants permission, so it
  cannot inject an externalId there. Out of scope.
