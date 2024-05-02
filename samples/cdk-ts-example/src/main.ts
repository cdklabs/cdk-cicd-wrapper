import { BasicRepositoryProvider, PipelineBlueprint } from '@cdklabs/cdk-cicd-wrapper';
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
  .applicationName('sample-app')
  .repositoryProvider(new BasicRepositoryProvider({
    repositoryType: 'CODECOMMIT',
    name: 'ts-cdk-project-with-private-repository',
    branch: 'main',
  }))
  .sandbox({
    provide(context) {
      new MyStack(context.scope, 'cdk-ts-example-sandbox', { value: 'sandbox' });
    },
  })
  .addStack({
    provide(context) {
      new MyStack(context.scope, 'cdk-ts-example');
    },
  })
  .synth(app);


app.synth();