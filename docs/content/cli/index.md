# CLI Reference

The `cdk-cicd` CLI ships in the `@cdklabs/cdk-cicd-wrapper-cli` package. Install it as a dev
dependency (or run it via `npx`) and run any command with `--help` to see its full flag set:

```bash
npx cdk-cicd <command> --help
```

> The Autopilot pipeline commands below are still evolving. A change that breaks a flag or a behaviour ships
> as a new major version; the [release notes](https://github.com/cdklabs/cdk-cicd-wrapper/releases) list them.

## Project setup & checks

| Command | Description |
| --- | --- |
| `configure` | Blueprint (0.x) only. Scaffold/generate project configuration for a CDK CI/CD project. See [Configure](cli_configure.md). |
| `validate` | Validate the project's lock file against the checksum recorded in `package-verification.json` (`--fix` records a new checksum). |
| `license` | Check and generate the third-party license `NOTICE` (`--fix` to write). |
| `check-dependencies` | Check dependencies (npm and/or Python) for a project. |
| `security-scan` | Run the security scanners (`--bandit`, `--semgrep`, `--shellcheck`). |
| `compliance-bucket` | Configure the compliance log bucket (creates/updates it and its bucket policy; does not delete anything). |
| `completion` | Generate a shell completion script for `cdk-cicd`. |

## Autopilot pipeline (experimental)

| Command | Description |
| --- | --- |
| `init` | Make an existing CDK app (for example a fresh `cdk init app`) an Autopilot app: writes `cicd.config.ts` and points `cdk.json` at `cdk-cicd exec` (`--source`, `--repository`, `--stages`, `--dry-run`). |
| `exec` | Run a CDK app under the wrapper — the **single** `cdk.json` entry point for all engines. It reads engine/stages from `cicd.config` and renders the application stacks by default, or the pipeline when `CDK_CICD_MODE=pipeline` is set in the environment (no `--app` override). |
| `synth` | Synthesize the app per stage/region (`--stage`, or `--all` for full CI validation). |
| `deploy` | Synth, drift-check, and deploy a stage across its regions. |
| `synth-ci` | Synthesize the **pipeline** without deploying — the safe pre-flight for `deploy-ci`. Runs the same single `cdk-cicd exec` entry with `CDK_CICD_MODE=pipeline` (via `npm run cdk synth`) and synthesizes the pipeline into `cdk.out`, so you can inspect or `cdk diff` it first. |
| `list-ci` | List the stacks (and, with `--resources`, a per-stack resource-type breakdown) of the **pipeline** `deploy-ci` would provision — a quick inventory that leaves no `cdk.out` behind. |
| `deploy-ci` | Provision the pipeline itself into the hub account, from `cicd.config.ts` alone (the one command a user runs by hand; everything after it is the pipeline deploying the application). Runs `npm run cdk deploy --all` with `CDK_CICD_MODE=pipeline` — no `--app` override. `--disposable` deletes the pipeline's artifact bucket and key together with the stack. Preview it first with `synth-ci` / `list-ci`. |
| `check` | Run the default-on CI checks (`validate`, `audit`, `license`, `security`). |
| `pipeline` | The steps the container-mode CD pipeline runs itself: `pipeline plan` decides which CD pipeline stages have changes to deploy, and `pipeline fingerprint` computes a deployment target's fingerprint. |
| `migrate` | Generate an Autopilot `cicd.config.ts` from an existing 0.4.x `PipelineBlueprint` entry file (`--entry`, `--application`, `--dry-run`). |
| `mcp` | Serve `check_config` and `describe_pipeline` to a coding agent over the Model Context Protocol (stdio). See the [MCP server guide](../mcp/index.md). |

For the authoritative, always-current flag list, prefer `cdk-cicd <command> --help`.
