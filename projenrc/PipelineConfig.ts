// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as pj from 'projen';
import { yarn } from 'cdklabs-projen-project-types';
import { Eslint } from 'projen/lib/javascript';
import { RootConfig } from './RootConfig';

export class PipelineConfig extends yarn.TypeScriptWorkspace {
  constructor(root: RootConfig) {
    super({
      parent: root,
      name: '@cdklabs/cdk-cicd-wrapper',
      authorName: root.authorName,
      description:
        'This repository contains the infrastructure as code to wrap your AWS CDK project with CI/CD around it.',
      keywords: ['cli', 'aws-cdk', 'awscdk', 'aws', 'ci-cd-boot', 'ci-cd', 'vanilla-pipeline'],
      // Autopilot's public API is still evolving post-1.0; keep the jsii surface experimental so non-TS
      // consumers get the maturity signal and jsii-diff/compat does not treat an evolving API as
      // breaking a 'stable' contract.
      stability: 'experimental',
      // TypeScript 6: the newest line with the classic compiler API (see CLIConfig).
      typescriptVersion: '~6.0.3',
      releaseEnvironment: 'release',
      releasableCommits: pj.ReleasableCommits.ofType(['feat', 'fix', 'chore'], '.'),
      devDeps: [
        'eslint@^8',
        `cdk-pipelines-github`,
        // integ-runner left the alpha prerelease line; the integ-tests-alpha module did not.
        '@aws-cdk/integ-runner@^2.205.8',
        'jsii-docgen@^10.12.7',
        `@aws-cdk/integ-tests-alpha@^${root.integVersion}-alpha.0`,
        '@typescript-eslint/eslint-plugin@^8',
        '@typescript-eslint/parser@^8',
        '@typescript-eslint/typescript-estree@^8',
      ],
      peerDeps: [
        `cdk-nag@^${root.cdkNagVersion}`,
        `aws-cdk-lib@^${root.cdkVersion}`,
        `constructs@^${root.constructsVersion}`,
        'cdk-pipelines-github',
      ],
      bundledDeps: [
        '@cloudcomponents/cdk-pull-request-approval-rule',
        '@cloudcomponents/cdk-pull-request-check',
        'yaml',
      ],
      deps: [
        // SynthesizerType.APP_STAGING is a runtime option, so ship the alpha module whose version
        // exactly matches aws-cdk-lib. Alpha CDK modules must not float independently of the core.
        `@aws-cdk/app-staging-synthesizer-alpha@${root.cdkVersion}-alpha.0`,
        '@cloudcomponents/cdk-pull-request-approval-rule',
        '@cloudcomponents/cdk-pull-request-check',
        'yaml',
      ],
      jestOptions: {
        jestConfig: {
          // Force a SINGLE aws-cdk-lib copy in tests. This package bundles deps, which nests its own
          // aws-cdk-lib, while cdk-nag resolves the root copy -- so cdk-nag's `instanceof` rule checks
          // silently miss every construct and AwsSolutionsChecks is inert (finding
          // qa-duplicate-aws-cdk-lib-makes-cdk-nag-inert). Mapping every aws-cdk-lib request to the nested
          // copy the src already uses unifies them, so the nag-compliance test can assert the checker is
          // actually LIVE (a control finding) rather than vacuously green.
          moduleNameMapper: {
            '^aws-cdk-lib$': '<rootDir>/node_modules/aws-cdk-lib',
            '^aws-cdk-lib/(.*)$': '<rootDir>/node_modules/aws-cdk-lib/$1',
          },
        },
      },
      disableTsconfig: true,
      // Required here, not just on the mixin: only the project-level flag clears `npmTokenSecret`,
      // and `publishToNpm` rejects a token alongside trusted publishing.
      npmTrustedPublishing: true,
    });

    // projen >=0.104 configures typescript-eslint's project service, which reads the nearest
    // tsconfig.json. jsii owns this package's tsconfig.json and it covers src/ only, so lint against
    // tsconfig.dev.json (src + test) explicitly instead.
    const eslintrc = this.tryFindObjectFile('.eslintrc.json')!;
    eslintrc.addDeletionOverride('parserOptions.projectService');
    eslintrc.addOverride('parserOptions.project', './tsconfig.dev.json');

    Eslint.of(this)!.addRules({
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: ['**/test/**', '**/build-tools/**'],
          optionalDependencies: false,
          peerDependencies: true,
        },
      ],
    });

    const packageBasename = 'cdk-cicd-wrapper';
    this.with(
      new yarn.WorkspaceJsiiBuild({
        // The CLI takes a TypeScript workspace reference on this package (so the release
        // `gather-versions` step rewrites its `^0.0.0` placeholder to a real range). A referenced
        // project must be `composite`, so `tsc --build` in the CLI can build it as a project
        // reference; this sets jsii's `projectReferences`, which emits `composite: true`.
        composite: true,
        // jsii 6 (TypeScript 6 based) also selects jsii-rosetta ~6.0 for the Rosetta task.
        jsiiVersion: '~6.0.0',
        // jsii-docgen regenerates API.md on every build from the jsii assembly, so the reference never
        // drifts from the public surface. It resolves `cdk-nag`/`cdk-pipelines-github` from the copies the
        // package's own `post-compile` places in its local `node_modules` (see below).
        docgen: true,
        publishToPypi: {
          distName: `cdklabs.${packageBasename}`,
          module: `cdklabs.${changeDelimiter(packageBasename, '_')}`,
          // Only npm defaults to OIDC; without this PyPI falls back to TWINE_* secrets.
          trustedPublishing: true,
        },
        publishToMaven: {
          javaPackage: `io.github.cdklabs.${changeDelimiter(packageBasename, '.')}`,
          mavenGroupId: `io.github.cdklabs`,
          mavenArtifactId: packageBasename,
          mavenServerId: 'central-ossrh',
        },
        publishToNuget: {
          dotNetNamespace: `${upperCaseName('cdklabs')}.${upperCaseName(packageBasename)}`,
          packageId: `${upperCaseName('cdklabs')}.${upperCaseName(packageBasename)}`,
          // As above: without this NuGet falls back to NUGET_API_KEY.
          trustedPublishing: true,
        },
      }),
    );

    root.addGitIgnore(this.workspaceDirectory + '/tsconfig.json');

    this.addDevDeps(...root.eslintDeps);

    this.addTask('integ', {
      description: 'Run integration snapshot tests',
      exec: 'yarn integ-runner --language typescript',
      receiveArgs: true,
    });

    this.addTask('integ:update', {
      description: 'Run and update integration snapshot tests',
      exec: 'yarn integ-runner --language typescript --update-on-failed',
      receiveArgs: true,
    });

    root.addTask('integ', {
      exec: 'yarn workspace @cdklabs/cdk-cicd-wrapper run integ',
      receiveArgs: true,
    });

    const postCompile = this.tasks.tryFind('post-compile')!;
    // jsii-docgen (the docgen step `WorkspaceJsiiBuild` injects first in post-compile) reads the `.jsii`
    // assembly of every dependency from this package's own node_modules; yarn hoists `cdk-nag`,
    // `cdk-pipelines-github` and the app-staging alpha to the monorepo root, so copy them local FIRST --
    // prepended so it runs before the docgen step, otherwise docgen fails with `Unable to locate assembly
    // for dependency`. The same script copies the bundled `yaml`. It is a Node script because projen's
    // portable task shell has no `for`/`if` compound commands.
    postCompile.prependExec('node build-tools/copy-local-deps.js');
  }
}

function upperCaseName(str: string) {
  let words = str.split('-');
  words = words.map((w) => w[0].toUpperCase() + w.substring(1));
  return words.join('');
}

function changeDelimiter(str: string, delim: string) {
  return str.split('-').join(delim);
}
