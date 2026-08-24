import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { CdkPipelinesStageContext, IStageProvider } from '@cdklabs/cdk-cicd-wrapper';

/**
 * The trivial per-stage payload `GitHubActionsEngine` wraps as a `cdk.Stage`. Never deployed by this
 * fixture's harness run (only the top-level `github-actions` stack, containing the GitHubActionRole,
 * is requested), so it exists purely to satisfy the engine's `IStageProvider` contract at synth time.
 */
export class StubStages implements IStageProvider {
  constructor(private readonly runId: string) {}

  public stacks(stage: cdk.Stage, context: CdkPipelinesStageContext): void {
    const stack = new cdk.Stack(stage, 'App');
    new ssm.StringParameter(stack, 'Marker', {
      parameterName: `/cdkcicdtest/${this.runId}/github-actions-${context.stageName}`,
      stringValue: `cdk-cicd-wrapper github-actions fixture stage ${context.stageName}`,
    });
  }
}
