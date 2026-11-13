// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Sample-app harness: scans every app under `samples/` for Lambda runtimes that are past their AWS
// deprecation date (FAIL) or merely not the newest in their family (WARN), plus an outdated
// `aws-cdk-lib` floor (WARN). Runtime status comes from the maintained table in `runtime-policy.json`
// -- there is no live AWS lookup, so the table is the single source of truth to keep current.
//
// A sample may intentionally pin an older runtime by putting `cdk-cicd:allow-runtime <reason>` in a
// comment on the same line as the runtime, or on the line directly above it. That downgrades a FAIL to
// an acknowledged note, so an EOL runtime never lands silently but a deliberate exception is possible.
//
// Security scanning (npm audit / pip audit) is driven by the sibling shell script, which owns the
// package-manager invocations; this script owns the runtime/currency policy. Exit code is non-zero iff
// there is at least one FAIL. The pure classifiers are exported for the unit test in
// `check-samples.test.mjs`; the filesystem scan only runs when this file is the entry point.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const SAMPLES_DIR = join(REPO_ROOT, 'samples');

export const ALLOW = 'cdk-cicd:allow-runtime';

/** Load the policy table (default path is the sibling runtime-policy.json). */
export function loadPolicy(path = join(HERE, 'runtime-policy.json')) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Flatten the policy into a lookup: identifier -> { family, deprecationDate, latestId }. */
export function buildRuntimeIndex(policy) {
  const index = new Map();
  for (const [family, runtimes] of Object.entries(policy.lambda)) {
    if (family === '//') continue;
    const latest = runtimes.find((r) => r.latest)?.id;
    for (const r of runtimes) {
      index.set(r.id, { family, deprecationDate: r.deprecationDate, latestId: latest });
    }
  }
  return index;
}

/**
 * Map a CDK runtime enum member (`NODEJS_20_X`, `PYTHON_3_13`) to its runtime identifier
 * (`nodejs20.x`, `python3.13`). Returns undefined for members we don't recognise as node/python.
 */
export function enumMemberToId(member) {
  let m = /^NODEJS_(\d+)_X$/.exec(member);
  if (m) return `nodejs${m[1]}.x`;
  m = /^PYTHON_(\d+)_(\d+)$/.exec(member);
  if (m) return `python${m[1]}.${m[2]}`;
  return undefined;
}

/**
 * Pure policy decision for one runtime id. Returns `{ level, message }` or null when the runtime is
 * current and latest. `optOut` is whether an allow-runtime marker applies; `asOf` fixes "today" so the
 * decision is deterministic (defaults to the policy's own asOf date).
 */
export function classifyRuntime(id, { index, optOut = false, asOf }) {
  const info = index.get(id);
  if (!info) {
    return { level: 'WARN', message: `runtime '${id}' is not in runtime-policy.json; update the table` };
  }
  const today = new Date(asOf);
  const eol = new Date(info.deprecationDate) <= today;
  if (eol) {
    return optOut
      ? { level: 'WARN', message: `EOL runtime '${id}' (deprecated ${info.deprecationDate}) — allowed via ${ALLOW}` }
      : {
          level: 'FAIL',
          message: `EOL runtime '${id}' (deprecated ${info.deprecationDate}); use '${info.latestId}' or add '${ALLOW} <reason>'`,
        };
  }
  if (info.latestId && id !== info.latestId) {
    return { level: 'WARN', message: `runtime '${id}' is supported but not the latest ${info.family} ('${info.latestId}')` };
  }
  return null;
}

/** True if the runtime on `lines[i]` carries an allow-runtime opt-out on that or the previous line. */
export function hasOptOut(lines, i) {
  return (lines[i] ?? '').includes(ALLOW) || (lines[i - 1] ?? '').includes(ALLOW);
}

/** Every source file under a sample we scan for runtime declarations. */
function sourceFiles(dir) {
  const out = [];
  const skip = new Set(['node_modules', 'cdk.out', '.venv', 'dist', 'build', '__pycache__', '.git']);
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) walk(join(d, entry.name));
      } else if (['.ts', '.py'].includes(extname(entry.name))) {
        out.push(join(d, entry.name));
      }
    }
  };
  walk(dir);
  return out;
}

function scanRuntimes(sample, file, index, asOf, findings) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const enumRe = /Runtime\.([A-Z0-9_]+)/g;
  const idRe = /['"`](nodejs\d+\.x|python\d+\.\d+)['"`]/g;
  const rel = file.replace(REPO_ROOT + '/', '');
  lines.forEach((line, i) => {
    const ids = [];
    for (const m of line.matchAll(enumRe)) {
      const id = enumMemberToId(m[1]);
      if (id) ids.push(id);
    }
    for (const m of line.matchAll(idRe)) ids.push(m[1]);
    for (const id of ids) {
      const verdict = classifyRuntime(id, { index, optOut: hasOptOut(lines, i), asOf });
      if (verdict) findings.push({ ...verdict, sample, file: rel, line: i + 1 });
    }
  });
}

function scanCdkVersion(sample, dir, policy, findings) {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return; // python samples have no package.json
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const declared = pkg.dependencies?.['aws-cdk-lib'] ?? pkg.devDependencies?.['aws-cdk-lib'];
  if (!declared) return;
  const floor = declared.replace(/^[^\d]*/, '').split('.').map(Number);
  const min = policy.cdkMagVersion.awsCdkLib.split('.').map(Number);
  const older = floor[0] < min[0] || (floor[0] === min[0] && (floor[1] < min[1] || (floor[1] === min[1] && floor[2] < min[2])));
  if (older) {
    findings.push({
      level: 'WARN',
      sample,
      file: `samples/${sample}/package.json`,
      line: 0,
      message: `aws-cdk-lib '${declared}' is below the sample floor ^${policy.cdkMagVersion.awsCdkLib}`,
    });
  }
}

export function runHarness() {
  const policy = loadPolicy();
  const index = buildRuntimeIndex(policy);
  const findings = [];
  if (!existsSync(SAMPLES_DIR)) {
    console.error('no samples/ directory');
    return 1;
  }
  const samples = readdirSync(SAMPLES_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  for (const sample of samples) {
    const dir = join(SAMPLES_DIR, sample);
    if (!statSync(dir).isDirectory()) continue;
    for (const file of sourceFiles(dir)) scanRuntimes(sample, file, index, policy.asOf, findings);
    scanCdkVersion(sample, dir, policy, findings);
  }
  const fails = findings.filter((f) => f.level === 'FAIL');
  const warns = findings.filter((f) => f.level === 'WARN');
  for (const f of [...fails, ...warns]) {
    console.log(`[${f.level}] ${f.line > 0 ? `${f.file}:${f.line}` : f.file} — ${f.message}`);
  }
  console.log(`\nRuntime/currency policy: ${fails.length} fail, ${warns.length} warn across ${samples.length} sample(s).`);
  return fails.length > 0 ? 1 : 0;
}

// Only run the scan when invoked directly, so the test file can import the pure functions.
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(runHarness());
}
