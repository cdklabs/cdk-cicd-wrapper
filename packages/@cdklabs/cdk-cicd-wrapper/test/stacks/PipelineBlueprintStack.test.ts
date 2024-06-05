// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { Stage, PipelinePhases, GlobalResources } from '../../src/common';
import { BasicRepositoryProvider, sh } from '../../src/resource-providers';
import { PipelineBlueprint } from '../../src/stacks/PipelineBlueprint';
import {
  TestAppConfig,
  TestRepositoryConfigCodeCommit,
  TestRepositoryConfigGithub,
  TestStackProvider,
} from '../TestConfig';

// Clear env as env variables can populate unintended configurations during the tests
process.env = {};

describe('pipeline-blueprint-stack-test-codecommit', () => {
  const app = new cdk.App();

  const stack = PipelineBlueprint.builder()
    .applicationName(TestAppConfig.applicationName)
    .applicationQualifier(TestAppConfig.applicationQualifier)
    .codeBuildEnvSettings(TestAppConfig.codeBuildEnvSettings)
    .defineStages([
      { stage: Stage.RES, ...TestAppConfig.deploymentDefinition.RES.env },
      { stage: Stage.DEV, ...TestAppConfig.deploymentDefinition.DEV.env },
      { stage: Stage.INT, ...TestAppConfig.deploymentDefinition.INT.env },
    ])
    .definePhase(PipelinePhases.BUILD, [sh('true')])
    .definePhase(PipelinePhases.TESTING, [sh('true')])
    .definePhase(PipelinePhases.PRE_BUILD, [])
    .repositoryProvider(new BasicRepositoryProvider(TestRepositoryConfigCodeCommit))
    .addStack(TestStackProvider)
    .synth(app);

  const template = Template.fromStack(stack);

  cdk.Aspects.of(app).add(new AwsSolutionsChecks());

  test('Check if Events rule exists', () => {
    template.resourceCountIs('AWS::Events::Rule', 1);
    template.hasResourceProperties('AWS::Events::Rule', {
      EventPattern: {
        source: ['aws.codecommit'],
      },
      State: 'ENABLED',
    });
  });

  test('Check if Pipeline ENV variables exist', () => {
    const codeBuildProjects = template.findResources('AWS::CodeBuild::Project');

    Object.values(codeBuildProjects).forEach((project) => {
      Match.stringLikeRegexp(`.*CDK_QUALIFIER:${TestAppConfig.applicationQualifier}.*`).test(
        project.Properties.Source.BuildSpec,
      );
      Match.stringLikeRegexp(`.*AWS_REGION:${TestAppConfig.deploymentDefinition.RES.env.region}.*`).test(
        project.Properties.Source.BuildSpec,
      );
      Match.stringLikeRegexp('.*(?!PROXY_SECRET_ARN).*').test(project.Properties.Source.BuildSpec);
    });
  });

  test('Check if CodePipeline Pipeline exists', () => {
    template.resourceCountIs('AWS::CodePipeline::Pipeline', 1);
    template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
      Stages: [
        {
          Name: 'Source',
        },
        {
          Name: 'Build',
        },
        {
          Name: 'UpdatePipeline',
        },
        {},
        {
          Name: 'DEV',
        },
        {},
      ],
    });
  });

  test('Check if CodeGuru Step does not exist', () => {
    template.resourcePropertiesCountIs(
      'AWS::CodeBuild::Project',
      {
        Artifacts: {
          Type: 'CODEPIPELINE',
        },
        Environment: {
          Image: 'public.ecr.aws/l6c8c5q3/codegurusecurity-actions-public:latest',
        },
        Name: `${TestAppConfig.applicationQualifier}CodeGuruSecurity`,
      },
      0,
    );
  });

  test('No unsuppressed Warnings', () => {
    const warnings = Annotations.fromStack(stack).findWarning('*', Match.stringLikeRegexp('AwsSolutions-.*'));
    expect(warnings).toHaveLength(0);
  });

  test('No unsuppressed Errors', () => {
    const errors = Annotations.fromStack(stack).findError('*', Match.stringLikeRegexp('AwsSolutions-.*'));
    expect(errors).toHaveLength(0);
  });
});

