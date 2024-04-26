import { BasicRepositoryProvider, PipelineBlueprint } from '@cdklabs/cdk-cicd-wrapper';
import { App, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    new CfnOutput(this, 'hello', { value: 'world' });
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
  .addStack({
    provide(context) {
      new MyStack(context.scope, 'ts-cdk-project-with-private-repository-dev');
    },
  })
  .synth(app);


app.synth();