import { JsonPatch, awscdk, javascript } from 'projen';

const cdkQualifier = 'sample';

const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.1.0',
  defaultReleaseBranch: 'main',
  name: 'ts-cdk-project-with-private-repository',
  projenrcTs: true,
  packageManager: javascript.NodePackageManager.NPM,
  release: false,

  // Set the cdklabs url if/whenever you need it
  // scopedPackagesOptions: [{
  //   scope: 'cdklabs',
  //   registryUrl: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  // }]

  deps: ['@cdklabs/cdk-cicd-wrapper', '@cdklabs/cdk-cicd-wrapper-cli'], /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // devDeps: [],             /* Build dependencies for this module. */
  // packageName: undefined,  /* The "name" in package.json. */
  context: {
    '@aws-cdk/core:bootstrapQualifier': cdkQualifier,
  },

});

project.cdkConfig.json.patch(JsonPatch.add('/toolkitStackName', `CdkToolkit-${cdkQualifier}`));
project.package.addField('config', {
  cdkQualifier: cdkQualifier,
  repositoryName: 'ts-cdk-project-with-private-repository',
  repositoryType: 'CODECOMMIT',
  cicdVpcType: 'NO_VPC',
});

project.addTask('update-cdk-cicd-wrapper').exec('npm update @cdklabs/cdk-cicd-wrapper @cdklabs/cdk-cicd-wrapper-cli --force');

project.addTask('validate').exec('cdk-cicd validate', { receiveArgs: true });

const license = project.addTask('license', {
  description: 'Notice file checking and generation',
});
license.exec('cdk-cicd license', { receiveArgs: true });


const checkDependencies = project.addTask('check-dependencies', {
  description: 'Notice file checking and generation',
});
checkDependencies.exec('cdk-cicd check-dependencies', {
  receiveArgs: true,
});

const securityScan = project.addTask('security-scan', {
  description: 'Notice file checking and generation',
});
securityScan.exec(
  'cdk-cicd  --bandit --semgrep --shellcheck --ci',
  { receiveArgs: true, condition: '[ -n "$CI" ]' },
);
securityScan.exec(
  'cdk-cicd  --bandit --semgrep --shellcheck',
  { receiveArgs: true, condition: '[ ! -n "$CI" ]' },
);

const audit = project.addTask('audit');
audit.spawn(checkDependencies);
audit.spawn(securityScan);
audit.spawn(license);

const lint = project.addTask('lint');
lint.spawn(project.tasks.tryFind('eslint')!);

project.addTask('cdkls').exec('cdk ls');

project.synth();