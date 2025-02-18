import { yarn } from 'cdklabs-projen-project-types';
import { RootConfig } from './RootConfig';

export class ProjenConfig extends yarn.TypeScriptWorkspace {
  constructor(root: RootConfig) {
    super({
      parent: root,
      name: '@cdklabs/cdk-cicd-wrapper-projen',
      description: 'This repository contains the projen support for the project',
      projenrcTs: true,
      deps: ['projen'],
      jest: true,
    });

    this.addDevDeps(...root.eslintDeps);
  }
}
