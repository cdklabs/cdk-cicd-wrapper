# Modularizing Stacks

## Using Stack Providers

In complex CDK projects, managing inlined stacks within `PipelineBlueprint.builder()` can become cumbersome. To enhance organization and reusability, the `BaseStackProvider` and `DefaultStackProvider` abstractions offer powerful solutions.

### Creating a Custom Stack Provider

Both `BaseStackProvider` and `DefaultStackProvider` serve as abstract base classes for defining stack provisioning logic. The primary difference is that `DefaultStackProvider` includes additional features for resource sharing and parameter caching.

#### Example with BaseStackProvider

```typescript
import { Stage, BaseStackProvider } from '@cdklabs/cdk-cicd-wrapper';
import * as cdk from 'aws-cdk-lib';

export class ExampleBaseProvider extends BaseStackProvider {
  stacks(): void {
    new cdk.Stack(this.scope, 'ExampleStack', {
      env: this.env,
      // ... other stack properties
    });
  }
}
```

#### Example with DefaultStackProvider

```typescript
import { Stage, DefaultStackProvider } from '@cdklabs/cdk-cicd-wrapper';
import * as cdk from 'aws-cdk-lib';

export class ExampleDefaultProvider extends DefaultStackProvider {
  stacks(): void {
    new cdk.Stack(this.scope, 'ExampleStack', {
      env: this.env,
      // ... other stack properties
    });
  }
}
```

#### Leveraging the Custom Provider
Integrate your custom provider seamlessly within your pipeline blueprint:

```typescript
import { PipelineBlueprint } from '@cdklabs/cdk-cicd-wrapper';
import { ExampleBaseProvider } from './example-base-provider'; // Assuming your provider is in a separate file

const pipeline = PipelineBlueprint.builder()
  .addStack(new ExampleBaseProvider())
  .synth(app);
```

#### Sharing Resources Across DefaultStackProviders
To share resources across multiple stack providers, create the resource in one DefaultStackProvider and register it using register(key: string, value: any). Retrieve it in another provider using get(key: string).

```typescript
import { DefaultStackProvider } from '@cdklabs/cdk-cicd-wrapper';
import * as cdk from 'aws-cdk-lib';

export class DynamoDBProvider extends DefaultStackProvider {
  stacks(): void {
    const table = new cdk.Table(this.scope, 'ExampleTable', {
      partitionKey: { name: 'id', type: cdk.AttributeType.STRING },
      billingMode: cdk.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.register('exampleTable', table);
  }
}

export class LambdaProvider extends DefaultStackProvider {
  stacks(): void {
    const table = this.get('exampleTable') as cdk.Table;
    // Use the DynamoDB table in your stack
  }
}
```

## Best Practices
- **Modular Organization:** Create separate providers for distinct logical units within your application, promoting code clarity and simplifying future modifications.
- **Extensibility with Hooks:** Override optional preHooks and postHooks methods to execute custom logic before and after stack creation, injecting additional processing steps into your pipeline.
- **Secure Key Management:** Utilize a dedicated AWS Key Management Service (KMS) key for encryption purposes, retrievable using this.encryptionKey within your custom provider class.
- **Centralized Configuration Management:** Use SSM Parameters to store and retrieve configuration values securely, leveraging the resolve(ssmParameterName: string) function within your stacks.
- **Resource Sharing (DefaultStackProvider only):** Share resources across multiple providers by creating the resource in one and registering it using register(key: string, value: any). Retrieve it in another provider using get(key: string).
- **SSM Parameter Caching (DefaultStackProvider only):** Minimize SSM Parameter retrievals by caching parameter values for the duration of the pipeline execution, ensuring optimal performance and reducing unnecessary API calls.
- **Namespace Isolation (DefaultStackProvider only):** Prevent naming conflicts by operating each provider within its own namespace, ensuring unique stack names and resource identifiers across the pipeline.

By following these guidelines, you'll establish a well-structured, scalable approach to managing CDK stacks within your development workflows.