// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { IConstruct } from 'constructs';
import { Stage, ResourceContext, IResourceProvider } from '../common';
import { SSMParameterStack } from '../stacks/SSMParameterStack';

/**
 * Construct to supply persistent parameters for IaaC code
 */
export interface IParameterConstruct extends IConstruct {
  /**
   * Create  parameter that is accessible through the pipeline
   *
   * @param parameterName - name of the parameter
   * @param parameterValue - value of the parameter
   */
  createParameter(parameterName: string, parameterValue: string): ssm.IStringParameter;

  /**
   * Returns with a policy that allows to access the parameters
   */
  provideParameterPolicyStatement(): iam.PolicyStatement;
}

/**
 * Resource provider that creates Parameters in SSM
 */
export class ParameterProvider implements IResourceProvider {
  provide(context: ResourceContext): any {
    const { scope, blueprintProps, environment } = context;

    const parameters = new Map<string, string>();

    Object.entries(blueprintProps.deploymentDefinition).forEach(([deploymentStage, deploymentDefinition]) => {
      if (deploymentDefinition.env && deploymentDefinition.env.account) {
        parameters.set(`Account${deploymentStage}`, deploymentDefinition.env.account);
      }
    });

    // backward compatibility
    [Stage.RES, Stage.DEV, Stage.INT].forEach((stage) => {
      if (!parameters.get(`Account${stage}`)) {
        parameters.set(`Account${stage}`, '-');
      }

      // RES -> Res, DEV -> Dev, INT -> Int
      parameters.set(
        `Account${stage.charAt(0).toUpperCase() + stage.slice(1).toLocaleLowerCase()}`,
        parameters.get(`Account${stage}`)!,
      );
    });

    return new SSMParameterStack(scope, `${blueprintProps.applicationName}SSMParameterStack`, {
      env: environment,
      applicationQualifier: blueprintProps.applicationQualifier,
      parameter: Object.fromEntries(parameters),
    });
  }
}
