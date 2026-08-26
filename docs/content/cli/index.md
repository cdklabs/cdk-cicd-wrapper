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
| `exec` | Run a CDK app under the wrapper — the single entry point that activates the pipeline for both engines, reading the engine and stages from `cicd.config`. |
| `synth` | Synthesize the app per stage/region (`--stage`, or `--all` for full CI validation). |
| `deploy` | Synth, drift-check, and deploy a stage across its regions. |
| `deploy-ci` | Provision the pipeline itself into the hub account, from `cicd.config.ts` alone (the one command a user runs by hand; everything after it is the pipeline deploying the application). `--disposable` deletes the pipeline's artifact bucket and key together with the stack (for throwaway pipelines). |
| `check` | Run the default-on CI checks (`validate`, `audit`, `license`, `security`). |
| `migrate` | Generate an Autopilot `cicd.config.ts` from an existing 0.4.x `PipelineBlueprint` entry file (`--entry`, `--application`, `--dry-run`). |

Some commands (for example the pipeline app / deployment-CI handlers) are invoked by the pipeline
itself rather than run directly by users.

For the authoritative, always-current flag list, prefer `cdk-cicd <command> --help`.
