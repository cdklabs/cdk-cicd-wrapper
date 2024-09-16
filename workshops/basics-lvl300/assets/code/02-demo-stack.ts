import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecrAsset from 'aws-cdk-lib/aws-ecr-assets';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as path from 'path';
import * as nag from 'cdk-nag';

export class DemoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create an ECS Cluster
    const cluster = new ecs.Cluster(this, 'DemoCluster', {
      clusterName: cdk.Names.uniqueResourceName(this, {
        maxLength: 50,
      }),
      enableFargateCapacityProviders: true,
      containerInsights: true,
    });

    cluster.vpc.addFlowLog('demo-flow-log');

    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      inlinePolicies: {
        BedrockInvokeModel: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['bedrock:InvokeModel'],
              resources: [`arn:aws:bedrock:${cdk.Aws.REGION}::foundation-model/amazon.titan-image-generator-v1`],
            }),
          ],
        }),
      },
    });

    // Define a Fargate task definition
    const fargateTaskDefinition = new ecs.FargateTaskDefinition(this, 'StreamlitAppTaskDef', {
      taskRole,
    });

    // Add container to task definition
    const container = fargateTaskDefinition.addContainer('StreamlitContainer', {
      image: ecs.ContainerImage.fromAsset(path.resolve(__dirname, 'image_prompts'), { networkMode: ecrAsset.NetworkMode.custom('sagemaker') }),
      memoryLimitMiB: 512,
      cpu: 256,
      logging: new ecs.AwsLogDriver({ streamPrefix: 'streamlit-app' }),
    });

    // Expose the container on port 8501 (Streamlit default port)
    container.addPortMappings({
      containerPort: 8501,
      protocol: ecs.Protocol.TCP,
    });

    // Create Fargate service in ECS
    const loadBalancer = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'StreamlitFargateService', {
      cluster: cluster, // Required
      taskDefinition: fargateTaskDefinition,
      desiredCount: 1,
      publicLoadBalancer: true,
    });

    nag.NagSuppressions.addResourceSuppressions(
      loadBalancer,
      [
        {
          id: 'AwsSolutions-EC23',
          reason: 'Allow public access to loadbalancer.',
        },
        {
          id: 'AwsSolutions-ELB',
          reason: 'ELB access logs',
        },
      ],
      true,
    );

    nag.NagSuppressions.addResourceSuppressions(fargateTaskDefinition, [{
      id: 'AwsSolutions-IAM5',
      reason: 'Allow * permissions.',
      appliesTo: ['Resource::*'],
    }], true);
  }
}
