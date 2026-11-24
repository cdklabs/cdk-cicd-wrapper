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
- `cdk-cicd init`: writes `cicd.config.ts`, points `cdk.json` at `cdk-cicd exec`, warns about a stack `env`
  line left commented out, and prints the remaining commands. `--existing` imports a CodeCommit repository
  you created; `--dry-run` previews.
- `cdk-cicd synth` now warns about a stack that binds no AWS account, and `--require-account` makes it fail.
- `resolveDeploymentCompliance`: compliance logging in container mode can take its account and Region from
  `config/<stage>.json`.

### Changed

- `cdk-cicd init` no longer defaults `--qualifier` to the CDK's `hnb659fds`. Without `--qualifier` it keeps a
  qualifier `cdk.json` already sets as `@aws-cdk/core:bootstrapQualifier`, and otherwise uses the one
  `defineCICD` derives from `application`. It writes the qualifier into that `cdk.json` context, which is the
  only place the pipeline stack reads one, so the stages and the pipeline stack share one bootstrap, and for a
  qualifier other than `hnb659fds` it sets `toolkitStackName` to `CDKToolkit-<qualifier>`, as the 0.x
  `configure` did, so a `cdk bootstrap` run in the project never rewrites the stock `CDKToolkit` stack. It
  prints the bootstrap command. Pass `--qualifier <q>` for a qualifier your accounts already have. Projects
  already set up with `init` keep the `qualifier` they have.
- The CodePipeline engine's Build passes `--require-account`, so a stack without an account fails in Build
  rather than at its first deploy stage. Only pipelines whose deploy would have failed are affected.
- The CLI loads a project on TypeScript 7 (the current `cdk init` default) or with a NodeNext tsconfig,
  with no TypeScript pin and no tsconfig change. It uses its own TypeScript only when the project's is 7 or
  later, and leaves out its `module: commonjs` override only for a `node16`/`nodenext` `module`.

### Fixed

- Container mode: one target with an invalid `aws` block fails only its own deploy. Plan and the other
  targets carry on.
- Container mode: the deploy step checks that the pinned CLI supports `deploy --fingerprint-out` before
  it deploys.

### Removed

- The Python MCP debugger server (`mcp-servers/debugger-mcp`). It read the Blueprint (0.x) configuration
  surface and reported valid Autopilot projects as misconfigured, and against current releases of its MCP
  dependency five of its six tools failed at import. It was never published; `cdk-cicd mcp` replaces it.
