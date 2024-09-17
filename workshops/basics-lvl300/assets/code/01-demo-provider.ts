import * as wrapper from '@cdklabs/cdk-cicd-wrapper';
import { DemoStack } from '../lib/demo-stack';

export class DemoProvider extends wrapper.BaseStackProvider {
  stacks(): void {
    switch (this.stageName) {
      case 'DEV': this.scope.node.setContext('feature-streamlit', true);
        break;
      case 'INT': // this.scope.node.setContext("feature-streamlit", true);
        break;
      default: break;
    }
    new DemoStack(this.scope, 'DemoStack', { env: this.env });
  }
}