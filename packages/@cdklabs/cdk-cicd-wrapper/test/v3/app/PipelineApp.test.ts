// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Unit tests for the app `cdk-cicd deploy-ci` points the CDK CLI at. The interesting behaviour is not
// the pipeline itself (that is CodePipelineEngine.test.ts) but the wiring around it: one stack, named
// from the application, environment taken from the ambient CDK_DEFAULT_* the CDK CLI resolves, the
// disposable flag reaching the support resources, and the nag aspect being applied at all.

import { Aspects } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { PipelineApp } from '../../../src/v3/app/PipelineApp';
import { defineCICD } from '../../../src/v3/config/define';
import { Repository } from '../../../src/v3/config/repository';
import { EngineType, ResolvedCicdConfig } from '../../../src/v3/config/types';

const ACCOUNT = '111111111111';
const REGION = 'us-west-2';

const config = (application?: string): ResolvedCicdConfig =>
  defineCICD({ application, repository: Repository.s3('shop-src/app.zip'), stages: ['dev'] });

// The CDK CLI resolves the ambient credentials into these before it runs the app, and PipelineApp has
// no other source for them -- so set them here rather than mocking, and put them back afterwards.
const saved = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION };
beforeEach(() => {
  process.env.CDK_DEFAULT_ACCOUNT = ACCOUNT;
  process.env.CDK_DEFAULT_REGION = REGION;
});
afterAll(() => {
  process.env.CDK_DEFAULT_ACCOUNT = saved.account;
  process.env.CDK_DEFAULT_REGION = saved.region;
  if (saved.account === undefined) delete process.env.CDK_DEFAULT_ACCOUNT;
  if (saved.region === undefined) delete process.env.CDK_DEFAULT_REGION;
});

describe('m4-approval-selfupdate: PipelineApp', () => {
  test('synthesizes exactly one stack, named from the application, holding one pipeline', () => {
    const assembly = new PipelineApp({ config: config('shop') }).synth();

    // `deploy-ci` runs `cdk deploy --all`, so a second stack in here would be deployed silently.
    expect(assembly.stacks.map((s) => s.stackName)).toEqual(['shop-pipeline']);
    Template.fromJSON(assembly.stacks[0].template).resourceCountIs('AWS::CodePipeline::Pipeline', 1);
  });

  test('an unnamed application still yields a usable stack name', () => {
    // `application` is optional in the config, and an empty or `undefined-pipeline` stack name is a
    // deploy-time failure rather than a rendering one, which is a bad place to find it.
    expect(new PipelineApp({ config: config() }).synth().stacks[0].stackName).toEqual('cdk-cicd-pipeline');
  });

  test('the stack environment is the ambient account and region, resolved not tokenized', () => {
    const stack = new PipelineApp({ config: config('shop') }).synth().stacks[0];

    // An env-agnostic stack would leave every bootstrap-role ARN the engine builds as an unresolved
    // token, so pin the concrete environment rather than just "a pipeline rendered".
    expect(stack.environment.account).toEqual(ACCOUNT);
    expect(stack.environment.region).toEqual(REGION);
  });

  test('the nag aspect is applied to the app', () => {
    // Only registration is asserted: this repository resolves two copies of aws-cdk-lib, and cdk-nag's
    // rules match resources with `instanceof`, so the checks produce nothing here regardless of the
    // template. Liveness belongs to `m4-nag-compliance`, which fixes the duplication first.
    const app = new PipelineApp({ config: config('shop') });
    expect(Aspects.of(app).all.some((a) => a instanceof AwsSolutionsChecks)).toBe(true);
  });

  test('by default the pipeline keeps its artifact bucket, and disposable deletes it', () => {
    const templateFor = (disposable: boolean) =>
      Template.fromJSON(new PipelineApp({ config: config('shop'), disposable }).synth().stacks[0].template);

    // Both directions matter: teardown in m4-verify depends on DESTROY reaching the bucket, and a real
    // pipeline losing its artifact history to a `cdk destroy` depends on RETAIN being the default.
    templateFor(false).hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Retain' });
    templateFor(true).hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Delete' });
  });

  test('an engine the wrapper does not implement is named, not silently skipped', () => {
    // Reachable because a config can arrive as YAML/JSON without passing through `defineCICD`.
    const unknown = { ...config('shop'), engine: 'github' as EngineType };
    expect(() => new PipelineApp({ config: unknown })).toThrow(/unknown pipeline engine 'github'/);
  });
});
