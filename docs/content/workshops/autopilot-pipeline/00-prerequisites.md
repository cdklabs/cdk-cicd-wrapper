# Prerequisites

!!! abstract "In this chapter"
    - Confirm the accounts, tooling, and source you need before building an Autopilot pipeline.
    - Scaffold a stock CDK app and install the wrapper — **without** touching `bin/`.

## What you'll need

- **An AWS account** you can deploy into, with credentials in your shell (the pipeline is provisioned
  into this "hub" account; stages deploy to the accounts/regions your config names).
- **Node.js 20+** and the **AWS CDK v2** CLI (`npx cdk --version`).
- **Python 3** on your `PATH` (`python3 --version`) for the `cdk-cicd` commands that run Python tools:
  `security-scan`, `check-dependencies --python`, `license` in a project with a `Pipfile`, and the
  `security` step of `cdk-cicd check` (skipped without it).
- The hub account/region and every stage account/region **bootstrapped** for CDK:
  `npx cdk bootstrap aws://<account>/<region>`. The engine-owned pipeline stack always uses the standard
  bootstrap qualifier; a target application's custom qualifier applies only to its target stacks.
  The pipeline's deploy builds run in the hub account and assume each stage account's bootstrap roles,
  and later chapters deploy to other accounts, so bootstrap every stage account trusting the hub:

    ```bash
    npx cdk bootstrap aws://<stage-account>/<region> --trust <pipeline-account> \
      --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
    ```

- A **source** the pipeline reads from — a CodeCommit repo, a GitHub repo via a CodeStar (CodeConnections)
  connection, or a versioned S3 object.

## Start from a stock CDK app

Nothing about the wrapper changes how you scaffold an app — that's the point:

```bash
npx -y aws-cdk init --language typescript
npm install --include=dev --save @cdklabs/cdk-cicd-wrapper @cdklabs/cdk-cicd-wrapper-cli
```

`@cdklabs/cdk-cicd-wrapper` is the constructs library; `@cdklabs/cdk-cicd-wrapper-cli` provides the
`cdk-cicd` command you'll run.

You will **not** import the wrapper in your `bin/` in the basic flow beyond the opt-in `stageStackName`
helper — the next chapter shows why.

!!! success "Verify"
    Before moving on, confirm your toolchain is ready:

    ```bash
    npx cdk --version                    # AWS CDK v2 CLI is on PATH
    node --version                       # v20 or newer
    npx cdk-cicd --help                  # the wrapper CLI resolves
    ```

    The `npx cdk-cicd --help` call is the important one: it proves the CLI package installed and is
    runnable. If it fails, re-check the `npm install` above.

## Recap

You have a plain `cdk init` app with the wrapper packages installed and your target region bootstrapped —
and you changed nothing in `bin/`. Next, you'll turn this app into a pipeline with a single config file.
