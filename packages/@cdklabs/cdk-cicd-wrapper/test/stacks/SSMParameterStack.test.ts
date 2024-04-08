// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { SSMParameterStack } from '../../src/stacks';
import { TestAppConfig } from '../TestConfig';

describe('ssm-parameter-stack-test', () => {
  const app = new cdk.App();
  const template = Template.fromStack(
    new SSMParameterStack(app, 'SSMParameterStack', {
      env: TestAppConfig.deploymentDefinition.RES.env,
      applicationQualifier: TestAppConfig.applicationQualifier,
      parameter: {
        AccountRes: TestAppConfig.deploymentDefinition.RES.env.account,
        AccountDev: TestAppConfig.deploymentDefinition.DEV.env.account,
        AccountInt: TestAppConfig.deploymentDefinition.INT.env.account,
      },
    }),
  );

  test('Check if Parameters exist', () => {
    template.resourceCountIs('AWS::SSM::Parameter', 3);
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: `/${TestAppConfig.applicationQualifier}/AccountRes`,
      Value: TestAppConfig.deploymentDefinition.RES.env.account,
      Type: 'String',
    });

    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: `/${TestAppConfig.applicationQualifier}/AccountDev`,
      Value: TestAppConfig.deploymentDefinition.DEV.env.account,
      Type: 'String',
    });

    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: `/${TestAppConfig.applicationQualifier}/AccountInt`,
      Value: TestAppConfig.deploymentDefinition.INT.env.account,
      Type: 'String',
    });
  });
});
