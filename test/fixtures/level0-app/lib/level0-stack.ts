import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

/**
 * The cheapest possible deployable resource: one SSM StringParameter.
 * No retention, no emptying, deletes in seconds — which is what makes the
 * deploy -> assert -> destroy loop fast and safe to run repeatedly.
 *
 * The parameter name is the thing `harness.sh assert` queries, so it must stay
 * in sync with `param_name()` in the harness: /cdkcicdtest/<runId>/<fixture>
 */
export class Level0Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const runId = process.env.CDK_CICD_TEST_RUN_ID ?? 'local';

    new ssm.StringParameter(this, 'Marker', {
      parameterName: `/cdkcicdtest/${runId}/level0`,
      stringValue: `cdk-cicd-wrapper level0 fixture, run ${runId}`,
    });
  }
}
