import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

/** Same trivial payload as level0-app. See test/fixtures/README.md. */
export class HardcodedEnvStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const runId = process.env.CDK_CICD_TEST_RUN_ID ?? 'local';

    new ssm.StringParameter(this, 'Marker', {
      parameterName: `/cdkcicdtest/${runId}/hardcoded-env`,
      stringValue: `cdk-cicd-wrapper hardcoded-env fixture, run ${runId}`,
    });
  }
}
