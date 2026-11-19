# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `devopsAgent` in `defineCICD` and `defineDeployment`: open an AWS DevOps Agent investigation every
  time a pipeline action fails (EventBridge rule plus a Lambda calling `CreateBacklogTask`, scoped to one
  Agent Space). See the DevOps Agent guide.
- `cdk-cicd mcp`: an MCP server (stdio) in the CLI with `check_config` and `describe_pipeline`, which read
  `cicd.config.ts`/`deploy.config.ts` through the same loader and validation as the CLI.

### Removed

- The Python MCP debugger server (`mcp-servers/debugger-mcp`). It read the Blueprint (0.x) configuration
  surface and reported valid Autopilot projects as misconfigured, and against current releases of its MCP
  dependency five of its six tools failed at import. It was never published; `cdk-cicd mcp` replaces it.

### Fixed

- `cdk-cicd list-ci` and `cdk-cicd synth-ci` pass their flags to cdk (`npm run cdk -- synth ...`). Without the
  `--`, npm consumed `--all` and `--output`: `list-ci` synthesized into the project's `cdk.out` instead of its
  temporary directory, and `synth-ci --output` ignored the directory.
- Make Repo 2 deployment actions invoke the lockfile-installed `cdk-cicd` CLI through an npm script
  instead of allowing `npx` to resolve a registry version at deployment time.
- Use explicit non-secret placeholders for KMS key examples and test fixtures.
