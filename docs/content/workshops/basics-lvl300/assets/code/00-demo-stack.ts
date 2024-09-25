import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';

export class DemoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create an ECS Cluster
    new ecs.Cluster(this, 'DemoCluster', {
      clusterName: cdk.Names.uniqueResourceName(this, {
        maxLength: 50,
      }),
      enableFargateCapacityProviders: true,
      containerInsights: true,
    });
  }
}