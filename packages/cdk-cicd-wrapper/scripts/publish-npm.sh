#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. SPDX-License-Identifier: Apache-2.0
# Install 3rd party deps and publish the NPM Package to the Private Registry (Env Vars taken from Github Workflow)

PACKAGE_VERSION=$(node -p -e "require('./package.json').version")
PACKAGE_NAME=$(node -p -e "require('./package.json').name")
FOUND_VERSION=$(npm view --json "${PACKAGE_NAME}" versions | jq -e "if type!=\"array\" then [.] else . end | .|any(. == \"${PACKAGE_VERSION}\")")

if [[ "${FOUND_VERSION}" == "true" ]]
then
  echo "Version $PACKAGE_VERSION exists. Exiting..."
  exit 0
else
  set -e
  npm publish
fi