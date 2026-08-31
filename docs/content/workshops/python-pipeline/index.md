# Python CDK apps — from `cdk init` to a running pipeline

This workshop takes a **Python** CDK app from an empty directory to a working CI/CD pipeline, using the
CDK CI/CD Wrapper. Python is a first-class language here: your app stays an ordinary `cdk init --language
python` project — no `package.json`, no wrapper code in `app.py` — and a single `cicd.config.ts` turns it
into a pipeline whose CI build runs your Python tooling (`pip-audit`, `mypy`, `pytest`) before it synths.

> **Your app stays ordinary Python CDK. One `cicd.config.ts` turns it into a pipeline — the wrapper
> detects the language from `cdk.json` and runs `pip`/`uv` tooling in CI, not npm.**

## Why this works — the one thing to understand

The pipeline definition is authored in TypeScript (`cicd.config.ts`), but the **application** it deploys is
your Python app. The wrapper reads `cdk.json`'s `app` command: a `python3 app.py` (or `uv run python
app.py`) command marks the project as Python, so the default CI build phase becomes the Python one instead
of the npm one. The synth itself is the standard `cdk` CLI (a Node binary) shelling out to your Python app
— which is exactly how AWS CDK runs a Python app anyway.

**One consequence, stated up front:** a Python CDK build host needs **both** runtimes — Python (to run
`app.py` and your tools) and Node with the `aws-cdk` CLI (to run `cdk synth`). `pip install aws-cdk-lib`
gives you the CDK *library*, not the `cdk` *command*. The wrapper handles this for you on the managed
pipeline image (it pins both runtimes) and on GitHub Actions (it injects `actions/setup-python`); you only
need both locally.

## Two toolchain tiers

The wrapper supports two Python setups and picks the right one automatically:

| Tier | Marker | Install | Audit / build / test |
|---|---|---|---|
| **Basic (pip)** | `requirements.txt` | `pip install -r requirements.txt` | `pip-audit` / `mypy` / `pytest` |
| **Modern (uv)** | `uv.lock` or `[tool.uv]` in `pyproject.toml` | `uv sync` | `uv run pip-audit` / `uv run mypy` / `uv run pytest` |

Each check runs only when its tool is available; a missing tool logs a warning and the build continues (the
checks are encouraged guidance, not hard gates). `pip-audit` is the dependency-CVE scan; `bandit` is a
separate SAST scanner, not part of the audit phase.

## What you'll learn

1. **Prerequisites** — the two runtimes and the accounts you need.
2. **Scaffold a Python CDK app** — `cdk init --language python`, the file layout, and a real stack.
3. **Add the CI tooling** — `requirements-dev.txt` (or `pyproject.toml`) with `pip-audit`/`mypy`/`pytest`,
   and a local run.
4. **Turn it into a pipeline** — the `cicd.config.ts` + `cdk.json` opt-in, and `deploy-ci`.
5. **The modern (uv) variant** — the same app managed by uv.
6. **Verify it works** — synth locally, read the generated build phase, and (optionally) provision the
   pipeline in a sandbox account.

The two runnable samples this workshop is built on live in the repo:
[`samples/python-pip-proof`](https://github.com/cdklabs/cdk-cicd-wrapper/tree/main/samples/python-pip-proof)
and [`samples/python-uv-proof`](https://github.com/cdklabs/cdk-cicd-wrapper/tree/main/samples/python-uv-proof).

## Target audience

Software / DevOps / Cloud engineers comfortable with AWS CDK and Python. **Expected time:** ~45 minutes.

!!! note "Autopilot is pre-release"
    The wrapper's Autopilot line develops on a dedicated branch and is not yet on the public npm `latest`
    tag. Where a step says `npm install @cdklabs/cdk-cicd-wrapper`, use your pre-release channel (or your
    team's private CodeArtifact repo) until it ships under an alpha tag. The commands and config are
    otherwise exactly what a released version uses.
