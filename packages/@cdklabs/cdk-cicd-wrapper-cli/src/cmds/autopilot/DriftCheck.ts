// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The drift rule: after synth, read each stack's target environment and deployment identities out of
// the cloud-assembly manifest and compare them to the stage's intended account/region/roles.
//
//   unknown account + configured target account    -> ERROR, abort (would use ambient credentials)
//   unknown region                                 -> OK when every concrete dimension matches
//   region mismatch                                -> ERROR, abort
//   account mismatch                               -> ERROR, abort the stage
//   deployment-role mismatch                       -> ERROR, abort the stage
//   CloudFormation execution-role mismatch         -> ERROR, abort the stage
//
// It lives here, in the CLI as a post-synth manifest reader, because the resolved account/region only
// and role identities exist in the synthesized assembly (`environment`, `assumeRoleArn`, and
// `cloudFormationExecutionRoleArn`).
// This is what makes the hardcoded-env fixture (a foreign account baked into bin/) safe: the mismatch
// is caught at synth time and the deploy never runs.

import { existsSync } from 'fs';
import * as path from 'path';
import { Manifest } from '@aws-cdk/cloud-assembly-schema';

// These values are the installed @aws-cdk/cloud-assembly-schema ArtifactType members. Keep the
// traversal schema-driven: cdk.Stage emits NESTED_CLOUD_ASSEMBLY with properties.directoryName.
const CLOUDFORMATION_STACK_ARTIFACT = 'aws:cloudformation:stack';
const NESTED_CLOUD_ASSEMBLY_ARTIFACT = 'cdk:cloud-assembly';

/** The intended target for a synth. `account` omitted means "whatever the creds resolve" (no account check). */
/**
 * The one alpha-generated APP_STAGING support stack allowed to retain the standard bootstrap identities.
 *
 * Application stacks still must use the configured deployment identities. This contract is structural:
 * the artifact id, physical stack name, and both role ARNs must all match exactly.
 */
export interface AppStagingSupportStack {
  readonly id: string;
  readonly stackName: string;
  readonly deployRoleArn: string;
  readonly cloudFormationExecutionRoleArn: string;
}

export interface DriftTarget {
  readonly account?: string;
  readonly region: string;
  /** Effective CDK bootstrap qualifier after config/context/default resolution. */
  readonly qualifier: string;
  /** Exact deployment role expected from the stage/env override, when one was explicitly selected. */
  readonly deployRoleArn?: string;
  /** Exact CloudFormation execution role expected from the stage/env override, when explicitly selected. */
  readonly cloudFormationExecutionRoleArn?: string;
  /**
   * APP_STAGING's Bootstrapless support stack deploys with the base bootstrap identities rather than
   * the application stack's configured identities. It is accepted only when this exact contract matches.
   */
  readonly appStagingSupportStack?: AppStagingSupportStack;
}

export type DriftKind =
  'ok' | 'agnostic' | 'region-mismatch' | 'account-mismatch' | 'deploy-role-mismatch' | 'cfn-execution-role-mismatch';

/** Per-stack drift outcome. */
export interface StackDrift {
  readonly stack: string;
  readonly account: string;
  readonly region: string;
  readonly deployRoleArn?: string;
  readonly cloudFormationExecutionRoleArn?: string;
  readonly kind: DriftKind;
  readonly message: string;
}

/** The overall result: per-stack outcomes plus the collected warnings and (abort-worthy) errors. */
export interface DriftResult {
  readonly stacks: StackDrift[];
  readonly warnings: string[];
  readonly errors: string[];
  /** True when every synthesized target and deployment identity matches the intended contract. */
  readonly ok: boolean;
}

const AGNOSTIC = new Set(['unknown-account', 'unknown-region']);

/** Reads and parses the manifest for the assembly rooted at `dir`. Injectable for focused tests. */
export type ManifestReader = (dir: string) => any;

export const readManifestFromDisk: ManifestReader = (dir) => {
  const manifestPath = path.join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`cloud assembly: no manifest.json at ${manifestPath}`);
  }
  try {
    return Manifest.loadAssemblyManifest(manifestPath);
  } catch (error) {
    throw new Error(`cloud assembly: ${manifestPath} is invalid (${(error as Error).message})`);
  }
};

