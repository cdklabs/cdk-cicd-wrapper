# Modularizing Stacks with BaseStackProvider

In complex CDK projects, managing inlined stacks within `PipelineBlueprint.builder()` can become cumbersome. To enhance organization and reusability, the `BaseStackProvider` abstraction offers a powerful solution.

## Creating a Custom Stack Provider

The `BaseStackProvider` serves as an abstract base class that you can extend to define your stack provisioning logic. The core implementation lies within the mandatory `stacks()` function.

```typeScript
import { Stage, BaseStackProvider } from '@cdklabs/cdk-cicd-wrapper';
import * as cdk from 'aws-cdk-lib';

export class ExampleProvider extends BaseStackProvider {

  stack(): cdk.Stack {
    // Define your stack configuration here
    return new cdk.Stack(this.scope, 'ExampleStack', {
      env: this.env,
      // ... other stack properties
    });
  }
}
```

## Leveraging the Custom Provider

Once you've created your custom provider, integrate it seamlessly within your pipeline blueprint:

```typeScript
import { PipelineBlueprint } from '@cdklabs/cdk-cicd-wrapper';
import { ExampleProvider } from './example-provider'; // Assuming your provider is in a separate file

const pipeline = PipelineBlueprint.builder()
  .addStack(new ExampleProvider())
  .synth(app);
```

## Best Practices
- **Modular Organization:** For optimal maintainability, create separate providers for distinct logical units within your application. This promotes code clarity and simplifies future modifications.
- **Extensibility with Hooks:** The BaseStackProvider provides optional preHooks and postHooks methods that you can override to execute custom logic before and after stack creation, respectively. This empowers you to inject additional processing steps into your pipeline as needed.

By adhering to these guidelines, you'll establish a well-structured, scalable approach to managing CDK stacks within your development workflows.