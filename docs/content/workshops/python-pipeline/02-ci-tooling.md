# 02 — Add the CI tooling

!!! abstract "What you'll build"
    The `audit` / `build` / `test` tooling the pipeline's default build phase runs — declared as normal
    Python dev dependencies, runnable locally exactly as CI runs them.

The wrapper's default Python build phase runs three checks, each only if its tool is on `PATH`:

| Phase | Tool | Command (pip tier) |
|---|---|---|
| audit | `pip-audit` | `pip-audit -r requirements.txt` |
| build | `mypy` | `mypy .` |
| test | `pytest` | `python -m pytest` |

A missing tool logs a warning and the build continues — the checks are encouraged, not enforced. So you opt
into each simply by installing it.

## Declare the dev tools

`cdk init` already put a `pytest` pin (often a stale one, e.g. `pytest==8.4.2`) in `requirements-dev.txt`.
**Replace** the file's contents so pytest is current and `pip-audit`/`mypy` are added:

```
pytest==9.0.3
pip-audit==2.9.0
mypy==1.18.2
```

!!! tip "Pin patched versions"
    Pin tools to a current patched release — the generated `pytest==8.4.2` is exactly the stale pin that
    trips a dependency scanner (GHSA-6w46-j5rx-g56g); `pytest>=9.0.3` clears it. Replacing rather than
    appending avoids leaving the vulnerable pin behind.

## Configure mypy (optional but recommended)

`mypy` is the "build" phase — the closest Python analogue to a compile step. A minimal `mypy.ini`:

```ini
[mypy]
python_version = 3.12
ignore_missing_imports = True
warn_unused_configs = True
```

If you don't add mypy, the build phase logs a warning for the "build" step and continues — nothing breaks.

## The test

`cdk init` ships a `tests/unit/` test using `aws_cdk.assertions`. Make it assert something real about your
stack:

```python
import aws_cdk as cdk
from aws_cdk.assertions import Template

from my_python_app.my_python_app_stack import MyPythonAppStack


def _template() -> Template:
    app = cdk.App()
    stack = MyPythonAppStack(app, "test-stack")
    return Template.from_stack(stack)


def test_bucket_created_and_encrypted():
    template = _template()
    template.resource_count_is("AWS::S3::Bucket", 1)


def test_lambda_created():
    template = _template()
    template.resource_count_is("AWS::Lambda::Function", 1)
```

## Run the checks locally — this is exactly what CI runs

```bash
pip install -r requirements.txt -r requirements-dev.txt
pip-audit -r requirements.txt     # audit
mypy .                            # build
python -m pytest                  # test
```

Because the pipeline runs these same commands, "green locally" means "green in CI" — no divergent wrapper
CLI to reason about.

!!! success "Verify"
    - `pip-audit` reports no vulnerabilities (or only ones you've reviewed).
    - `mypy .` passes.
    - `pytest` passes your unit tests.

## Recap

Your Python tooling is declared and passing locally. The next chapter adds the two files that turn this app
into a pipeline — and the pipeline's Build phase will run exactly the commands you just ran.
