import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { runId } from './run-id';

/**
 * The trivial payload the m4 pipeline deploys per stage: a single SSM parameter the gate reads back
 * to prove the stage's stack really deployed (a green `cdk deploy` exit code is not evidence -- an
 * assembly with no stacks also exits 0).
 *
 * The stack tags ITSELF with `cdk-cicd-wrapper-test` rather than leaning on the wrapper's config-tag
 * injection: inside the pipeline's CodeBuild the stage-config the injector reads is not guaranteed to
 * resolve, and this tag is what the teardown guard requires before it will destroy the stack -- so it
 * has to be unconditional.
 *
 * The stage comes from `CDK_STAGE`, which is what `cdk-cicd exec` actually exports (`stageEnv`); the
 * marker embeds it so the gate can prove the DEV deploy carried the dev stage and the PROD deploy
 * carried prod, rather than both stages deploying an identical stack.
 */
export class PipelineFixtureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const run = runId();
    const stage = process.env.CDK_STAGE ?? 'unknown';

    cdk.Tags.of(this).add('cdk-cicd-wrapper-test', run);
    cdk.Tags.of(this).add('Stage', stage);

    new ssm.StringParameter(this, 'Marker', {
      parameterName: `/cdkcicdtest/${run}/app`,
      stringValue: `cdk-cicd-wrapper m4 pipeline fixture, run ${run}, stage ${stage}`,
    });
  }
}
