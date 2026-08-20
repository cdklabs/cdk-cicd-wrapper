import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

/** Same trivial payload as level0-app. See test/fixtures/README.md. */
export class Level1Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const runId = process.env.CDK_CICD_TEST_RUN_ID ?? 'local';

    new ssm.StringParameter(this, 'Marker', {
      parameterName: `/cdkcicdtest/${runId}/level1`,
      stringValue: `cdk-cicd-wrapper level1 fixture, run ${runId}`,
    });
  }
}
