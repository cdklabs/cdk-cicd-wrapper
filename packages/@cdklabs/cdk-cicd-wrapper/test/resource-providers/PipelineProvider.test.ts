import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import {
  AppStage,
  BasicRepositoryProvider,
  CDKPipeline,
  CIDefinitionProvider,
  CodeBuildFactoryProvider,
  GlobalResources,
  ParameterProvider,
  PhaseCommandProvider,
  Stage,
  StageProvider,
  VPCProvider,
} from '../../src';
import { PipelineProvider } from '../../src/resource-providers/PipelineProvider';
import { TestContext } from '../TestConfig';

describe('PipelineProvider', () => {
  let pipelineProvider: PipelineProvider;

  beforeEach(() => {
    pipelineProvider = new PipelineProvider();
  });

  it('should provide the CodePipeline V1 by default', () => {
    const context = TestContext(
      {},
      {
        [GlobalResources.CODEBUILD_FACTORY]: new CodeBuildFactoryProvider(),
        [GlobalResources.PARAMETER_STORE]: new ParameterProvider(),
        [GlobalResources.VPC]: new VPCProvider(),
        [GlobalResources.PHASE]: new PhaseCommandProvider(),
        [GlobalResources.CI_DEFINITION]: new CIDefinitionProvider(),
        [GlobalResources.REPOSITORY]: new BasicRepositoryProvider(),
        [GlobalResources.STAGE_PROVIDER]: new StageProvider(),
      },
    );
    context.initStage(Stage.RES);

    const result = pipelineProvider.provide(context) as CDKPipeline;

    expect(result).toBeDefined();

    context.initStage(Stage.DEV);
    const stage = context.get(GlobalResources.STAGE_PROVIDER) as AppStage;

    new cdk.Stack(stage, 'TestStack', {});

    result.addStageWithV2Options(stage, {
      beforeEntry: {
        conditions: [],
      },
    });

    result.buildPipeline();
    expect(result.pipeline).toBeDefined();

    const template = Template.fromStack(cdk.Stack.of(result.pipeline));

    template.resourceCountIs('AWS::CodePipeline::Pipeline', 1);
    template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
      PipelineType: 'V1',
    });
  });

  it('should provide the CodePipeline V2', () => {
    const context = TestContext(
      {
        pipelineOptions: {
          pipelineType: codepipeline.PipelineType.V2,
        },
      },
      {
        [GlobalResources.CODEBUILD_FACTORY]: new CodeBuildFactoryProvider(),
        [GlobalResources.PARAMETER_STORE]: new ParameterProvider(),
        [GlobalResources.VPC]: new VPCProvider(),
        [GlobalResources.PHASE]: new PhaseCommandProvider(),
        [GlobalResources.CI_DEFINITION]: new CIDefinitionProvider(),
        [GlobalResources.REPOSITORY]: new BasicRepositoryProvider(),
        [GlobalResources.STAGE_PROVIDER]: new StageProvider(),
      },
    );
    context.initStage(Stage.RES);

    const result = pipelineProvider.provide(context) as CDKPipeline;

    expect(result).toBeDefined();

    context.initStage(Stage.DEV);
    const stage = context.get(GlobalResources.STAGE_PROVIDER) as AppStage;

    new cdk.Stack(stage, 'TestStack', {});

    result.addStageWithV2Options(stage, {
      beforeEntry: {
        conditions: [
          {
            result: codepipeline.Result.SKIP,
            rules: [
              new codepipeline.Rule({
                name: 'SkipRule',
                provider: 'VariableCheck',
                configuration: {
                  Variable: '#{SourceVariables.RepositoryName}',
                  Value: 'MyDemoRepo',
                  Operator: 'EQ',
                },
              }),
            ],
          },
        ],
      },
    });

    result.buildPipeline();
    expect(result.pipeline).toBeDefined();

    const template = Template.fromStack(cdk.Stack.of(result.pipeline));

    template.resourceCountIs('AWS::CodePipeline::Pipeline', 1);
    template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
      PipelineType: 'V2',
      Stages: [
        {},
        {},
        {},
        {
          Name: 'DEV',
          BeforeEntry: {
            Conditions: [
              {
                Result: 'SKIP',
                Rules: [
                  {
                    Configuration: {
                      Variable: '#{SourceVariables.RepositoryName}',
                      Value: 'MyDemoRepo',
                      Operator: 'EQ',
                    },
                    Name: 'SkipRule',
                    RuleTypeId: {
                      Category: 'Rule',
                      Owner: 'AWS',
                      Provider: 'VariableCheck',
                    },
                  },
                ],
              },
            ],
          },
        },
      ],
    });
  });
});
