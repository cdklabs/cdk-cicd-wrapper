import { PipelineBlueprint } from '@cdklabs/cdk-cicd-wrapper';
import { App, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';

interface Props extends StackProps {
  value?: string;
}

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props: Props = {}) {
    super(scope, id, props);

    new CfnOutput(this, 'hello', { value: props.value || 'world' });
  }
}

const app = new App();

PipelineBlueprint.builder()
  .workbench({
    provide(context) {
      new MyStack(context.scope, 'cdk-ts-example-workbench', { value: 'workbench' });
    },
  })
  .defineStages([
    {
      stage: 'dev',
      account: '123456789012',
      region: 'us-east-1',
    }
  ])
  .addStack({
    provide(context) {
      new MyStack(context.scope, 'cdk-ts-example');
    },
  })
  .synth(app);


app.synth();