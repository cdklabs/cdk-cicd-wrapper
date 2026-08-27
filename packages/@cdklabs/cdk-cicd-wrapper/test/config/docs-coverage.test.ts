// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Documentation coverage gate: every public field a user can write in `cicd.config.ts` MUST be
// mentioned in the configuration reference doc. This is the harness that stops a new config field
// shipping undocumented (the gap that let pipelineRoleNames/codePipelineRoleNames/deployRoleExternalId/
// DeploymentConfig.externalId land in code with no doc). It reads the field names straight from the
// source of truth -- the `CicdConfigProps` input (define.ts) and `DeploymentConfig` (types.ts) -- so a
// field added there without a matching doc mention fails here until documented.

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '..', '..', 'src', 'config');
const DOC = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'docs',
  'content',
  'developer_guides',
  'configuration.md',
);

/**
 * Extract the `readonly <name>` field names declared inside a named interface in a source file. Deliberately
 * simple (regex over the interface body) rather than a full TS parse: the config interfaces are plain
 * property bags, and a heavier AST dependency is not worth it for a doc gate.
 */
function interfaceFields(file: string, interfaceName: string): string[] {
  const src = fs.readFileSync(file, 'utf-8');
  const start = src.indexOf(`interface ${interfaceName} {`);
  if (start === -1) throw new Error(`interface ${interfaceName} not found in ${file}`);
  // Walk braces from the opening `{` to its matching `}` so nested `{ ... }` types do not end the body early.
  let depth = 0;
  let i = src.indexOf('{', start);
  const bodyStart = i + 1;
  for (; i < src.length; i++) {
    if (src[i] === '{') {
      depth++;
    } else if (src[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  const body = src.slice(bodyStart, i);
  const names = new Set<string>();
  for (const m of body.matchAll(/^\s*readonly\s+([A-Za-z0-9_]+)\??:/gm)) {
    names.add(m[1]);
  }
  return [...names];
}

describe('docs coverage: every public cicd.config field is documented', () => {
  const doc = fs.readFileSync(DOC, 'utf-8');

  // The user-authored config surface: the top-level input, the per-stage deployment block, and the
  // engine/networking sub-structs a user writes fields into. Fields the reference documents under a
  // shared heading rather than by their own name still satisfy the gate via a backticked mention.
  const topLevel = interfaceFields(path.join(SRC, 'define.ts'), 'CicdConfigProps');
  const deployment = interfaceFields(path.join(SRC, 'types.ts'), 'DeploymentConfig');
  const githubActions = interfaceFields(path.join(SRC, 'types.ts'), 'GitHubActionsConfig');
  const vpc = interfaceFields(path.join(SRC, 'types.ts'), 'VpcConfig');
  const managedVpc = interfaceFields(path.join(SRC, 'types.ts'), 'ManagedVpcConfig');
  const ci = interfaceFields(path.join(SRC, 'define.ts'), 'CiConfigInput');
  const proxy = interfaceFields(path.join(SRC, 'define.ts'), 'ProxyConfigInput');
  const codeArtifact = interfaceFields(path.join(SRC, 'types.ts'), 'CodeArtifactConfig');
  const npmRegistry = interfaceFields(path.join(SRC, 'types.ts'), 'NpmRegistryConfig');

  const cases: Array<[string, string[]]> = [
    ['CicdConfigProps', topLevel],
    ['DeploymentConfig', deployment],
    ['GitHubActionsConfig', githubActions],
    ['VpcConfig', vpc],
    ['ManagedVpcConfig', managedVpc],
    ['CiConfigInput', ci],
    ['ProxyConfigInput', proxy],
    ['CodeArtifactConfig', codeArtifact],
    ['NpmRegistryConfig', npmRegistry],
  ];

  for (const [iface, fields] of cases) {
    describe(iface, () => {
      for (const field of fields) {
        test(`\`${field}\` is mentioned in configuration.md`, () => {
          // A backticked field name anywhere in the doc counts as documented.
          expect(doc.includes(`\`${field}\``)).toBe(true);
        });
      }
    });
  }

  test('the config reference doc exists and is non-trivial', () => {
    expect(doc.length).toBeGreaterThan(500);
  });
});
