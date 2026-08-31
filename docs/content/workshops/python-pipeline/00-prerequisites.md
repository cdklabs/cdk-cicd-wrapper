# 00 — Prerequisites

!!! abstract "What you need before you start"
    - Both runtimes on your machine.
    - The wrapper CLI available.
    - An AWS account you can deploy the pipeline into.

## Both runtimes

A Python CDK project needs two runtimes, because `cdk synth` runs the Node `aws-cdk` CLI, which in turn
runs your Python `app.py`:

- **Python 3.12+** — to run `app.py` and your tooling (`pytest`, `mypy`, `pip-audit`). Check: `python3 --version`.
- **Node.js 20+ and the `aws-cdk` CLI** — to run `cdk synth`/`cdk deploy`. Check: `node --version` and `cdk --version`. Install (or update) the CLI with `npm install -g aws-cdk@latest` if you don't have it.

!!! warning "Keep the `aws-cdk` CLI current"
    The `aws-cdk` **CLI** and the `aws-cdk-lib` **library** version each other through a cloud-assembly
    schema. This workshop's `aws-cdk-lib>=2.266.0` emits a schema that needs CLI **≥ 2.1139.0** — an older
    global CLI fails `cdk synth` at the last step with *"Cloud assembly schema version mismatch … you need
    at least CLI version 2.1139.0"*. If you see that, run `npm install -g aws-cdk@latest` (or pin
    `aws-cdk-lib` to a version your CLI supports). Check with `cdk --version`.

!!! info "Why both"
    `pip install aws-cdk-lib` installs the CDK **library** your Python code imports — it does **not** give
    you a `cdk` command. The `cdk` CLI is a Node package. On the pipeline the wrapper provisions both
    runtimes for you; locally you install both.

## The modern tier (optional)

If you want the uv tier (chapter 04), install [uv](https://docs.astral.sh/uv/): `curl -LsSf
https://astral.sh/uv/install.sh | sh`. uv manages the Python interpreter and virtualenv itself, so with uv
you don't strictly need a separate Python install — but you still need Node + the `aws-cdk` CLI.

## The wrapper CLI

The pipeline is driven by the `cdk-cicd` CLI. Because Autopilot is pre-release, install it from your
pre-release channel or private CodeArtifact repo:

```bash
npm install @cdklabs/cdk-cicd-wrapper @cdklabs/cdk-cicd-wrapper-cli
```

!!! note "This adds a small `package.json`"
    Your **application** stays pure Python — but the wrapper CLI itself is a Node tool, so the project
    carries a minimal `package.json` to install and invoke it. That's the one Node touchpoint; your CDK
    app code, dependencies, and tests remain Python.

## An AWS account

You need one AWS account (the "hub" account the pipeline lives in) that is **CDK-bootstrapped**:

```bash
cdk bootstrap aws://<ACCOUNT_ID>/<REGION>
```

For a multi-stage promotion (dev → prod across accounts), bootstrap each target account trusting the hub —
the standard CDK Pipelines cross-account setup. This workshop uses a single account for simplicity.
