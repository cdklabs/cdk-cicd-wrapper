// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Stack-name control for v3 apps. v3 synthesizes the SAME `bin/` once per stage (deploy-time), so a bare
// `new MyStack(app, 'myapp')` deploys under the identical CloudFormation name in every stage -- fine when
// stages differ by account/region, but it gives no stage in the name and, more importantly, does NOT
// match what v2 deployed. v2 nested stacks in an `AppStage extends cdk.Stage`, which prefixes the stack
// name with the (uppercase) stage id: `DEV-myapp`. CloudFormation keys resources to a stack by NAME, so a
// migration that deploys `myapp` where v2 deployed `DEV-myapp` is a NEW stack -- it recreates everything
// and orphans the old one. Logical IDs are unchanged between the two shapes (measured), so matching the
// NAME is sufficient for a clean in-place update.
//
// `stageStackName` gives that control from `bin/`: a stage-qualified name for new projects, and -- with
// `{ stageFirst: true, uppercaseStage: true }` -- the exact v2 name so a migration updates in place. It is
// a TS-authoring helper (a free function, invisible to jsii, like `defineCICD`); importing it in `bin/` is
// the documented opt-in, not the zero-touch default.

/** Options for {@link stageStackName}. */
export interface StageStackNameOptions {
  /**
   * The stage to fold into the name. Defaults to `process.env.CDK_STAGE`, which `cdk-cicd exec` sets to
   * the stage being deployed. When neither is available (e.g. a bare `cdk synth`), the base is returned
   * unchanged rather than a `myapp-undefined`.
   */
  readonly stage?: string;
  /** Put the stage BEFORE the base (`<stage>-<base>`) instead of after. v2 put the stage first. */
  readonly stageFirst?: boolean;
  /** Uppercase the stage segment. v2's stack names used the uppercase `Stage` enum ids (`DEV`, `PROD`). */
  readonly uppercaseStage?: boolean;
  /** Separator between base and stage. Defaults to `-`. */
  readonly separator?: string;
}

/**
 * A stage-qualified CloudFormation stack name.
 *
 * New v3 projects: `stageStackName('myapp')` -> `myapp-dev` / `myapp-prod`.
 *
 * Migrating from v2 without recreating resources: v2 deployed `<STAGE>-<base>` (stage first, uppercased),
 * so `stageStackName('myapp', { stageFirst: true, uppercaseStage: true })` -> `DEV-myapp`, exactly what v2
 * deployed. CloudFormation then UPDATES that stack in place instead of creating a new one. Verify with
 * `cdk-cicd synth --stage dev` + `cdk diff` against the deployed stack before switching the pipeline over.
 *
 * TS-authoring only (a free function; jsii does not model it) -- import it in `bin/` as the opt-in.
 */
export function stageStackName(base: string, options: StageStackNameOptions = {}): string {
  const stage = options.stage ?? process.env.CDK_STAGE;
  if (stage === undefined || stage.length === 0) {
    return base;
  }
  const sep = options.separator ?? '-';
  const seg = options.uppercaseStage ? stage.toUpperCase() : stage.toLowerCase();
  return options.stageFirst ? `${seg}${sep}${base}` : `${base}${sep}${seg}`;
}
