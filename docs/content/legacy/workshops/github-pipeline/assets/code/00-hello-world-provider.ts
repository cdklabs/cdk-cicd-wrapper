import * as wrapper from '@cdklabs/cdk-cicd-wrapper';
import { HelloWorldStack } from '../lib/hello-world-stack';

export class HelloWorldProvider extends wrapper.DefaultStackProvider {
  stacks(): void {
    new HelloWorldStack(this.scope, 'HelloWorldStack', { env: this.env });
  }
}