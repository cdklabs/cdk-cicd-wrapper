// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const fs = require("fs-extra");

const generateExperimentalBanner = () => `
:octicons-beaker-24: Experimental\n
!!! warning\n
\tThis submodule is subject to non-backward compatible changes or removal in any future version. Breaking changes
\twill be announced in the release notes, however will result in a minor version bump only.
\n\tWhilst you may use this package, you may need to update your
\tsource code when upgrading to a newer version.`;

const cwd = process.cwd();
const MONOREPO_ROOT = `${cwd}/..`;

const PAGES_YAML_TEMPLATE = "---\nnav:\n";

function generateNavEntry(name, path) {
  return `  - '${name}': ${path}`;
}

function includeBanner(pkg, markdown, stability) {
  return stability !== "stable"
    ? `${generateExperimentalBanner()}\n${markdown}`
    : markdown;
}

const cleanBuildDirectory = () => {
  fs.existsSync(`${cwd}/build`) &&
    fs.rmdirSync(`${cwd}/build`, { recursive: true });
  fs.mkdirSync(`${cwd}/build/docs`, { recursive: true });
};

const copyStaticAssets = () => {
  fs.copySync("content", `${cwd}/build/docs/content`);
  fs.copySync("mkdocs.yml", `${cwd}/build/docs/mkdocs.yml`);
  fs.copySync(
    `${MONOREPO_ROOT}/CONTRIBUTING.md`,
    `${cwd}/build/docs/content/welcome/contributing.md`
  );
};


async function main() {
  cleanBuildDirectory();
  copyStaticAssets();
}

exports.main = main;

(async () => await main())().catch((e) => {
  console.error(e);
  process.exit(1);
});