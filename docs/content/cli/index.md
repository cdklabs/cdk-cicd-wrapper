# CLI Reference

The `cdk-cicd` CLI ships in the `@cdklabs/cdk-cicd-wrapper-cli` package. Install it as a dev
dependency (or run it via `npx`) and run any command with `--help` to see its full flag set:

```bash
npx cdk-cicd <command> --help
```

> **Experimental.** The Autopilot pipeline commands below are pre-release and still evolving; flags and
> behaviour may change before the `1.0` release.

## Project setup & checks

| Command | Description |
| --- | --- |
| `configure` | Scaffold/generate project configuration for a CDK CI/CD project. |
| `validate` | Validate the project's lock files (`--fix` to repair). |
| `license` | Check and generate the third-party license `NOTICE` (`--fix` to write). |
| `check-dependencies` | Check dependencies (npm and/or Python) for a project. |
| `security-scan` | Run the security scanners (`--bandit`, `--semgrep`, `--shellcheck`). |
| `compliance-bucket` | Configure the compliance log bucket (creates/updates it and its bucket policy; does not delete anything). |

## Autopilot pipeline (experimental)

| Command | Description |
| --- | --- |
| `exec` | Run a CDK app under the wrapper — the **single** `cdk.json` entry point for all engines. It reads engine/stages from `cicd.config` and renders the application stacks by default, or the pipeline when `CDK_CICD_MODE=pipeline` is set in the environment (no `--app` override). |
| `synth` | Synthesize the app per stage/region (`--stage`, or `--all` for full CI validation). |
| `deploy` | Synth, drift-check, and deploy a stage across its regions. |
| `synth-ci` | Synthesize the **pipeline** without deploying — the safe pre-flight for `deploy-ci`. Runs the same single `cdk-cicd exec` entry with `CDK_CICD_MODE=pipeline` (via `npm run cdk synth`) into `--output` (default `cdk.out`) so you can inspect or `cdk diff` it first. |
| `list-ci` | List the stacks (and, with `--resources`, a per-stack resource-type breakdown) of the **pipeline** `deploy-ci` would provision — a quick inventory that leaves no `cdk.out` behind. |
| `deploy-ci` | Provision the pipeline itself into the hub account, from `cicd.config.ts` alone (the one command a user runs by hand; everything after it is the pipeline deploying the application). Runs `npm run cdk deploy --all` with `CDK_CICD_MODE=pipeline` — no `--app` override. `--disposable` deletes the pipeline's artifact bucket and key together with the stack. Preview it first with `synth-ci` / `list-ci`. |
| `check` | Run the default-on CI checks (`validate`, `audit`, `license`, `security`). |
| `migrate` | Generate an Autopilot `cicd.config.ts` from an existing 0.4.x `PipelineBlueprint` entry file (`--entry`, `--application`, `--dry-run`). |

For the authoritative, always-current flag list, prefer `cdk-cicd <command> --help`.
