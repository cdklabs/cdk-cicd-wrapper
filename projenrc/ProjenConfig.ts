// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { yarn } from 'cdklabs-projen-project-types';
import { RootConfig } from './RootConfig';

export class ProjenConfig extends yarn.TypeScriptWorkspace {
  constructor(root: RootConfig) {
    super({
      parent: root,
      name: '@cdklabs/cdk-cicd-wrapper-projen',
      description:
        'DEPRECATED: projen support for cdk-cicd-wrapper. Replaced in v3 by a cicd.config.ts + the ' +
        'cdk-cicd CLI; kept publishing until the v3.0 major. See MIGRATION.md.',
      projenrcTs: true,
      npmTrustedPublishing: true,
      releaseEnvironment: 'release',
      // deps: ['projen'],
      jest: true,
    });

    this.addDevDeps(...root.eslintDeps);
  }
}