/** One recursively discovered CloudFormation stack artifact. */
export interface AssemblyStack {
  /** Artifact id qualified by its nested-assembly path, for diagnostics. */
  readonly id: string;
  /** Physical CloudFormation stack name, falling back to the artifact id for old manifests. */
  readonly stackName: string;
  readonly environment?: string;
  /** CDK CLI deployment role (`assumeRoleArn`) synthesized into this stack artifact. */
  readonly assumeRoleArn?: string;
  /** CloudFormation execution role synthesized into this stack artifact. */
  readonly cloudFormationExecutionRoleArn?: string;
}

function isRecord(value: unknown): value is { [key: string]: any } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Discover every stack in a cloud assembly in dependency order, including stacks synthesized under
 * cdk.Stage. The installed schema represents those stages as `cdk:cloud-assembly` artifacts whose
 * nested directory is `properties.directoryName`.
 */
export function stacksFromAssembly(
  outDir: string,
  readManifest: ManifestReader = readManifestFromDisk,
): AssemblyStack[] {
  const root = path.resolve(outDir);
  const active = new Set<string>();
  const visited = new Set<string>();

  const collect = (dir: string, parentIds: readonly string[]): AssemblyStack[] => {
    const resolvedDir = path.resolve(dir);
    if (active.has(resolvedDir)) {
      throw new Error(`cloud assembly: nested assembly cycle includes ${dir}`);
    }
    if (visited.has(resolvedDir)) {
      throw new Error(`cloud assembly: nested assembly ${dir} is referenced more than once`);
    }
    if (resolvedDir !== root && !resolvedDir.startsWith(`${root}${path.sep}`)) {
      throw new Error(`cloud assembly: nested assembly ${dir} escapes the root assembly ${outDir}`);
    }

    active.add(resolvedDir);
    const manifest = readManifest(dir);
    const artifacts = isRecord(manifest?.artifacts) ? manifest.artifacts : {};
    const ordered: string[] = [];
    const states = new Map<string, 'visiting' | 'visited'>();

    const visit = (id: string): void => {
      const state = states.get(id);
      if (state === 'visited') return;
      if (state === 'visiting') {
        throw new Error(`cloud assembly: artifact dependency cycle in ${dir} includes '${id}'`);
      }

      const artifact = artifacts[id];
      if (!isRecord(artifact) || typeof artifact.type !== 'string') {
        throw new Error(`cloud assembly: artifact '${id}' in ${dir} is malformed`);
      }
      if (artifact.dependencies !== undefined && !Array.isArray(artifact.dependencies)) {
        throw new Error(`cloud assembly: artifact '${id}' in ${dir} has malformed dependencies`);
      }

      states.set(id, 'visiting');
      for (const dependency of (artifact.dependencies ?? []) as unknown[]) {
        if (typeof dependency !== 'string' || !(dependency in artifacts)) {
          throw new Error(`cloud assembly: artifact '${id}' in ${dir} depends on missing artifact '${dependency}'`);
        }
        visit(dependency);
      }
      states.set(id, 'visited');
      ordered.push(id);
    };

    Object.keys(artifacts).forEach(visit);

    const stacks = ordered.flatMap((id): AssemblyStack[] => {
      const artifact = artifacts[id];
      if (artifact.type === CLOUDFORMATION_STACK_ARTIFACT) {
        const qualifiedId = [...parentIds, id].join('/');
        const configuredStackName = artifact.properties?.stackName;
        const assumeRoleArn = artifact.properties?.assumeRoleArn;
        const cloudFormationExecutionRoleArn = artifact.properties?.cloudFormationExecutionRoleArn;
        return [
          {
            id: qualifiedId,
            stackName:
              typeof configuredStackName === 'string' && configuredStackName.length > 0 ? configuredStackName : id,
            environment: typeof artifact.environment === 'string' ? artifact.environment : undefined,
            assumeRoleArn: typeof assumeRoleArn === 'string' ? assumeRoleArn : undefined,
            cloudFormationExecutionRoleArn:
              typeof cloudFormationExecutionRoleArn === 'string' ? cloudFormationExecutionRoleArn : undefined,
          },
        ];
      }
      if (artifact.type === NESTED_CLOUD_ASSEMBLY_ARTIFACT) {
        const directoryName = artifact.properties?.directoryName;
        if (typeof directoryName !== 'string' || directoryName.trim().length === 0) {
          throw new Error(
            `cloud assembly: nested artifact '${[...parentIds, id].join('/')}' in ${dir} ` +
              'has no properties.directoryName',
          );
        }
        return collect(path.join(dir, directoryName), [...parentIds, id]);
      }
      return [];
    });

    active.delete(resolvedDir);
    visited.add(resolvedDir);
    return stacks;
  };

  const stacks = collect(outDir, []);
  if (stacks.length === 0) {
    throw new Error(`cloud assembly at ${outDir} contains no deployable CloudFormation stacks`);
  }
  return stacks;
}

