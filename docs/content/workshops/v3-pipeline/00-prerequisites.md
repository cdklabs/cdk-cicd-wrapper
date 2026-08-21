# Prerequisites

You'll need:

- **An AWS account** you can deploy into, with credentials in your shell (the pipeline is provisioned
  into this "hub" account; stages deploy to the accounts/regions your config names).
- **Node.js 20+** and the **AWS CDK v2** CLI (`npx cdk --version`).
- Your account(s)/region(s) **bootstrapped** for CDK: `npx cdk bootstrap aws://<account>/<region>`. Every
  stage region a pipeline deploys to must be bootstrapped.
- A **source** the pipeline reads from — a CodeCommit repo, a GitHub repo via a CodeStar (CodeConnections)
  connection, or a versioned S3 object.

## Start from a stock CDK app

Nothing about the wrapper changes how you scaffold an app — that's the point:

```bash
npx -y aws-cdk init --language typescript
npm install --include=dev --save @cdklabs/cdk-cicd-wrapper @cdklabs/cdk-cicd-wrapper-cli
```

`@cdklabs/cdk-cicd-wrapper` is the constructs library; `@cdklabs/cdk-cicd-wrapper-cli` provides the
`cdk-cicd` command you'll run. (See the pre-release note on the overview page while v3 is unreleased.)

You will **not** import the wrapper in your `bin/` in the basic flow — the next chapter shows why.
