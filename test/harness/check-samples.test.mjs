// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Unit test for the sample-harness runtime policy. Runs with the built-in node test runner
// (`node --test test/harness/check-samples.test.mjs`) -- no jest wiring, no sample-file edits.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPolicy, buildRuntimeIndex, classifyRuntime, enumMemberToId, hasOptOut, ALLOW } from './check-samples.mjs';

const index = buildRuntimeIndex(loadPolicy());
// Fix "today" well past nodejs20.x's 2026-04-30 deprecation so the EOL branch is deterministic.
const asOf = '2026-08-27';

test('enum member -> runtime identifier', () => {
  assert.equal(enumMemberToId('NODEJS_20_X'), 'nodejs20.x');
  assert.equal(enumMemberToId('PYTHON_3_13'), 'python3.13');
  assert.equal(enumMemberToId('GO_1_X'), undefined);
});

test('EOL runtime fails without an opt-out', () => {
  const v = classifyRuntime('nodejs20.x', { index, asOf });
  assert.equal(v.level, 'FAIL');
  assert.match(v.message, /EOL runtime 'nodejs20\.x'/);
});

test('EOL runtime is downgraded to WARN with an opt-out', () => {
  const v = classifyRuntime('nodejs20.x', { index, optOut: true, asOf });
  assert.equal(v.level, 'WARN');
  assert.match(v.message, new RegExp(ALLOW));
});

test('latest supported runtime produces no finding', () => {
  assert.equal(classifyRuntime('nodejs22.x', { index, asOf }), null);
  assert.equal(classifyRuntime('python3.13', { index, asOf }), null);
});

test('supported-but-not-latest runtime warns', () => {
  const v = classifyRuntime('python3.12', { index, asOf });
  assert.equal(v.level, 'WARN');
  assert.match(v.message, /not the latest/);
});

test('runtime absent from the table warns to prompt a table update', () => {
  const v = classifyRuntime('nodejs99.x', { index, asOf });
  assert.equal(v.level, 'WARN');
  assert.match(v.message, /not in runtime-policy\.json/);
});

test('opt-out is detected on the same or preceding line', () => {
  const lines = ['// cdk-cicd:allow-runtime legacy', 'runtime: Runtime.NODEJS_20_X,', 'const x = 1;'];
  assert.equal(hasOptOut(lines, 1), true); // marker on preceding line
  assert.equal(hasOptOut(lines, 2), false); // no marker near line 2
});
