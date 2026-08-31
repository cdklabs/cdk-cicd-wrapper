# 01 — Scaffold a Python CDK app

!!! abstract "What you'll build"
    A plain `cdk init --language python` app with one real stack — the untouched starting point the
    wrapper turns into a pipeline.

## Initialize

In an empty directory:

```bash
mkdir my-python-app && cd my-python-app
cdk init app --language python
```

This produces the standard Python CDK layout:

```
my-python-app/
├── app.py                       # cdk.App() -> Stack -> app.synth()
├── cdk.json                     # "app": "python3 app.py"
├── requirements.txt             # aws-cdk-lib, constructs
├── requirements-dev.txt         # pytest (dev deps)
├── my_python_app/
│   └── my_python_app_stack.py   # your stack
├── tests/unit/test_my_python_app_stack.py
└── .gitignore                   # .venv, cdk.out, __pycache__, ...
```

`cdk.json` already points at your Python app — this is the line the wrapper reads to detect the language:

```json
{
  "app": "python3 app.py",
  "output": "cdk.out"
}
```

!!! note "Your `cdk.json` will be larger — that's expected"
    `cdk init` also writes `watch` and `context` blocks into `cdk.json`. Only the `app` line matters for
    this workshop (it's what the wrapper reads); leave the rest as generated.

## `app.py` stays plain

No wrapper import, no builder — exactly what `cdk init` gave you:

```python
#!/usr/bin/env python3
import aws_cdk as cdk

from my_python_app.my_python_app_stack import MyPythonAppStack

app = cdk.App()
MyPythonAppStack(app, "MyPythonAppStack")
app.synth()
```

!!! note "Names come from your project name"
    `cdk init` derives the module (`my_python_app`), class (`MyPythonAppStack`), and stack id from the
    directory name — so yours will differ if your directory isn't `my-python-app`. Keep the generated
    names; the snippets below use these for concreteness.

## Put something real in the stack

Give it enough to synthesize a non-empty template — an S3 bucket and a Lambda that reads it:

```python
from aws_cdk import (
    Stack,
    aws_s3 as s3,
    aws_lambda as _lambda,
    RemovalPolicy,
)
from constructs import Construct


class MyPythonAppStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        bucket = s3.Bucket(
            self,
            "DataBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            enforce_ssl=True,
            encryption=s3.BucketEncryption.S3_MANAGED,
            removal_policy=RemovalPolicy.DESTROY,
        )

        handler = _lambda.Function(
            self,
            "Handler",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="index.handler",
            code=_lambda.Code.from_inline(
                "def handler(event, context):\n    return {'statusCode': 200}\n"
            ),
            environment={"BUCKET_NAME": bucket.bucket_name},
        )

        bucket.grant_read(handler)
```

## Set up the environment and synth once

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cdk synth
```

You should see a `cdk.out/` with a non-empty template.

!!! success "Verify"
    - `cdk synth` prints a template with your bucket and Lambda (no errors).
    - `cdk.out/MyPythonAppStack.template.json` exists and is non-empty.

## Recap

You have a stock Python CDK app that synthesizes — no wrapper involvement yet. The next chapter adds the CI
tooling the pipeline will run, then chapter 03 turns it into a pipeline.
