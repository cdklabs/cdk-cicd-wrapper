// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface MyStackProps extends cdk.StackProps {
  readonly value?: string;
}

/** The application payload. Ordinary CDK -- the wrapper adds nothing here; it wraps the app around it. */
export class MyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MyStackProps = {}) {
    super(scope, id, props);
    new CfnOutput(this, 'hello', { value: props.value ?? 'world' });
  }
}
