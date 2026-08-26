# Migration Guide

Migrating an existing `PipelineBlueprint.builder()…synth(app)` (Blueprint) project to the current
`cicd.config.ts`-based API:

1. Run `npx cdk-cicd migrate --entry <your-entry-file> --application <name>` to scaffold a starting
   `cicd.config.ts` — see [Getting Started § Migrating an existing Blueprint project](index.md#migrating-an-existing-blueprint-project)
   for the exact command and what it does (and doesn't) extract for you.
2. Read the full Blueprint→v3 mapping table and the **Preserving already-deployed resources** section in the
   repository's [`MIGRATION.md`](https://github.com/cdklabs/cdk-cicd-wrapper/blob/main/MIGRATION.md)
   before switching a production pipeline over — getting the CloudFormation stack name right is what
   decides whether your existing resources are updated in place or recreated.

Starting a brand-new project instead? See [Getting Started](index.md).
