# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `devopsAgent` in `defineCICD` and `defineDeployment`: connect the pipeline to AWS DevOps Agent, off by
  default and configurable per level. `investigations` opens an investigation per failed action (filter by
  `stages`, set `priority`). `knowledge` publishes the failure-investigation skill and a generated pipeline map
  into the Agent Space. See the DevOps Agent guide.
- `cdk-cicd mcp`: an MCP server (stdio) in the CLI with `check_config` and `describe_pipeline`, which read
  `cicd.config.ts`/`deploy.config.ts` through the same loader and validation as the CLI.

### Removed

- The Python MCP debugger server (`mcp-servers/debugger-mcp`). It read the Blueprint (0.x) configuration
  surface and reported valid Autopilot projects as misconfigured, and against current releases of its MCP
  dependency five of its six tools failed at import. It was never published; `cdk-cicd mcp` replaces it.
