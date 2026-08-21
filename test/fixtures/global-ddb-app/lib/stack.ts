// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

/**
 * One DynamoDB global table (TableV2): primary in the stack's region, a replica in the secondary region.
 * The table name carries the run id so the multi-region proof gate can assert it in both regions. RETAIN
 * is off (DESTROY) so the gate's teardown removes the table and its replica.
 */
export class GlobalDdbStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const runId = process.env.CDK_CICD_TEST_RUN_ID ?? 'local';
    // The replica region: the secondary test region, distinct from the stack's (primary) region.
    const replicaRegion = process.env.CDK_CICD_TEST_REGION_SECONDARY ?? 'us-west-1';

    new dynamodb.TableV2(this, 'GlobalTable', {
      tableName: `cdkcicdtest-${runId}-global`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      replicas: [{ region: replicaRegion }],
    });
  }
}
