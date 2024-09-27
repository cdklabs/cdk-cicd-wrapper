# Modularizing Stacks with DefaultStackProvider

In complex CDK projects, managing inlined stacks within `PipelineBlueprint.builder()` can become cumbersome. To enhance organization and reusability, the `DefaultStackProvider` abstraction offers a powerful solution.

In complex CDK projects, managing inlined stacks within `PipelineBlueprint.builder()` can become cumbersome. To enhance organization and reusability, the `BaseStackProvider` and `DefaultStackProvider` abstractions offer powerful solutions.

The `DefaultStackProvider` serves as an abstract base class that you can extend to define your stack provisioning logic. The core implementation lies within the mandatory `stacks()` function.

```typeScript
import { Stage, DefaultStackProvider } from '@cdklabs/cdk-cicd-wrapper';
import * as cdk from 'aws-cdk-lib';

export class ExampleProvider extends DefaultStackProvider {

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

## Sharing resources across DefaultStackProviders

It is common to share resources across multiple stack provider. To achieve this, you can create the resource in one of the DefaultStackProvider and register it with the `register(key: string, value: any)` method. You can then retrieve the resource in another DefaultStackProvider using the `get(key: string)` method. The following example demonstrates how to share a DynamoDB table across two DefaultStackProviders.

```typeScript
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
```

```typeScript
import { DefaultStackProvider } from '@cdklabs/cdk-cicd-wrapper';
import * as cdk from 'aws-cdk-lib';

export class LambdaProvider extends DefaultStackProvider {
  stacks(): void {
    const table = this.get('exampleTable') as cdk.Table;

    // Use the DynamoDB table in your stack
    // ...
  }
}
```

## Best Practices
- **Modular Organization:** For optimal maintainability, create separate providers for distinct logical units within your application. This promotes code clarity and simplifies future modifications.
- **Extensibility with Hooks:** The DefaultStackProvider provides optional preHooks and postHooks methods that you can override to execute custom logic before and after stack creation, respectively. This empowers you to inject additional processing steps into your pipeline as needed.
- **Secure Key Management:** Utilize a dedicated AWS Key Management Service (KMS) key for encryption purposes. This key can be retrieved using the this.encryptionKey property within your custom provider class.
- **Centralized Configuration Management:** Access and leverage SSM Parameters to store and retrieve configuration values securely. You can utilize the resolve(ssmParameterName: string) function provided by the DefaultStackProvider to retrieve these parameters within your stacks
- **Resource Sharing:** To share resources across multiple DefaultStackProviders, create the resource in one provider and register it using the register(key: string, value: any) method. You can then retrieve the resource in another provider using the get(key: string) method.
- **SSM Parameter Caching:** To minimize the number of SSM Parameter retrievals, the DefaultStackProvider caches parameter values for the duration of the pipeline execution. This ensures optimal performance and reduces unnecessary API calls.
- **Namespace Isolation:** To prevent naming conflicts, each DefaultStackProvider operates within its own namespace. This ensures that stack names, resource identifiers, and other naming conventions remain unique across the pipeline.

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