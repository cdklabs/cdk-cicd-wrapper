// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as cdk from 'aws-cdk-lib';
import { Stage } from '../../../src';
import { DefaultStackProvider } from '../../../src/common/types/DefaultStackProvider';
import { TestContext } from '../../TestConfig';

describe('DefaultStackProvider', () => {
  let testContext = TestContext();

  beforeEach(() => {
    testContext = TestContext();
  });

  test('should have random stacknames', () => {
    const provider = new (class extends DefaultStackProvider {
      stacks(): void {
        const stack = new cdk.Stack(this.scope, 'Stack1');

        new cdk.CfnOutput(stack, 'Output1', {
          value: 'Output1',
        });
      }
    })({
      providerName: 'TestProvider',
    });

    testContext.initStage(Stage.DEV);
    testContext._scoped(new cdk.Stage(testContext.scope, 'DEV'), () => {
      provider.provide(testContext);
    });

    (testContext.scope as cdk.App).synth();

    expect(
      testContext.scope.node
        .findAll()
        .filter((node) => node.node.id === 'Stack1')
        .map((node) => node as cdk.Stack)
        .map((stack) => stack.stackName)
        .at(0),
    ).toMatch(/^DEV-CICDWrapperTestProviderStack1.{8}/g);
  });

  test('should have normalized stacknames', () => {
    const provider = new (class extends DefaultStackProvider {
      stacks(): void {
        const stack = new cdk.Stack(this.scope, 'Stack1');

        new cdk.CfnOutput(stack, 'Output1', {
          value: 'Output1',
        });
      }
    })({
      providerName: 'TestProvider',
      normalizeStackNames: true,
    });

    testContext.initStage(Stage.DEV);
    testContext._scoped(new cdk.Stage(testContext.scope, 'DEV'), () => {
      provider.provide(testContext);
    });

    (testContext.scope as cdk.App).synth();

    expect(
      testContext.scope.node
        .findAll()
        .filter((node) => node.node.id === 'Stack1')
        .map((node) => node as cdk.Stack)
        .map((stack) => stack.stackName)
        .at(0),
    ).toMatch(/^DEV-CICDWrapper-TestProvider-Stack1$/g);
  });
});
