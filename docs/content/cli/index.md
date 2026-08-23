# CLI Reference

The `cdk-cicd` CLI ships in the `@cdklabs/cdk-cicd-wrapper-cli` package. Install it as a dev
dependency (or run it via `npx`) and run any command with `--help` to see its full flag set:

```bash
npx cdk-cicd <command> --help
```

> **Experimental.** The `v3` pipeline commands below are pre-release and still evolving; flags and
> behaviour may change before the `1.0` release.

## Project setup & checks

| Command | Description |
| --- | --- |
| `configure` | Scaffold/generate project configuration for a CDK CI/CD project. |
| `validate` | Validate the project's lock files (`--fix` to repair). |
| `license` | Check and generate the third-party license `NOTICE` (`--fix` to write). |
| `check-dependencies` | Check dependencies (npm and/or Python) for a project. |
| `security-scan` | Run the security scanners (`--bandit`, `--semgrep`, `--shellcheck`). |
| `compliance-bucket` | Delete a pipeline's artifact bucket and key together with the stack (for throwaway pipelines). |

## v3 pipeline (experimental)

| Command | Description |
| --- | --- |
| `exec` | Run a CDK app under the wrapper — the single entry point that activates the pipeline for both engines, reading the engine and stages from `cicd.config`. |
| `synth` | Synthesize the app per stage/region (`--stage`, or `--all` for full CI validation). |
| `deploy` | Deploy a stage, with a drift/assembly check against the resolved target account and region. |
| `check` | Run the drift/assembly checks against a synthesized manifest without deploying. |
| `migrate` | Generate a v3 `cicd.config.ts` from an existing v2 app (`--entry`, `--application`, `--dry-run`). |

Some commands (for example the pipeline app / deployment-CI handlers) are invoked by the pipeline
itself rather than run directly by users.

For the authoritative, always-current flag list, prefer `cdk-cicd <command> --help`.