describe('pipeline-stack-test-codestar', () => {
  const app = new cdk.App();

  const template = Template.fromStack(
    PipelineBlueprint.builder()
      .applicationName(TestAppConfig.applicationName)
      .applicationQualifier(TestAppConfig.applicationQualifier)
      .codeGuruScanThreshold(TestAppConfig.codeGuruScanThreshold!)
      .defineStages([
        { stage: Stage.RES, ...TestAppConfig.deploymentDefinition.RES.env },
        { stage: Stage.DEV, ...TestAppConfig.deploymentDefinition.DEV.env },
        { stage: Stage.INT, ...TestAppConfig.deploymentDefinition.INT.env },
      ])
      .definePhase(PipelinePhases.BUILD, [sh('true')])
      .definePhase(PipelinePhases.TESTING, [sh('true')])
      .definePhase(PipelinePhases.PRE_BUILD, [])
      .addStack(TestStackProvider)
      .repositoryProvider(new BasicRepositoryProvider(TestRepositoryConfigGithub))
      .synth(app),
  );

  test('Check if Pipeline ENV variables exist', () => {
    const codeBuildProjects = template.findResources('AWS::CodeBuild::Project');
    Object.values(codeBuildProjects).forEach((project) => {
      Match.stringLikeRegexp(`.*CDK_QUALIFIER:${TestAppConfig.applicationQualifier}.*`).test(
        project.Properties.Source.BuildSpec,
      );
      Match.stringLikeRegexp(`.*AWS_REGION:${TestAppConfig.deploymentDefinition.RES.env.region}.*`).test(
        project.Properties.Source.BuildSpec,
      );
      Match.stringLikeRegexp('.*(?!PROXY_SECRET_ARN).*').test(project.Properties.Source.BuildSpec);
      Match.stringLikeRegexp(`.*CODESTAR_CONNECTION_ARN:${TestRepositoryConfigGithub.codeStarConnectionArn}.*`).test(
        project.Properties.Source.BuildSpec,
      );
    });
  });

  test('Check if CodePipeline Pipeline exists', () => {
    template.resourceCountIs('AWS::CodePipeline::Pipeline', 1);
    template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
      Stages: [
        {
          Name: 'Source',
        },
        {
          Name: 'Build',
        },
        {
          Name: 'UpdatePipeline',
        },
        {},
        {},
        {},
      ],
    });
  });

  test('Check if CodeGuru Step exists', () => {
    template.resourcePropertiesCountIs(
      'AWS::CodeBuild::Project',
      {
        Artifacts: {
          Type: 'CODEPIPELINE',
        },
        Name: `${TestAppConfig.applicationQualifier}CodeGuruSecurity`,
      },
      1,
    );
  });
});

describe('pipeline-stack-test-extending-STAGE', () => {
  const app = new cdk.App();

  const template = Template.fromStack(
    PipelineBlueprint.builder()
      .applicationName(TestAppConfig.applicationName)
      .applicationQualifier(TestAppConfig.applicationQualifier)
      .codeGuruScanThreshold(TestAppConfig.codeGuruScanThreshold!)
      .defineStages([
        { stage: Stage.RES, ...TestAppConfig.deploymentDefinition.RES.env },
        { stage: Stage.DEV, ...TestAppConfig.deploymentDefinition.DEV.env },
        { stage: Stage.INT, ...TestAppConfig.deploymentDefinition.INT.env },
        { stage: 'PREPROD', ...TestAppConfig.deploymentDefinition.PREPROD.env },
      ])
      .addStack(
        {
          provide(context) {
            const stack = new cdk.Stack(context.scope, 'TestStack');
            new cdk.CfnOutput(stack, 'ConstructTest', { value: 'INT' });
          },
        },
        'PREPROD',
      )
      .addStack(TestStackProvider, 'DEV', 'INT')
      .definePhase(PipelinePhases.BUILD, [sh('true')])
      .definePhase(PipelinePhases.TESTING, [sh('true')])
      .definePhase(PipelinePhases.PRE_BUILD, [])
      .repositoryProvider(new BasicRepositoryProvider(TestRepositoryConfigGithub))
      .synth(app),
  );

  test('Check if CodePipeline Pipeline exists with all STAGE', () => {
    template.resourceCountIs('AWS::CodePipeline::Pipeline', 1);
    template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
      Stages: [
        {
          Name: 'Source',
        },
        {
          Name: 'Build',
        },
        {
          Name: 'UpdatePipeline',
        },
        {
          Name: 'Assets',
        },
        {
          Name: 'DEV',
        },
        {
          Name: 'INT',
        },
        {
          Name: 'PREPROD',
          Actions: [
            {
              Name: 'PromoteToPREPROD',
            },
            {},
            {},
            {},
            {},
            {},
            {
              Name: 'TestStack.Deploy',
              Configuration: {
                StackName: 'PREPROD-TestStack',
              },
            },
          ],
        },
      ],
    });
  });
});

