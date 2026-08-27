#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// PROOF entry for issue #241: the security plugins apply on a PLAIN `cdk deploy`, with no
// `cdk-cicd exec` and no pipeline. The single wrapper line is `CdkCicd.attach(app)` -- that is the
// whole opt-in. `cdk.json` runs this entry directly (`npx ts-node bin/app.ts`), so this is exactly
// what a user's own bin/ looks like on a normal deploy.
//
// It also demonstrates a CUSTOM plugin: `RequireOwnerTagAspect` is registered via
// `CdkCicd.addPlugin` and selected by name in cicd.config.ts's `plugins` list.

import * as cdk from 'aws-cdk-lib';
import { IAspect } from 'aws-cdk-lib';
import { CdkCicd } from '@cdklabs/cdk-cicd-wrapper';
import { IConstruct } from 'constructs';
import { OrderApiStack } from '../lib/order-api-stack';

/** A trivial custom plugin: annotate every stack that is missing an `Owner` tag. */
class RequireOwnerTagAspect implements IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof cdk.Stack && node.tags.tagValues().Owner === undefined) {
      cdk.Annotations.of(node).addInfo('Owner tag is recommended (RequireOwnerTagAspect).');
    }
  }
}

const app = new cdk.App();

new OrderApiStack(app, 'security-plugins-proof', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

// Register the custom plugin instance BEFORE attach so it is present when plugins resolve. The
// cicd.config.ts `plugins` list selects it by name alongside the built-ins it keeps.
CdkCicd.addPlugin(app, new RequireOwnerTagAspect(), { name: 'RequireOwnerTag', version: '1.0.0' });

// The one opt-in line. On a plain `cdk deploy` this applies the resolved plugin set tree-wide.
CdkCicd.attach(app);
