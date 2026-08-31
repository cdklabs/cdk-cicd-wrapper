// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The default CI build commands, shared by every engine so all three render the SAME default build
// phase. When a project configures no `ci.steps`, CI runs the project's own npm scripts
// -- `npm run audit`, `npm run build`, `npm run test` -- rather than a bespoke umbrella CLI. Each is
// run only when the project actually defines that script; a missing script prints a warning that
// points at our recommended checks and CONTINUES (it never fails the build). This keeps the checks as
// encouraged guidance -- discoverable and local==CI, since `npm run audit` behaves identically on a
// laptop -- without enforcing them on a project that has opted out.
//
// The moment a project sets its own `ci.steps`, this default is replaced wholesale (the engines own
// that replacement): a project that customizes CI owns its build phase, warnings included.

/** The npm scripts CI runs by default, in order. */
const DEFAULT_SCRIPTS = ['audit', 'build', 'test'] as const;

/** Where the recommended-checks guidance lives, cited by the missing-script warning. */
const CHECKS_DOCS_URL = 'https://cdklabs.github.io/cdk-cicd-wrapper/developer_guides/audit/';

/**
 * A single shell command that runs `npm run <script>` when the project defines it, and otherwise
 * prints a warning pointing at our recommended checks -- without failing the build.
 *
 * `npm pkg get scripts.<name>` prints the script's value, or `{}` when it is absent, so the presence
 * check needs no `jq` and no parsing of `package.json` by hand. The whole thing is one `sh -c`-safe
 * line so it drops straight into a CodeBuild `commands` array or a CDK Pipelines step.
 */
function runScriptOrWarn(script: string): string {
  // Double-quote the script name INSIDE the message: the message itself is wrapped in single quotes
  // for the echo, so an embedded single quote would close that quote in /bin/sh rather than print.
  const warning =
    `WARNING: no "${script}" script in package.json -- skipping. ` +
    `The cdk-cicd-wrapper recommends a "${script}" script for your CI checks; see ${CHECKS_DOCS_URL}`;
  return `if [ "$(npm pkg get scripts.${script})" != "{}" ]; then npm run ${script}; else echo '${warning}'; fi`;
}

/**
 * The default CI build commands when `ci.steps` is empty: `npm ci`, then each default script
 * (run-or-warn), in order. `cdk synth` is appended by the engine, not here.
 */
export function defaultCiCommands(): string[] {
  return ['npm ci', ...DEFAULT_SCRIPTS.map(runScriptOrWarn)];
}
