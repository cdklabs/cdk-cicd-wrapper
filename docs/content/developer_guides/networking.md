# Networking

## VPC

By default, every CodeBuild project the pipeline creates runs **without** a VPC. Set `vpc` in `cicd.config.ts` to change that — either have the wrapper manage a VPC for you, or look up an existing one:

```typescript
import { defineCICD, Repository } from '@cdklabs/cdk-cicd-wrapper';

export default defineCICD({
  application: 'my-app',
  repository: Repository.codecommit('my-repo'),
  stages: ['dev', 'prod'],
  vpc: {
    managedVpc: {
      cidrBlock: '172.31.0.0/20', // default
      subnetCidrMask: 24, // default
      maxAzs: 2, // default
    },
  },
});
```

Use `managedVpc` for a single, self-contained VPC created and managed by the wrapper — not recommended if you deploy multiple pipelines into the same account and want them to share a VPC. Use `vpcId` to look up an existing VPC instead:

```typescript
vpc: { vpcId: 'vpc-088aaa9cdf4563515' },
// or, resolved from an SSM parameter at synth time:
vpc: { vpcId: 'resolve:ssm:/path/to/parameter' },
```

Switching between `managedVpc` and `vpcId` (or removing `vpc` entirely) changes the CodeBuild projects' network configuration and may require a full teardown/redeploy of the pipeline.

`managedVpc` also accepts `subnetType`, `restrictDefaultSecurityGroup`, `allowAllOutbound`, `flowLogsBucketName`, and `codeBuildVpcInterfaces` — see `ManagedVpcConfig` in the package's type reference for the full list and defaults.

## Proxy

If your CodeBuild projects need to reach the internet through an HTTP(S) proxy, store the proxy credentials in Secrets Manager (keys `username`, `password`, `http_proxy_port`, `https_proxy_port`, `proxy_domain`) and reference the secret's ARN:

```typescript
export default defineCICD({
  // ...
  proxy: {
    proxySecretArn: 'arn:aws:secretsmanager:region:account:secret:my-proxy-secret',
    // noProxy defaults to the region's own amazonaws.com endpoint (so AWS API calls skip the proxy);
    // proxyTestUrl defaults to https://aws.amazon.com
  },
});
```

Every build project the pipeline creates exports `HTTP(S)_PROXY` from the secret and curls `proxyTestUrl` through the proxy before running its real install commands, to fail fast if the tunnel doesn't work.

When both `vpc.managedVpc` and `proxy` are configured together, the managed VPC's CodeBuild projects default to `PRIVATE_ISOLATED` subnets (no NAT egress) plus the CodeBuild VPC interface endpoints, instead of `PRIVATE_WITH_EGRESS`.
