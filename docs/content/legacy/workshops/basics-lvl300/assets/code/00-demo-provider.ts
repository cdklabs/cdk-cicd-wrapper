import * as wrapper from '@cdklabs/cdk-cicd-wrapper';
import { DemoStack } from '../lib/demo-stack';

export class DemoProvider extends wrapper.BaseStackProvider {
  stacks(): void {
    new DemoStack(this.scope, 'DemoStack', { env: this.env });
  }
}