// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { aws_lambda, IAspect, Annotations, CustomResourceProvider, CfnResource } from 'aws-cdk-lib';
import { CfnFunction, Function, RuntimeFamily } from 'aws-cdk-lib/aws-lambda';
import { IConstruct } from 'constructs';

export class CodeCommitRepositoryAspects implements IAspect {
  constructor(readonly minimumNodeRuntimeVersion: aws_lambda.Runtime = aws_lambda.Runtime.NODEJS_16_X) {}

  public visit(node: IConstruct): void {
    this.overrideNodeJsVersion(node);
  }

  private parseNodeRuntimeVersion(runtimeName: string): number {
    const runtimeVersion = runtimeName.replace('nodejs', '').split('.')[0];
    return +runtimeVersion;
  }

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

  private overrideNodeJsVersion(node: IConstruct) {
    this.overrideNodeJsVersionCFNFunction(node);
    this.overrideNodeJsVersionFunction(node);
    this.overrideNodeJsVersionCustomResource(node);
  }
}
