# python-uv-proof — uv-tier Python CDK proof

The **modern tier** proof for the wrapper's Python build phase, managed by
[uv](https://docs.astral.sh/uv/). A single Rust binary that manages the
interpreter + venv (`uv sync`), installs 10–100× faster than pip (cutting
CodeBuild minutes on every self-mutation), and produces a real `uv.lock` the
audit gate can verify. This is the 2026 default for services — and a CDK
pipeline is a service.

Dependencies live in `pyproject.toml` (PEP 621); dev tools are in the
`dev` dependency group. No `package.json`.

## What it proves

The wrapper detects a Python CDK project (here: `cdk.json`
`"app": "uv run python app.py"` plus `pyproject.toml` / `uv.lock`) and runs the
uv-tier build phase, warn-not-fail on any missing tool:

| Phase   | Command             |
| ------- | ------------------- |
| install | `uv sync`           |
| audit   | `uv run pip-audit`  |
| build   | `uv run mypy .`     |
| test    | `uv run pytest`     |
| synth   | `cdk synth`         |

`cdk synth` requires **both** runtimes on the build host: the Node `aws-cdk` CLI
(shells out per `cdk.json`) and Python `aws-cdk-lib`.

## Stack

`PythonUvProofStack` — an SSL-enforced, S3-managed-encrypted bucket plus a
Python 3.12 Lambda granted read access. Synths a non-empty template.

## Run locally

```bash
uv sync
uv run pip-audit
uv run mypy .
uv run pytest
npx --yes aws-cdk@latest synth   # or a locally installed `cdk`
```

## uv.lock

`uv.lock` is committed and pins the exact resolved dependency graph. Regenerate
it with `uv lock`. If uv is unavailable, `uv sync` bootstraps it on first run.
