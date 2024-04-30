import { awscdk, javascript } from 'projen';
import { CdkCICDWrapper } from '../../projenrc/cdk-ci-cd-wrapper';

const cdkQualifier = 'sample';

const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.1.0',
  defaultReleaseBranch: 'main',
  name: 'cdk-ts-example',
  projenrcTs: true,
  packageManager: javascript.NodePackageManager.NPM,
  release: false,
});

//@ts-ignore Projen Versions can be different during the upgrade process and would resolve complains about assignability issues.
new CdkCICDWrapper(project, {
  cdkQualifier,
  repositoryName: 'cdk-ts-example',
  repositoryType: 'CODECOMMIT',
});

project.synth();