// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

/**
 * This class provides functionality to resolve parameter values from AWS Systems Manager Parameter Store or from provided string values.
 */
export class ParameterResolver {
  /**
   * The prefix used to identify parameter resolution from AWS Systems Manager Parameter Store.
   * @default 'resolve'
   */
  static PREFIX = 'resolve';

  /**
   * Resolves the value of a parameter, either from an SSM parameter or using the provided string value.
   * @param scope The scope in which the parameter is resolved.
   * @param param The parameter value to resolve. If it starts with 'ssm:', it will be treated as an SSM parameter name.
   * @returns The resolved parameter value.
   */
  public static resolveValue(scope: Construct, param: string) {
    if (param.startsWith('resolve:ssm:')) {
      return cdk.Lazy.string({
        produce: () => ssm.StringParameter.valueForStringParameter(scope, param.substring(12)),
      });
    }
    return param;
  }
}