describe('pipeline-stack-test-proxy-vpc', () => {
  const app = new cdk.App();

  const template = Template.fromStack(
    PipelineBlueprint.builder()
      .applicationName(TestAppConfig.applicationName)
      .applicationQualifier(TestAppConfig.applicationQualifier)
      .codeGuruScanThreshold(TestAppConfig.codeGuruScanThreshold!)
      .defineStages([
        { stage: Stage.RES, ...TestAppConfig.deploymentDefinition.RES.env },
        { stage: Stage.DEV, ...TestAppConfig.deploymentDefinition.DEV.env },
        { stage: Stage.INT, ...TestAppConfig.deploymentDefinition.INT.env },
      ])
      .proxy({
        noProxy: [`${TestAppConfig.deploymentDefinition.RES.env.region}.amazonaws.com`],
        proxySecretArn: `arn:aws:secretsmanager:${TestAppConfig.deploymentDefinition.RES.env.region}:${TestAppConfig.deploymentDefinition.RES.env.account}:secret:/proxy/credentials/default-aaaaaa`,
        proxyTestUrl: 'proxy-test.com',
      })
      .definePhase(PipelinePhases.BUILD, [sh('true')])
      .definePhase(PipelinePhases.TESTING, [sh('true')])
      .definePhase(PipelinePhases.PRE_BUILD, [])
      .addStack(TestStackProvider)
      .repositoryProvider(new BasicRepositoryProvider(TestRepositoryConfigGithub))
      .synth(app),
  );

  test('Check if CodePipeline Pipeline exists with all STAGE', () => {
    template.resourceCountIs('AWS::CodePipeline::Pipeline', 1);
    template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
      Stages: [
        {
          Name: 'Source',
        },
        {
          Name: 'Build',
        },
        {
          Name: 'UpdatePipeline',
        },
        {
          Name: 'Assets',
        },
        {
          Name: 'DEV',
        },
        {
          Name: 'INT',
        },
      ],
    });
    const codeBuildProjects = template.findResources('AWS::CodeBuild::Project');
    const synthProject =
      codeBuildProjects[
        Object.keys(codeBuildProjects).find((id) => id.startsWith('CdkPipelineBuildSynthCdkBuildProject'))!!
      ];

    Match.objectLike({
      Artifacts: {
        Type: 'CODEPIPELINE',
      },
      Description: 'Pipeline step PipelineStackExtendingStage/Pipeline/Build/Synth',
      Environment: {
        ComputeType: 'BUILD_GENERAL1_SMALL',
        Image: TestAppConfig.codeBuildEnvSettings.buildImage,
        PrivilegedMode: TestAppConfig.codeBuildEnvSettings.privileged,
        Type: 'LINUX_CONTAINER',
      },
      Source: {
        BuildSpec:
          '{\n  "version": "0.2",\n  "env": {\n    "shell": "bash",\n    "variables": {\n      "NO_PROXY": "eu-west-1.amazonaws.com",\n      "AWS_STS_REGIONAL_ENDPOINTS": "regional"\n    },\n    "secrets-manager": {\n      "PROXY_USERNAME": "arn:aws:secretsmanager:eu-west-1:123456789012:secret:/proxy/credentials/default-aaaaaa:username",\n      "PROXY_PASSWORD": "arn:aws:secretsmanager:eu-west-1:123456789012:secret:/proxy/credentials/default-aaaaaa:password",\n      "HTTP_PROXY_PORT": "arn:aws:secretsmanager:eu-west-1:123456789012:secret:/proxy/credentials/default-aaaaaa:http_proxy_port",\n      "HTTPS_PROXY_PORT": "arn:aws:secretsmanager:eu-west-1:123456789012:secret:/proxy/credentials/default-aaaaaa:https_proxy_port",\n      "PROXY_DOMAIN": "arn:aws:secretsmanager:eu-west-1:123456789012:secret:/proxy/credentials/default-aaaaaa:proxy_domain"\n    }\n  },\n  "phases": {\n    "install": {\n      "commands": [\n        "export HTTP_PROXY=\\"http://$PROXY_USERNAME:$PROXY_PASSWORD@$PROXY_DOMAIN:$HTTP_PROXY_PORT\\"",\n        "export HTTPS_PROXY=\\"https://$PROXY_USERNAME:$PROXY_PASSWORD@$PROXY_DOMAIN:$HTTPS_PROXY_PORT\\"",\n        "echo \\"--- Proxy Test ---\\"",\n        "curl -Is --connect-timeout 5 proxy-test.com | grep \\"HTTP/\\"",\n       "pip3 install awscli --upgrade --quiet"\n      ]\n    },\n    "build": {\n      "commands": [\n        "./scripts/check-audit.sh",\n        ". ./scripts/warming.sh",\n        "./scripts/build.sh",\n        "./scripts/test.sh",\n        "./scripts/cdk-synth.sh"\n      ]\n    }\n  },\n  "artifacts": {\n    "base-directory": "./cdk.out",\n    "files": [\n      "**/*"\n    ]\n  }\n}',
      },
    }).test(synthProject.Properties as any);

    const fileAssetProjects =
      codeBuildProjects[Object.keys(codeBuildProjects).find((id) => id.startsWith('CdkPipelineAssetsFileAsset'))!!];

    Match.stringLikeRegexp('.*This way Docker containers will use the proxy.*').test(
      fileAssetProjects.Properties.Source.BuildSpec,
    );
  });
});

