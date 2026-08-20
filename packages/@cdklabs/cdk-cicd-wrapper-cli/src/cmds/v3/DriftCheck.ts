// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The drift rule: after synth, read each stack's target environment out of the cloud-assembly
// manifest and compare it to the stage's intended account/region.
//
//   env-agnostic (unknown-account/unknown-region)  -> OK (resolved at deploy from ambient creds)
//   region mismatch                                -> WARN, continue
//   account mismatch                               -> ERROR, abort the stage
//
// It lives here, in the CLI as a post-synth manifest reader, because the resolved account/region only
// exist in the synthesized assembly (`manifest.json` artifact `environment: "aws://<acct>/<region>"`).
// This is what makes the hardcoded-env fixture (a foreign account baked into bin/) safe: the mismatch
// is caught at synth time and the deploy never runs.

import { existsSync, readFileSync } from 'fs';
import * as path from 'path';

/** The intended target for a synth. `account` omitted means "whatever the creds resolve" (no account check). */
export interface DriftTarget {
  readonly account?: string;
  readonly region: string;
}

export type DriftKind = 'ok' | 'agnostic' | 'region-mismatch' | 'account-mismatch';

/** Per-stack drift outcome. */
export interface StackDrift {
  readonly stack: string;
  readonly account: string;
  readonly region: string;
  readonly kind: DriftKind;
  readonly message: string;
}

/** The overall result: per-stack outcomes plus the collected warnings and (abort-worthy) errors. */
export interface DriftResult {
  readonly stacks: StackDrift[];
  readonly warnings: string[];
  readonly errors: string[];
  /** True when nothing account-mismatched -- i.e. the assembly is safe to deploy. */
  readonly ok: boolean;
}

const AGNOSTIC = new Set(['unknown-account', 'unknown-region']);

/** Parse `aws://<account>/<region>` into its parts (either may be `unknown-*`). */
function parseEnvironment(environment: string): { account: string; region: string } {
  const withoutScheme = environment.replace(/^aws:\/\//, '');
  const slash = withoutScheme.indexOf('/');
  return {
    account: slash >= 0 ? withoutScheme.slice(0, slash) : withoutScheme,
    region: slash >= 0 ? withoutScheme.slice(slash + 1) : '',
  };
}

/** Pure drift analysis of a parsed cloud-assembly manifest against a target. */
export function analyzeManifest(manifest: any, target: DriftTarget): DriftResult {
  const stacks: StackDrift[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  const artifacts = manifest?.artifacts ?? {};
  for (const [name, artifact] of Object.entries<any>(artifacts)) {
    if (artifact?.type !== 'aws:cloudformation:stack' || typeof artifact.environment !== 'string') {
      continue;
    }
    const { account, region } = parseEnvironment(artifact.environment);

    let kind: DriftKind;
    let message: string;
    if (AGNOSTIC.has(account) || AGNOSTIC.has(region)) {
      kind = 'agnostic';
      message = `${name} is environment-agnostic (${artifact.environment}); resolved at deploy`;
    } else if (target.account !== undefined && account !== target.account) {
      kind = 'account-mismatch';
      message = `${name} targets a different account than stage target -- refusing to deploy`;
      errors.push(message);
    } else if (region !== target.region) {
      kind = 'region-mismatch';
      message = `${name} targets region ${region}, stage target is ${target.region} -- continuing`;
      warnings.push(message);
    } else {
      kind = 'ok';
      message = `${name} matches the stage target`;
    }
    stacks.push({ stack: name, account, region, kind, message });
  }

  return { stacks, warnings, errors, ok: errors.length === 0 };
}

/** Read `<outDir>/manifest.json` and analyze it. Throws (with a drift-check message) if the manifest
 * is missing or not valid JSON. */
export function checkAssembly(outDir: string, target: DriftTarget): DriftResult {
  const manifestPath = path.join(outDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`drift-check: no cloud assembly at ${manifestPath} -- synth first`);
  }
  let manifest: any;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch (error) {
    throw new Error(`drift-check: ${manifestPath} is not valid JSON (${(error as Error).message})`);
  }
  return analyzeManifest(manifest, target);
}
