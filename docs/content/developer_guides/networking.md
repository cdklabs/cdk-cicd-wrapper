# Networking

## Determine VPC and Proxy settings for your pipeline

By default, the Pipeline is configured to run **without** a VPC. To have it run inside a VPC, there are two options: `VPC` and `VPC_FROM_LOOK_UP`. These options are configured using `npx {{ npm_cli }} configure` described in the next section.

Use `VPC` if you want a single, self-contained pipeline running in a VPC. This is not recommended for use with multiple code pipelines in the same account. The VPC is created using defaulted settings.

Use `VPC_FROM_LOOK_UP` to look up an existing VPC based on its vpc ID. It is recommended to create this VPC prior to deploying the pipeline. Multiple deployments of the pipeline can share the same VPC.

Note: Switching between VPC options may require a complete tear down and redeploy of the pipeline

Proxy Configuration requires proxy information to be stored in Secrets manager. Make note of the secret arn is needed in the next step.
