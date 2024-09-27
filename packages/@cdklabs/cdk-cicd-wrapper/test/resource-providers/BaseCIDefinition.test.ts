import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { BaseCIDefinition } from '../../src/resource-providers/CIDefinitionProvider';

describe('BaseCIDefinition', () => {
  let baseCIDefinition: BaseCIDefinition;
  let mockBuildSpec: codebuild.BuildSpec;
  let mockBuildOptions: pipelines.CodeBuildOptions;

  beforeEach(() => {
    mockBuildSpec = codebuild.BuildSpec.fromObject({});
    mockBuildOptions = {};
    baseCIDefinition = new BaseCIDefinition(mockBuildSpec, mockBuildOptions);
  });

  it('should provide the build spec', () => {
    expect(baseCIDefinition.provideBuildSpec()).toBe(mockBuildSpec);
  });

  it('should provide the code build defaults', () => {
    expect(baseCIDefinition.provideCodeBuildDefaults()).toBe(mockBuildOptions);
  });

  it('should append partial build spec', () => {
    const partialBuildSpec = codebuild.BuildSpec.fromObject({ version: '0.2' });
    baseCIDefinition.append(partialBuildSpec);
    expect(baseCIDefinition.provideBuildSpec()).not.toBe(mockBuildSpec);
  });

  it('should add additional policy statements', () => {
    const policyStatement = new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: ['*'],
    });
    baseCIDefinition.additionalPolicyStatements([policyStatement]);
    expect(baseCIDefinition.provideCodeBuildDefaults().rolePolicy).toContainEqual(policyStatement);
  });

  it('should append code build options', () => {
    const additionalOptions: pipelines.CodeBuildOptions = {
      buildEnvironment: { computeType: codebuild.ComputeType.LARGE },
    };
    baseCIDefinition.appendCodeBuildOptions(additionalOptions);
    expect(baseCIDefinition.provideCodeBuildDefaults().buildEnvironment?.computeType).toBe(codebuild.ComputeType.LARGE);
  });
});
