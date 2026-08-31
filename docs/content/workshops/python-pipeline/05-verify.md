# 05 — Verify it works

!!! abstract "What you'll do"
    Prove the Python pipeline end to end — first with fast local checks (no AWS needed), then optionally by
    provisioning the real pipeline in a sandbox account, and finally clean up.

## Level 1 — local, no AWS

These prove the app and its CI phase without touching AWS:

```bash
# pip tier
pip install -r requirements.txt -r requirements-dev.txt
pip-audit -r requirements.txt && mypy . && python -m pytest && cdk synth

# uv tier
uv sync && uv run pip-audit && uv run mypy . && uv run pytest && cdk synth
```

Green here means the exact commands the pipeline's Build phase runs all pass, and the app synthesizes a
non-empty template.

## Level 2 — read the generated build phase

Confirm the pipeline will run the Python phase (not npm) by dry-rendering the pipeline assembly the way
`deploy-ci` would, without deploying:

```bash
npm run cdk-cicd synth-ci                 # writes the pipeline assembly to cdk.out
npm run cdk-cicd list-ci --resources      # lists the pipeline stacks + resource counts
```

Then inspect the synthesized pipeline's build commands in `cdk.out` — you should see `pip install` /
`pip-audit` / `mypy` / `pytest` (or the `uv run …` variants), followed by `cdk synth`, and **no** `npm run`
build commands.

## Level 3 — provision the real pipeline (optional, needs AWS)

In a bootstrapped sandbox account:

```bash
npm run cdk-cicd deploy-ci
```

Then in the **CodePipeline** console:

- The pipeline shows `Source → Build → UpdatePipeline → deploy dev → deploy prod`.
- The **Build** stage's CodeBuild log shows the managed image installing **both** Python and Node runtimes,
  then running your Python tooling and `cdk synth`.
- The run reaches **Succeeded** on every stage.

## Cleanup

Avoid leaving billable resources behind:

```bash
# Destroy the deployed application stacks (per stage/account as applicable)
cdk destroy --all

# Delete the pipeline stack itself (from the hub account)
# via the CloudFormation console, or a disposable pipeline if you provisioned one
```

Locally, `.venv/` and `cdk.out/` are already git-ignored; remove them if you want a clean tree.

## Recap — the whole flow

You took a stock `cdk init --language python` app, added Python CI tooling, and turned it into a pipeline
with one `cicd.config.ts` and a one-line `cdk.json` change — no wrapper code in `app.py`, no `package.json`
for the app itself beyond the wrapper CLI. The wrapper detected the language and ran your Python tooling in
CI, on all three engines, with both runtimes provisioned for you.

!!! tip "Want it verified independently?"
    The two samples this workshop is built on —
    [`samples/python-pip-proof`](https://github.com/cdklabs/cdk-cicd-wrapper/tree/main/samples/python-pip-proof)
    and [`samples/python-uv-proof`](https://github.com/cdklabs/cdk-cicd-wrapper/tree/main/samples/python-uv-proof)
    — are runnable end to end and are exercised by the wrapper's own test suite, so you can diff your
    project against a known-good reference.
