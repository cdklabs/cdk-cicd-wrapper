// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Stack-name control for v3 apps. v3 synthesizes the SAME `bin/` once per stage (deploy-time), so a bare
// `new MyStack(app, 'myapp')` deploys under the identical CloudFormation name in every stage -- fine when
// stages differ by account/region, but it gives no stage in the name and, more importantly, does NOT
// match what Blueprint deployed. Blueprint nested stacks in an `AppStage extends cdk.Stage`, which prefixes the stack
// name with the stage id VERBATIM (`<stageId>-myapp`). With Blueprint's built-in stages -- `RES`/`DEV`/`INT`/
// `PROD` -- that reads `DEV-myapp`; a Blueprint user who defined lowercase or custom-case stages (`staging`,
// `gamma`) got `staging-myapp`, unchanged. CloudFormation keys resources to a stack by NAME, so a
// migration that deploys `myapp` where Blueprint deployed `DEV-myapp` is a NEW stack -- it recreates everything
// and orphans the old one. Logical IDs are unchanged between the two shapes (measured), so matching the
// NAME is sufficient for a clean in-place update.
//
// `stageStackName` gives that control from `bin/`: a stage-qualified name for new projects, and the
// options to reproduce Blueprint's name. `stageFirst` puts the stage first (as Blueprint did); `uppercaseStage` matches
// Blueprint's DEFAULT uppercase stage ids -- if your Blueprint stages were lowercase/custom-case, pass the stage
// verbatim instead (default casing) so the name matches EXACTLY. It is a TS-authoring helper (a free
// function, invisible to jsii, like `defineCICD`); importing it in `bin/` is the opt-in, not the default.

/** Options for {@link stageStackName}. */
export interface StageStackNameOptions {
  /**
   * The stage to fold into the name. Defaults to `process.env.CDK_STAGE`, which `cdk-cicd exec` sets to
   * the stage being deployed. When neither is available (e.g. a bare `cdk synth`), the base is returned
   * unchanged rather than a `myapp-undefined`.
   */
  readonly stage?: string;
  /** Put the stage BEFORE the base (`<stage>-<base>`) instead of after. Blueprint put the stage first. */
  readonly stageFirst?: boolean;
  /**
   * Uppercase the stage segment. Convenience for matching Blueprint's DEFAULT stage ids (`RES`/`DEV`/`INT`/
   * `PROD`), which were uppercase. If your Blueprint stages were lowercase or custom-case, leave this off and
   * pass the stage verbatim so the name matches exactly -- cdk.Stage prefixed with the id as-is, it did
   * not uppercase.
   */
  readonly uppercaseStage?: boolean;
}

/**
 * A stage-qualified CloudFormation stack name.
 *
 * New v3 projects: `stageStackName('myapp')` -> `myapp-dev` / `myapp-prod`.
 *
 * Migrating from Blueprint without recreating resources: Blueprint prefixed the stack name with the stage id verbatim,
 * so with its default (uppercase) stages `stageStackName('myapp', { stageFirst: true, uppercaseStage:
 * true })` -> `DEV-myapp`, exactly what Blueprint deployed, and CloudFormation UPDATES it in place. If your Blueprint
 * stages were lowercase/custom-case, drop `uppercaseStage` (or pass an explicit `stage`) so the casing
 * matches. Always confirm with `cdk-cicd synth --stage <s>` + `cdk diff` before switching the pipeline.
 *
 * TS-authoring only (a free function; jsii does not model it) -- import it in `bin/` as the opt-in.
 */
export function stageStackName(base: string, options: StageStackNameOptions = {}): string {
  const stage = options.stage ?? process.env.CDK_STAGE;
  if (stage === undefined || stage.length === 0) {
    return base;
  }
  // Always `-`: CloudFormation stack names allow only [A-Za-z][A-Za-z0-9-]*, so any other separator would
  // produce an invalid name. Default casing is lowercase; `uppercaseStage` opts into upper for Blueprint-default
  // stage ids.
  const seg = options.uppercaseStage ? stage.toUpperCase() : stage.toLowerCase();
  return options.stageFirst ? `${seg}-${base}` : `${base}-${seg}`;
}
