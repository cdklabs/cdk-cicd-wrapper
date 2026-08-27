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
      npmTrustedPublishing: true,
      releaseEnvironment: 'release',
      bin: {
        'cdk-cicd': './bin/cdk-cicd',
      },
      deps: [
        // Pinned to the v17 line: the CLI's yargs usage (namespace `ya.command(...)`) is not
        // compatible with the v18 major, which floated in on a regen and broke the whole CLI.
        // See finding code-review-cli-yargs18-incompatible.
        'yargs@^17.7.3',
        '@types/yargs@^17.0.33',
        'globby@11.1.0', // globby version 12+ only support ESM
        'fs-extra',
        '@types/fs-extra',
        'csv',
        '@aws-sdk/client-s3',
        '@aws-sdk/credential-providers',
        'tslog',
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
        'typescript@^5.9.3',
      ],
      // Enabled for Autopilot: `cdk-cicd exec`'s pure logic (stage->env resolution, the non-clobbering
      // CDK_CONTEXT_JSON merge) is unit-tested here; the spawn itself is proven by the harness.
      jest: true,
    });

    this.addPackageIgnore('*.ts');
    this.addDevDeps(...root.eslintDeps);

    const cliExec = this.addTask('cli-exec');
    cliExec.spawn(this.tasks.tryFind('compile')!);
    cliExec.exec('./packages/@cdklabs/cdk-cicd-wrapper-cli/bin/cdk-cicd', { receiveArgs: true, cwd: '../../..' });
  }
}
