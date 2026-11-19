# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `devopsAgent` in `defineCICD` and `defineDeployment`: open an AWS DevOps Agent investigation every
  time a pipeline action fails (EventBridge rule plus a Lambda calling `CreateBacklogTask`, scoped to one
  Agent Space). See the DevOps Agent guide.

### Fixed

- Make Repo 2 deployment actions invoke the lockfile-installed `cdk-cicd` CLI through an npm script
  instead of allowing `npx` to resolve a registry version at deployment time.
- Use explicit non-secret placeholders for KMS key examples and test fixtures.
