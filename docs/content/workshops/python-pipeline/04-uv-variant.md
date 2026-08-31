# 04 — The modern (uv) variant

!!! abstract "What you'll build"
    The same app, managed by [uv](https://docs.astral.sh/uv/) instead of pip — a lockfile-first workflow
    that the wrapper detects and runs through `uv run`.

uv is a single fast Rust binary that replaces pip/venv/pip-tools. The wrapper picks the uv tier
automatically when it sees a `uv.lock` or a `[tool.uv]` table in `pyproject.toml`.

## Convert the project to uv

Replace `requirements.txt`/`requirements-dev.txt` with a `pyproject.toml`:

```toml
[project]
name = "my-python-app"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "aws-cdk-lib>=2.266.0,<3.0.0",
    "constructs>=10.5.0,<11.0.0",
]

[dependency-groups]
dev = [
    "pytest==9.0.3",
    "pip-audit==2.9.0",
    "mypy==1.18.2",
]

[tool.mypy]
python_version = "3.12"
ignore_missing_imports = true
warn_unused_configs = true

[tool.pytest.ini_options]
testpaths = ["tests"]
```

Generate the lockfile:

```bash
uv lock          # writes uv.lock — commit this
uv sync          # creates .venv and installs from the lock
```

Commit `uv.lock` — it is the reproducible install manifest the audit gate verifies, and it is the marker
that tells the wrapper to use the uv tier.

## Point `cdk.json` at the uv-run app

```json
{
  "app": "npm run cdk-cicd exec uv run python app.py",
  "output": "cdk.out"
}
```

The `uv run python app.py` interpreter command is what the wrapper detects as the uv tier.

## What the pipeline's Build phase becomes

For the uv tier the default Build phase is the same checks through uv:

```
uv sync
uv run pip-audit
uv run mypy .
uv run pytest
cdk synth
```

On GitHub Actions the wrapper additionally injects `astral-sh/setup-uv` into the generated workflow (and
`actions/setup-python` for both tiers); on the managed CodeBuild image, Python is pinned alongside Node.

## Run it locally

```bash
uv sync
uv run pip-audit
uv run mypy .
uv run pytest
cdk synth
```

!!! success "Verify"
    - `uv.lock` is present and committed.
    - `uv run pytest` passes and `cdk synth` produces a non-empty template.
    - The pipeline's Build log (after `deploy-ci`) shows `uv sync` / `uv run …`, not `pip install`.

## Recap

Same app, uv-managed — the only changes are `pyproject.toml` + `uv.lock` and the `uv run python` app
command. The wrapper switched tiers automatically. The final chapter verifies the whole flow, including an
optional real pipeline provision.
