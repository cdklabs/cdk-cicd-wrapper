# 03 — Turn it into a pipeline

!!! abstract "What you'll build"
    A working pipeline for your Python app, provisioned from a single `cicd.config.ts` — the CI build phase
    runs your Python tooling, then synths.

The opt-in is the same two things as any Autopilot app: a `cicd.config.ts`, and pointing `cdk.json`'s app
command at the wrapper's exec entry. The only Python-specific part is automatic — the wrapper sees a Python
`app` command and renders the Python build phase.

## 1. Describe the pipeline in `cicd.config.ts`

The pipeline definition is TypeScript even though the app is Python (the wrapper is a TS/jsii library). Add
`cicd.config.ts` next to `cdk.json`:

```ts
// cicd.config.ts
import { defineCICD, Repository } from '@cdklabs/cdk-cicd-wrapper';

export default defineCICD({
  application: 'my-python-app',
  repository: Repository.github('my-org/my-python-app'),   // or .codecommit(...) / .s3(...)
  stages: ['dev', 'prod'],
});
```

You do **not** need to set the language — the wrapper detects Python from `cdk.json`. If you ever want to
be explicit (or override detection), set `ci.language`:

```ts
import { defineCICD, CiLanguage, Repository } from '@cdklabs/cdk-cicd-wrapper';

export default defineCICD({
  application: 'my-python-app',
  repository: Repository.github('my-org/my-python-app'),
  stages: ['dev', 'prod'],
  ci: {
    language: CiLanguage.PYTHON,   // omit to auto-detect from cdk.json
  },
});
```

## 2. Point `cdk.json` at the wrapper's exec entry

Keep it to a **single** app entry — the wrapper's `exec` renders your app stacks by default, and the same
entry renders the pipeline when the pipeline itself runs (it sets `CDK_CICD_MODE=pipeline` in the build
environment). The preferred form runs through an npm script so the invocation is deterministic:

```json
{
  "app": "npm run cdk-cicd exec app.py",
  "output": "cdk.out"
}
```

This means your project's `package.json` exposes a `cdk-cicd` script (`"cdk-cicd": "cdk-cicd"`). The exec
entry still names your Python app (`app.py`), so the wrapper detects Python and runs `python3 app.py` under
the hood.

!!! info "Why one entry, and why the mode is inherited"
    There is exactly one `app` command. A plain `cdk synth`/`cdk deploy` renders your **application**
    stacks; the pipeline's own self-mutation step runs the same command with `CDK_CICD_MODE=pipeline` set
    in its environment, which makes it render the **pipeline**. You never add a second entry or an `--app`
    override.

## 3. What the pipeline's Build phase will run

With no `ci.steps` configured, the Build phase for your Python project is:

```
pip install -r requirements.txt
pip-audit -r requirements.txt     # if pip-audit is on PATH; else a warning
mypy .                            # if mypy is on PATH; else a warning
python -m pytest                  # if pytest is on PATH; else a warning
cdk synth                         # the Node aws-cdk CLI running your Python app
```

The managed CodeBuild image is provisioned with **both** the Node and Python runtimes automatically, so
`cdk synth` (Node) and your Python tooling both run.

## 4. Provision the pipeline — once

```bash
npm run cdk-cicd deploy-ci
```

This deploys one pipeline into your hub account from `cicd.config.ts`. On every run:

```
Source → Build (pip install → pip-audit → mypy → pytest → cdk synth) → UpdatePipeline → deploy dev → deploy prod
```

The **UpdatePipeline** stage self-updates the pipeline from `cicd.config.ts`, so after this first
`deploy-ci` you change config and push — the pipeline re-synthesizes itself and applies the change before
the stages it affects.

!!! tip "Pre-flight before you provision"
    Before `deploy-ci`, you can dry-render exactly what it would deploy with `npm run cdk-cicd synth-ci`
    (writes the pipeline assembly to `cdk.out`, no deploy) and `npm run cdk-cicd list-ci --resources` (lists
    the pipeline's stacks + resource-type counts). Both run the same single entry with the pipeline mode
    set.

## Verify

!!! success "Verify"
    - In the **CodePipeline** console, the pipeline shows `Source → Build → UpdatePipeline → deploy dev →
      deploy prod`.
    - The Build stage's log shows `pip install`, `pip-audit`, `mypy`, `pytest`, then `cdk synth` — not
      `npm run` commands.
    - The most recent execution reaches **Succeeded** on every stage.

## Recap

Two files (`cicd.config.ts` + a one-line `cdk.json` change) turned your Python app into a pipeline whose CI
runs your Python tooling. The next chapter shows the same app managed by uv; chapter 05 verifies the whole
thing works, including an optional real provision.
