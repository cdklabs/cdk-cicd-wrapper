// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { PipelineBlueprint } from '@cdklabs/cdk-cicd-wrapper';
import { App, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';

interface Props extends StackProps {
  value?: string;
}

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props: Props = {}) {
    super(scope, id, props);

    new CfnOutput(this, 'hello', { value: props.value || 'world' });
  }
}

const app = new App();

PipelineBlueprint.builder()
  .workbench({
    provide(context) {
      new MyStack(context.scope, 'cdk-ts-example-workbench', { value: 'workbench' });
    },
  })
  .addStack({
    provide(context) {
      new MyStack(context.scope, 'cdk-ts-example');
    },
  })
  .synth(app);


app.synth();