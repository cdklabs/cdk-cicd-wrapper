#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// post-compile helper. projen (>=0.104) runs task commands through a portable shell subset that has no
// `for`/`if` compound commands, so the copy logic lives here instead of inline in tasks.json.
//
// jsii-docgen reads the `.jsii` assembly of every dependency from THIS package's node_modules, but yarn
// hoists `cdk-nag`, `cdk-pipelines-github` and the app-staging alpha to the monorepo root. The bundled
// `yaml` dependency must also be present locally for packaging. Copy each one when it exists at the
// root; a missing source is skipped silently, matching the previous `cp ... 2>/dev/null` behaviour.

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..', '..', 'node_modules');
const local = path.resolve(__dirname, '..', 'node_modules');
const deps = ['cdk-nag', 'cdk-pipelines-github', '@aws-cdk/app-staging-synthesizer-alpha', 'yaml'];

for (const dep of deps) {
  const source = path.join(root, dep);
  if (!fs.existsSync(source)) continue;
  const target = path.join(local, dep);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, force: true, dereference: true });
}
