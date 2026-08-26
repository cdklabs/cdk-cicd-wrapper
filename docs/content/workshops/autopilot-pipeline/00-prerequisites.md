# Prerequisites

!!! abstract "In this chapter"
    - Confirm the accounts, tooling, and source you need before building an Autopilot pipeline.
    - Scaffold a stock CDK app and install the wrapper — **without** touching `bin/`.

## What you'll need

- **An AWS account** you can deploy into, with credentials in your shell (the pipeline is provisioned
  into this "hub" account; stages deploy to the accounts/regions your config names).
- **Node.js 20+** and the **AWS CDK v2** CLI (`npx cdk --version`).
- **Python 3** on your `PATH` — the `cdk-cicd` CLI's security checks resolve a Python interpreter when it
  starts, so any `cdk-cicd` command needs Python 3 available (`python3 --version`).
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
`cdk-cicd` command you'll run. (See the pre-release note on the overview page while Autopilot is unreleased.)

You will **not** import the wrapper in your `bin/` in the basic flow — the next chapter shows why.

!!! success "Verify"
    Before moving on, confirm your toolchain is ready:

    ```bash
    npx cdk --version                    # AWS CDK v2 CLI is on PATH
    node --version                       # v20 or newer
    npx cdk-cicd --help                  # the wrapper CLI resolves
    ```

    The `npx cdk-cicd --help` call is the important one: it proves the CLI package installed and is
    runnable. If it fails, re-check the `npm install` above and your pre-release channel.

## Recap

You have a plain `cdk init` app with the wrapper packages installed and your target region bootstrapped —
and you changed nothing in `bin/`. Next, you'll turn this app into a pipeline with a single config file.
