# python-pip-proof — pip-tier Python CDK proof

The **basic tier** proof for the wrapper's Python build phase. A minimal but real
CDK-Python app (`cdk init --language python` shape): no `pyproject.toml`, no
lockfile, no `package.json`. Dependencies are pinned in `requirements.txt` /
`requirements-dev.txt`, and `.venv` is the venv convention.

## What it proves

The wrapper detects a Python CDK project (here: `cdk.json` `"app": "python3 app.py"`
plus `requirements.txt`) and runs the pip-tier build phase, warn-not-fail on any
missing tool:

| Phase   | Command                                              |
| ------- | ---------------------------------------------------- |
| install | `pip install -r requirements.txt -r requirements-dev.txt` |
| audit   | `pip-audit -r requirements.txt`                      |
| build   | `mypy .` (configured via `mypy.ini`; warn-and-continue if unconfigured) |
| test    | `python -m pytest`                                   |
| synth   | `cdk synth`                                          |

`cdk synth` requires **both** runtimes on the build host: the Node `aws-cdk` CLI
(shells out per `cdk.json`) and Python `aws-cdk-lib`. `pip install aws-cdk-lib`
does not provide a `cdk` binary.

## Stack

`PythonPipProofStack` — an SSL-enforced, S3-managed-encrypted bucket plus a
Python 3.12 Lambda granted read access. Synths a non-empty template.

## Run locally

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
pip-audit -r requirements.txt
mypy .
python -m pytest
npx --yes aws-cdk@latest synth   # or a locally installed `cdk`
```
