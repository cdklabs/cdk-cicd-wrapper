// eslint-disable-next-line  import/no-extraneous-dependencies
import { AwsCdkTypeScriptApp } from 'projen/lib/awscdk';
// eslint-disable-next-line  import/no-extraneous-dependencies
import { synthSnapshot } from 'projen/lib/util/synth';
import { CdkCICDWrapper } from '../src/projen/CdkCICDWrapper';

describe('CdkCICDWrapper', () => {
  test('cdk.json has custom context and qualifier', () => {
    // GIVEN
    const project = new AwsCdkTypeScriptApp({
      cdkVersion: '2.1.0',
      defaultReleaseBranch: 'main',
      name: 'test-app',
      context: {
        property: 'value',
      },
    });

    // WHEN
    new CdkCICDWrapper(project, {
      cdkQualifier: 'test-qualifier',
      repositoryName: 'custom-repo',
      repositoryType: 'GITHUB',
      stages: ['DEV', 'STAGING', 'PROD'],
    });

    // THEN
    const snapshot = synthSnapshot(project);

    // Verify
    expect(snapshot['cdk.json'].context['@aws-cdk/core:bootstrapQualifier']).toBe('test-qualifier');
    expect(snapshot['cdk.json'].context.property).toBe('value');
  });

  test('cdk.json has no custom context and ony has qualifier', () => {
    // GIVEN
    const project = new AwsCdkTypeScriptApp({
      cdkVersion: '2.1.0',
      defaultReleaseBranch: 'main',
      name: 'test-app',
    });

    // WHEN
    new CdkCICDWrapper(project, {
      cdkQualifier: 'test-qualifier',
      repositoryName: 'custom-repo',
      repositoryType: 'GITHUB',
      stages: ['DEV', 'STAGING', 'PROD'],
    });

    // THEN
    const snapshot = synthSnapshot(project);

    // Verify
    expect(snapshot['cdk.json'].context['@aws-cdk/core:bootstrapQualifier']).toBe('test-qualifier');
  });
});
