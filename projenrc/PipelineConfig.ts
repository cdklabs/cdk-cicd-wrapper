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
      // The line is pre-release (RootConfig prerelease 'alpha'); publish the jsii surface as
      // experimental so non-TS consumers get the maturity signal and jsii-diff/compat does not
      // treat evolving v3 API as breaking a 'stable' contract.
      stability: 'experimental',
      releaseEnvironment: 'release',
      releasableCommits: pj.ReleasableCommits.ofType(['feat', 'fix', 'chore'], '.'),
      devDeps: [
        'eslint@^8',
        `cdk-pipelines-github`,
        `@aws-cdk/integ-runner@^${root.integVersion}-alpha.0`,
        `@aws-cdk/integ-tests-alpha@^${root.integVersion}-alpha.0`,
        '@typescript-eslint/eslint-plugin@^7',
        '@typescript-eslint/parser@^7',
        '@typescript-eslint/typescript-estree@^7',
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
      deps: ['@cloudcomponents/cdk-pull-request-approval-rule', '@cloudcomponents/cdk-pull-request-check', 'yaml'],
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

    Eslint.of(this)!.addRules({
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: ['**/test/**', '**/build-tools/**', '**/src/projen/**'],
          optionalDependencies: false,
          peerDependencies: true,
        },
      ],
    });

    const packageBasename = 'cdk-cicd-wrapper';
    this.with(
      new yarn.WorkspaceJsiiBuild({
        // jsii-docgen cannot locate `cdk-nag`/`cdk-pipelines-github`, which yarn hoists to the
        // monorepo root. Enabling it needs those in `nohoist`; API.md stays hand-committed.
        docgen: false,
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
    // postCompile.exec("export DEP='@cloudcomponents';cp -rf ./node_modules/$DEP ./node_modules/ 2>/dev/null;");
    postCompile.exec("export DEP='yaml';cp -rf ../../../node_modules/$DEP ./node_modules/ 2>/dev/null;");
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
