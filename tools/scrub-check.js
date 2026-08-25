// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Pre-publish scrub gate for this public cdklabs repo. Fails (exit 1) if either:
 *   1. an Amazon-internal tool name or internal-only hostname appears in a tracked file, or
 *   2. the committed integ snapshot carries a 12-digit AWS account id that is not a sanctioned
 *      placeholder (guards against re-baking a real account on `integ:update`).
 *
 * Curated to be low-false-positive: it does NOT match generic words (adapter, apollo, coral, ...)
 * or the public docs.aws.amazon.com / aws.amazon.com hosts. Run via `npx projen scrub-check`.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Internal tool names / internal-only hosts. Word-boundary where the token is also an English word.
const INTERNAL = [
  /\bisengard\b/i,
  /\bmidway\b/i,
  /ada\s+credentials/i,
  /brazil-build/i,
  /brazil\s+workspace/i,
  /code\.amazon\.com/i,
  /\.amazon\.dev/i,
  /w\.amazon\.com/i,
  /tt\.amazon\.com/i,
  /issues\.amazon\.com/i,
  /sim\.amazon\.com/i,
  /quip-amazon/i,
  /broadcast\.amazon/i,
  /\.corp\.amazon\.com/i,
];

// Files that legitimately describe findings/decisions (they reference issues by name) or are large
// data blobs, and this script itself. Excluded from the internal-reference scan.
const EXCLUDE = new Set(['findings.json', 'task.md', 'NOTICE', 'OSS_License_Summary.csv', 'tools/scrub-check.js']);
const EXCLUDE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.zip', '.lock', '.csv']);

// Sanctioned placeholder AWS account ids allowed to appear in snapshots/fixtures.
const PLACEHOLDER_ACCOUNTS = new Set([
  '123456789012', '234567890123', '345678901234', '456789012345',
  '111111111111', '000000000000',
]);
const SNAPSHOT_DIRS = ['packages/@cdklabs/cdk-cicd-wrapper/test/integration'];

function trackedFiles() {
  return execSync('git ls-files', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean);
}

const violations = [];

// Check 1: internal references.
for (const f of trackedFiles()) {
  if (EXCLUDE.has(f) || EXCLUDE_EXT.has(path.extname(f).toLowerCase())) continue;
  let text;
  try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
  for (const re of INTERNAL) {
    const m = text.match(re);
    if (m) {
      const line = text.slice(0, m.index).split('\n').length;
      violations.push(`internal-ref: ${f}:${line} matches ${re}`);
    }
  }
}

// Check 2: non-placeholder account ids in committed snapshots.
function walk(d, out) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
}
const snapFiles = [];
for (const d of SNAPSHOT_DIRS) walk(d, snapFiles);
for (const f of snapFiles) {
  if (EXCLUDE_EXT.has(path.extname(f).toLowerCase())) continue;
  let text;
  try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
  const seen = new Set();
  for (const m of text.matchAll(/arn:aws[a-z-]*:[a-z0-9-]*:[a-z0-9-]*:([0-9]{12}):/g)) seen.add(m[1]);
  for (const m of text.matchAll(/[a-z]+-([0-9]{12})-[a-z]{2}-[a-z]+-[0-9]/g)) seen.add(m[1]);
  for (const id of seen) {
    if (!PLACEHOLDER_ACCOUNTS.has(id)) {
      violations.push(`account-id: ${f} contains a non-placeholder 12-digit account id`);
      break;
    }
  }
}

if (violations.length) {
  console.error('scrub-check FAILED:\n' + violations.map((v) => '  - ' + v).join('\n'));
  console.error('\nRemove internal references / real account ids before publishing (see SECURITY & CLAUDE.md).');
  process.exit(1);
}
console.log('scrub-check OK: no internal references or non-placeholder account ids found.');