/** Parse `aws://<account>/<region>` into its parts (either may be `unknown-*`). */
export function parseEnvironment(environment: string): { account: string; region: string } {
  const withoutScheme = environment.replace(/^aws:\/\//, '');
  const slash = withoutScheme.indexOf('/');
  return {
    account: slash >= 0 ? withoutScheme.slice(0, slash) : withoutScheme,
    region: slash >= 0 ? withoutScheme.slice(slash + 1) : '',
  };
}

function roleAccount(roleArn: string): string | undefined {
  // DefaultStackSynthesizer leaves the partition as the literal CloudFormation pseudo-parameter
  // `${AWS::Partition}` even when account/region are concrete.
  return /^arn:(?:\$\{AWS::Partition\}|[^:]+):iam::([^:]+):role\/.+$/.exec(roleArn)?.[1];
}

function specializeRoleEnvironment(roleArn: string, target: DriftTarget): string {
  return roleArn
    .split('${Qualifier}')
    .join(target.qualifier)
    .split('${AWS::AccountId}')
    .join(target.account ?? '${AWS::AccountId}')
    .split('${AWS::Region}')
    .join(target.region);
}

/**
 * Compare a manifest role with the configured template after specializing the target environment.
 */
function roleMatchesExpected(actual: string, expected: string, target: DriftTarget): boolean {
  const normalizedActual = specializeRoleEnvironment(actual, target);
  const normalizedExpected = specializeRoleEnvironment(expected, target);
  return normalizedActual === normalizedExpected;
}

function matchesAppStagingSupportStack(artifact: AssemblyStack, target: DriftTarget): boolean {
  const support = target.appStagingSupportStack;
  return (
    support !== undefined &&
    artifact.id === support.id &&
    artifact.stackName === support.stackName &&
    artifact.assumeRoleArn !== undefined &&
    artifact.cloudFormationExecutionRoleArn !== undefined &&
    roleMatchesExpected(artifact.assumeRoleArn, support.deployRoleArn, target) &&
    roleMatchesExpected(artifact.cloudFormationExecutionRoleArn, support.cloudFormationExecutionRoleArn, target)
  );
}

function roleDrift(
  artifact: AssemblyStack,
  target: DriftTarget,
):
  | {
      readonly kind: 'deploy-role-mismatch' | 'cfn-execution-role-mismatch';
      readonly message: string;
    }
  | undefined {
  if (matchesAppStagingSupportStack(artifact, target)) return undefined;

  const validate = (
    label: string,
    actual: string | undefined,
    expected: string | undefined,
    kind: 'deploy-role-mismatch' | 'cfn-execution-role-mismatch',
  ): { readonly kind: typeof kind; readonly message: string } | undefined => {
    if (expected !== undefined && (actual === undefined || !roleMatchesExpected(actual, expected, target))) {
      return {
        kind,
        message:
          actual === undefined
            ? `${artifact.id} is missing the configured ${label} '${expected}' -- refusing to reinterpret the synthesized deployment identity`
            : `${artifact.id} synthesized ${label} '${actual}', expected '${expected}' -- refusing to deploy`,
      };
    }

    if (actual !== undefined && target.account !== undefined) {
      const account = roleAccount(specializeRoleEnvironment(actual, target));
      if (account === undefined || !/^[0-9]{12}$/.test(account)) {
        return {
          kind,
          message: `${artifact.id} has an unverifiable ${label} '${actual}' -- refusing to deploy to account ${target.account}`,
        };
      }
      if (account !== target.account) {
        return {
          kind,
          message: `${artifact.id} has ${label} in account ${account}, stage target is ${target.account} -- refusing to deploy`,
        };
      }
    }
    return undefined;
  };

  return (
    validate('deployment role', artifact.assumeRoleArn, target.deployRoleArn, 'deploy-role-mismatch') ??
    validate(
      'CloudFormation execution role',
      artifact.cloudFormationExecutionRoleArn,
      target.cloudFormationExecutionRoleArn,
      'cfn-execution-role-mismatch',
    )
  );
}

function analyzeStacks(stackArtifacts: readonly AssemblyStack[], target: DriftTarget): DriftResult {
  const stacks: StackDrift[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const artifact of stackArtifacts) {
    const environment = artifact.environment ?? 'aws://unknown-account/unknown-region';
    const { account, region } = parseEnvironment(environment);

    let kind: DriftKind;
    let message: string;
    const accountAgnostic = AGNOSTIC.has(account);
    const regionAgnostic = AGNOSTIC.has(region);
    if (target.account !== undefined && (accountAgnostic || account !== target.account)) {
      kind = 'account-mismatch';
      message = accountAgnostic
        ? `${artifact.id} does not bind the configured target account ${target.account} -- refusing to deploy with ambient credentials`
        : `${artifact.id} targets a different account than stage target -- refusing to deploy`;
      errors.push(message);
    } else if (!regionAgnostic && region !== target.region) {
      kind = 'region-mismatch';
      message = `${artifact.id} targets region ${region}, stage target is ${target.region} -- refusing to deploy`;
      errors.push(message);
    } else {
      const roleMismatch = roleDrift(artifact, target);
      if (roleMismatch !== undefined) {
        kind = roleMismatch.kind;
        message = roleMismatch.message;
        errors.push(message);
      } else if (accountAgnostic || regionAgnostic) {
        kind = 'agnostic';
        message = `${artifact.id} is partially environment-agnostic (${environment}); unresolved dimensions resolve at deploy`;
      } else {
        kind = 'ok';
        message = `${artifact.id} matches the stage target and deployment identities`;
      }
    }
    stacks.push({
      stack: artifact.id,
      account,
      region,
      deployRoleArn: artifact.assumeRoleArn,
      cloudFormationExecutionRoleArn: artifact.cloudFormationExecutionRoleArn,
      kind,
      message,
    });
  }

  return { stacks, warnings, errors, ok: errors.length === 0 };
}

/** Pure drift analysis of one parsed manifest. Use checkAssembly for recursive on-disk assemblies. */
export function analyzeManifest(manifest: any, target: DriftTarget): DriftResult {
  const artifacts = isRecord(manifest?.artifacts) ? manifest.artifacts : {};
  const stacks = Object.entries<any>(artifacts)
    .filter(([, artifact]) => artifact?.type === CLOUDFORMATION_STACK_ARTIFACT)
    .map(([id, artifact]) => ({
      id,
      stackName:
        typeof artifact.properties?.stackName === 'string' && artifact.properties.stackName.length > 0
          ? artifact.properties.stackName
          : id,
      environment: typeof artifact.environment === 'string' ? artifact.environment : undefined,
      assumeRoleArn:
        typeof artifact.properties?.assumeRoleArn === 'string' ? artifact.properties.assumeRoleArn : undefined,
      cloudFormationExecutionRoleArn:
        typeof artifact.properties?.cloudFormationExecutionRoleArn === 'string'
          ? artifact.properties.cloudFormationExecutionRoleArn
          : undefined,
    }));
  return analyzeStacks(stacks, target);
}

/** Read `<outDir>/manifest.json` and analyze it. Throws (with a drift-check message) if the manifest
 * is missing or not valid JSON. */
export function checkAssembly(outDir: string, target: DriftTarget): DriftResult {
  const manifestPath = path.join(outDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`drift-check: no cloud assembly at ${manifestPath} -- synth first`);
  }
  try {
    return analyzeStacks(stacksFromAssembly(outDir), target);
  } catch (error) {
    const message = (error as Error).message;
    throw new Error(message.startsWith('drift-check:') ? message : `drift-check: ${message}`);
  }
}