describe('pipeline-stack-disable-compliance-log-bucket', () => {
  const app = new cdk.App();

  const template = Template.fromStack(
    PipelineBlueprint.builder()
      .applicationName(TestAppConfig.applicationName)
      .applicationQualifier(TestAppConfig.applicationQualifier)
      .defineStages([
        { stage: Stage.RES, ...TestAppConfig.deploymentDefinition.RES.env },
        { stage: Stage.DEV, ...TestAppConfig.deploymentDefinition.DEV.env },
        { stage: Stage.INT, ...TestAppConfig.deploymentDefinition.INT.env },
      ])
      .disable(GlobalResources.COMPLIANCE_BUCKET)
      .addStack(TestStackProvider)
      .repositoryProvider(new BasicRepositoryProvider(TestRepositoryConfigGithub))
      .synth(app),
  );

  test("Check if CodePipeline Pipeline doesn't have a compliance bucket", () => {
    template.resourceCountIs('AWS::CodePipeline::Pipeline', 1);
    template.resourcePropertiesCountIs(
      'AWS::S3::Bucket',
      {
        LoggingConfiguration: {},
      },
      0,
    );
  });
});

describe('pipeline-stack-stage-order', () => {
  const app = new cdk.App();

  process.env.ACCOUNT_DEV = '777777777777'; // The DEV should not appear as valid stage as it is not defined.
  process.env.ACCOUNT_StageC = '88888888888';

  const template = Template.fromStack(
    PipelineBlueprint.builder()
      .applicationName(TestAppConfig.applicationName)
      .applicationQualifier(TestAppConfig.applicationQualifier)
      .defineStages([
        { stage: Stage.RES, ...TestAppConfig.deploymentDefinition.RES.env },
        'StageC',
        { stage: 'StageB', ...TestAppConfig.deploymentDefinition.DEV.env },
        { stage: 'StageA', ...TestAppConfig.deploymentDefinition.INT.env },
      ])
      .addStack(TestStackProvider)
      .repositoryProvider(new BasicRepositoryProvider(TestRepositoryConfigGithub))
      .synth(app),
  );

  test("Check if CodePipeline Pipeline doesn't have a compliance bucket", () => {
    template.resourceCountIs('AWS::CodePipeline::Pipeline', 1);
    template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
      Stages: [
        {
          Name: 'Source',
        },
        {
          Name: 'Build',
        },
        {
          Name: 'UpdatePipeline',
        },
        {
          Name: 'Assets',
        },
        {
          Name: 'StageC',
        },
        {
          Name: 'StageB',
        },
        {
          Name: 'StageA',
        },
      ],
    });
  });
});
