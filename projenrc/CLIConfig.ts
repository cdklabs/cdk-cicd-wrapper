// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { yarn } from 'cdklabs-projen-project-types';
import { PipelineConfig } from './PipelineConfig';
import { RootConfig } from './RootConfig';

export class CLIConfig extends yarn.TypeScriptWorkspace {
  constructor(root: RootConfig, wrapper: PipelineConfig) {
    super({
      parent: root,
      name: '@cdklabs/cdk-cicd-wrapper-cli',
      description:
        'This repository contains the infrastructure as code to wrap your AWS CDK project with CI/CD around it.',
      keywords: ['cli', 'aws-cdk', 'awscdk', 'aws', 'ci-cd-boot', 'ci-cd', 'vanilla-pipeline'],
      projenrcTs: true,
      // TypeScript 6: the newest line with the classic compiler API (see CLIConfig).
      typescriptVersion: '~6.0.3',
      // yargs 18 / tslog 5 are ESM-only and load through require(esm), unflagged from Node 20.19 / 22.12.
      minNodeVersion: '20.19.0',
      npmTrustedPublishing: true,
      releaseEnvironment: 'release',
      bin: {
        'cdk-cicd': './bin/cdk-cicd',
      },
      deps: [
        // yargs 18 is ESM-only. The CommonJS CLI loads it through Node's require(esm) (Node >=20.19 /
        // >=22.12) and builds an instance from the factory (src/index.ts) instead of the removed v17
        // singleton namespace. yargs 18 ships no typings; @types/yargs 17 still describes its API.
        'yargs@^18.2.0',
        '@types/yargs@^17.0.35',
        'globby@11.1.0', // globby version 12+ only support ESM
        'fs-extra',
        '@types/fs-extra',
        'csv',
        '@aws-sdk/client-s3',
        '@aws-sdk/credential-providers',
        // Deployment-plan/drift traversal consumes cloud assemblies as an external protocol. Validate
        // every on-disk manifest against the installed schema instead of partially interpreting JSON.
        // Match the schema range consumed by the repository's CDK CLI. Older manifests remain
        // backwards-compatible, while assemblies emitted at schema 42-48 are no longer rejected by
        // our pre-deploy parser even though the installed `cdk deploy` supports them.
        '@aws-cdk/cloud-assembly-schema@^55.2.0',
        // tslog 5 is ESM-only; loaded through require(esm) like yargs.
        'tslog@^5.4.0',
        // Repo 2 `version` ranges (`^0.1.0`) resolve against an ECR repository's semver tags with npm's
        // own matching rules.
        'semver@^7.8.5',
        '@types/semver@^7.7.1',
        // Autopilot `cdk-cicd exec` resolves the register preload and reuses the config loader from the
        // constructs package. Kept a workspace dependency, NOT folded into the jsii package (D5).
        //
        // Referenced as the workspace project (via customizeReference) rather than a bare
        // '@cdklabs/cdk-cicd-wrapper' string: a bare string renders as the `^0.0.0` workspace
        // placeholder that the release `gather-versions` step never rewrites for a runtime dep, so the
        // PUBLISHED tarball shipped `^0.0.0` and external installs resolved the empty 0.0.0 stub of the
        // wrapper (crashing every command with `Cannot find module 'projen'`). A real workspace
        // reference records the dep in `repoRuntimeDeps`, so `gather-versions` rewrites it to the
        // released range (`future-minor` => `^1.x`) at publish time.
        wrapper.customizeReference({ versionType: 'future-minor' }),
        // A TypeScript `cicd.config.ts` is the primary authoring path, and both `CicdConfig.load`
        // (in-process `require('ts-node/register')`) and `exec`/`deploy-ci` (spawned `-r
        // ts-node/register`) depend on it. Previously it resolved only because the workspace root
        // hoisted it, which a global `npm i -g` install does not reproduce. Pinned to the v10 line
        // rather than floated, for the reason yargs is pinned above.
        // Resolves finding code-review-cli-ts-node-not-declared.
        'ts-node@^10.9.2',
        // `cdk-cicd migrate` parses a Blueprint entry file with the TypeScript compiler API at RUNTIME, so
        // typescript must be a runtime dep, not just a devDep (a global CLI install would not otherwise
        // resolve it). ts-node peer-depends on it too.
        // The TypeScript 6 line: jsii 6 / jsii-rosetta 6 compile with it, and ts-node plus
        // typescript-eslint need the classic compiler API that TypeScript 7 no longer ships.
        'typescript@~6.0.3',
      ],
      // Enabled for Autopilot: `cdk-cicd exec`'s pure logic (stage->env resolution, the non-clobbering
      // CDK_CONTEXT_JSON merge) is unit-tested here; the spawn itself is proven by the harness.
      jest: true,
    });

    this.addPackageIgnore('*.ts');
    this.addDevDeps(...root.eslintDeps);
    // tslog 5 and yargs 18 are ESM-only. Node loads them from the CommonJS CLI through require(esm), but
    // Jest evaluates ES modules with node:vm module APIs that are still behind this flag.
    this.testTask.env('NODE_OPTIONS', '--experimental-vm-modules');

    const cliExec = this.addTask('cli-exec');
    cliExec.spawn(this.tasks.tryFind('compile')!);
    cliExec.exec('./packages/@cdklabs/cdk-cicd-wrapper-cli/bin/cdk-cicd', { receiveArgs: true, cwd: '../../..' });
  }
}
