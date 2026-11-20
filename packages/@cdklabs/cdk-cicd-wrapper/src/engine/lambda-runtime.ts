// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { aws_lambda as lambda } from 'aws-cdk-lib';

/**
 * The newest Node runtime the CONSUMER's `aws-cdk-lib` knows about, for the wrapper's own Lambdas
 * (the deploy driver and the DevOps Agent forwarder).
 *
 * Deliberately derived rather than pinned. cdk-nag's `AwsSolutions-L1` computes "latest" from
 * `Runtime.ALL` of whatever aws-cdk-lib is resolved, and the wrapper's peer range is `^2.195.0`, so a
 * user gets whatever is current. Any hardcoded version therefore becomes a synth ERROR -- which blocks
 * `deploy-ci` entirely -- the moment AWS adds a newer runtime. Measured, not theorised: pinning
 * `NODEJS_22_X` passed against the repo's own 2.195.0 (whose newest is 22) and FAILED L1 in a real run
 * that resolved 2.266.0 (whose newest is 24). Reading the same list nag reads keeps the two in step by
 * construction. `Runtime.NODEJS_LATEST` is NOT a substitute -- it is a conservative alias (nodejs18.x in
 * 2.195.0) and fails L1 too. The handler is plain JS on the AWS SDK v3, so any modern Node suits it.
 */
export function latestNodeRuntime(): lambda.Runtime {
  const major = (r: lambda.Runtime): number => parseInt(r.name.replace('nodejs', ''), 10);
  return lambda.Runtime.ALL.filter(
    (r) => r.family === lambda.RuntimeFamily.NODEJS && /^nodejs\d+\./.test(r.name),
  ).reduce((best, r) => (major(r) > major(best) ? r : best), lambda.Runtime.NODEJS_22_X);
}
