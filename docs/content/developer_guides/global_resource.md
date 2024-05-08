# Global Resources

{{ project_name }} uses a simple [Dependency Injection](https://en.wikipedia.org/wiki/Dependency_injection#:~:text=Dependency%20injection%20aims%20to%20separate,how%20to%20construct%20those%20services) system to ease the complexity of the cross-cutting resource generation. On this page you can read more about how it is been used in the {{ project_name }} and how can you use for your benefit as well.

## Dependency Injection and Resource Providers

The benefit of the dependency injection is that the stack dependency implementations are decoupled from the stack and the {{ project_name }} manages the creation of those resources.

Let's see an example:

```typescript
new vp.S3BucketStack(context.scope, `${context.blueprintProps.applicationName}S3Stack`, {
    bucketName: 'test-bucket',
    stageName: context.stage,
    applicationQualifier: context.blueprintProps.applicationQualifier,
    encryptionKey: context.get(GlobalResources.Encryption)!.kmsKey,
}
```

You can see here the S3BucketStack requires a KMS key to perform server-side encryption.
Here, we can leverage one of our built-in providers that allows you to access a KMS Key that is dedicated to your pipeline for the particular stage in which your stack is deployed.
You don't need to manage the key creation, it is managed for you and will be available whenever you need it.

All the Resource Providers accessible through the `resourceContext` parameter.

## Existing Resource Providers

### Compliance Bucket Resource Provider

### ParameterStore

## How to define you Resource Provider
