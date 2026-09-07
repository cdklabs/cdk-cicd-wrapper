# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

- Make Repo 2 deployment actions invoke the lockfile-installed `cdk-cicd` CLI through an npm script
  instead of allowing `npx` to resolve a registry version at deployment time.
- Use explicit non-secret placeholders for KMS key examples and test fixtures.
