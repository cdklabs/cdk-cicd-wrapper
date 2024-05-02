// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { aws_lambda, IAspect, Annotations, CustomResourceProvider, CfnResource } from 'aws-cdk-lib';
import { CfnFunction, Function, RuntimeFamily } from 'aws-cdk-lib/aws-lambda';
import { IConstruct } from 'constructs';

/**
 * An aspect that ensures a minimum Node.js runtime version for Lambda functions.
 */
export class CodeCommitRepositoryAspects implements IAspect {
  /**
   * Creates a new instance of the CodeCommitRepositoryAspects class.
   * @param minimumNodeRuntimeVersion The minimum Node.js runtime version to enforce. Defaults to Node.js 16.x.
   */
  constructor(readonly minimumNodeRuntimeVersion: aws_lambda.Runtime = aws_lambda.Runtime.NODEJS_16_X) {}

  /**
   * Visits the construct and applies the minimum Node.js runtime version aspect.
   * @param node The construct to visit.
   */
  public visit(node: IConstruct): void {
    this.overrideNodeJsVersion(node);
  }

  /**
   * Parses the Node.js runtime version from a given runtime name string.
   * @param runtimeName The runtime name string (e.g., "nodejs14.x").
   * @returns The parsed Node.js runtime version number.
   */
  private parseNodeRuntimeVersion(runtimeName: string): number {
    const runtimeVersion = runtimeName.replace('nodejs', '').split('.')[0];
    return +runtimeVersion;
  }

  /**
   * Overrides the Node.js runtime version for a CfnFunction resource if it is below the minimum required version.
   * @param node The construct to check for a CfnFunction resource.
   */
  private overrideNodeJsVersionCFNFunction(node: IConstruct) {
    if (node instanceof CfnFunction) {
      if (!node.runtime) {
        throw new Error(`Runtime not specified for ${node.node.path}`);
      }

      if (!node.runtime.includes('nodejs')) return;

      const actualNodeJsRuntimeVersion = this.parseNodeRuntimeVersion(node.runtime);
      const minimumNodeJsRuntimeVersion = this.parseNodeRuntimeVersion(this.minimumNodeRuntimeVersion.name);

      if (actualNodeJsRuntimeVersion < minimumNodeJsRuntimeVersion) {
        node.runtime = this.minimumNodeRuntimeVersion.name;
        Annotations.of(node).addInfo(
          `Node.js runtime version was changed to the minimum required: ${this.minimumNodeRuntimeVersion.name}.`,
        );
      }
    }
  }

  /**
   * Overrides the Node.js runtime version for a Function resource if it is below the minimum required version.
   * @param node The construct to check for a Function resource.
   */
  private overrideNodeJsVersionFunction(node: IConstruct) {
    if (node instanceof Function) {
      if (!node.runtime) {
        throw new Error(`Runtime not specified for ${node.node.path}`);
      }

      if (node.runtime.family != RuntimeFamily.NODEJS) return;

      const actualNodeJsRuntimeVersion = this.parseNodeRuntimeVersion(node.runtime.name);
      const minimumNodeJsRuntimeVersion = this.parseNodeRuntimeVersion(this.minimumNodeRuntimeVersion.name);

      if (actualNodeJsRuntimeVersion < minimumNodeJsRuntimeVersion) {
        (node as any).runtime = this.minimumNodeRuntimeVersion;
        Annotations.of(node).addInfo(
          `Node.js runtime version was changed to the minimum required: ${this.minimumNodeRuntimeVersion.name}.`,
        );
      }
    }
  }

  /**
   * Overrides the Node.js runtime version for a CustomResourceProvider resource if it is below the minimum required version.
   * @param node The construct to check for a CustomResourceProvider resource.
   */
  private overrideNodeJsVersionCustomResource(node: IConstruct) {
    if (node instanceof CustomResourceProvider) {
      const cfnFunction = node.node.findChild('Handler') as CfnResource;
      try {
        cfnFunction.addOverride('Properties.Runtime', this.minimumNodeRuntimeVersion.name);
      } catch (warning) {
        Annotations.of(node).addInfo(
          `Node.js runtime version was changed to the minimum ${this.minimumNodeRuntimeVersion.name}.`,
        );
      }
    }
  }

  /**
   * Overrides the Node.js runtime version for Lambda functions if they are below the minimum required version.
   * @param node The construct to check for Lambda function resources.
   */
  private overrideNodeJsVersion(node: IConstruct) {
    this.overrideNodeJsVersionCFNFunction(node);
    this.overrideNodeJsVersionFunction(node);
    this.overrideNodeJsVersionCustomResource(node);
  }
}
