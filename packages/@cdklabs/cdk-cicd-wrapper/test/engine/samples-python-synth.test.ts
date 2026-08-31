// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Sample proof for the Python CI feature. The structural block PASSES TODAY (it only reads the on-disk
// samples). The full `cdk synth` proof is a documented manual step (a jest worker cannot provision a
// Python venv + pip/uv + network), encoded as skipped cases carrying the exact command and the
// DevOps-verified 6-resource expectation. Stable across the CDK_CICD_MODE synth-seam redesign.

import * as fs from 'fs';
import * as path from 'path';

const SAMPLES = path.resolve(__dirname, '../../../../..', 'samples');
const read = (p: string): string => fs.readFileSync(p, 'utf-8');

describe('Python samples — basic (pip) tier: python-pip-proof', () => {
  const dir = path.join(SAMPLES, 'python-pip-proof');

  test('exists with the basic-tier detection anchors', () => {
    expect(fs.existsSync(dir)).toBe(true);
    const cdkJson = JSON.parse(read(path.join(dir, 'cdk.json')));
    expect(cdkJson.app).toMatch(/python/); // python3 app.py
    expect(fs.existsSync(path.join(dir, 'requirements.txt'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'uv.lock'))).toBe(false); // pip tier, not uv
  });

  test('requirements pin aws-cdk-lib + constructs, dev deps carry pytest + pip-audit', () => {
    const req = read(path.join(dir, 'requirements.txt'));
    expect(req).toMatch(/aws-cdk-lib/);
    expect(req).toMatch(/constructs/);
    const dev = read(path.join(dir, 'requirements-dev.txt'));
    expect(dev).toMatch(/pytest/);
    expect(dev).toMatch(/pip-audit/);
  });

  test('ships a pytest unit test using aws_cdk.assertions.Template', () => {
    const t = read(path.join(dir, 'tests/unit/test_python_pip_proof_stack.py'));
    expect(t).toMatch(/Template/);
    expect(t).toMatch(/from_stack/);
  });

  // DevOps-verified: `npx aws-cdk synth` (Node CLI shelling to the Python app) produces a non-empty
  // template with 6 resources. Requires a Python venv + install + Node aws-cdk — not runnable in a jest worker.
  test.skip('cdk synth produces a 6-resource template (manual: python -m venv .venv && pip install -r requirements.txt -r requirements-dev.txt && npx aws-cdk synth)', () => {
    /* manual proof, see README */
  });
});

describe('Python samples — modern (uv) tier: python-uv-proof', () => {
  const dir = path.join(SAMPLES, 'python-uv-proof');

  test('exists with the uv-tier detection anchors (pyproject.toml + committed uv.lock)', () => {
    expect(fs.existsSync(dir)).toBe(true);
    const cdkJson = JSON.parse(read(path.join(dir, 'cdk.json')));
    expect(cdkJson.app).toMatch(/uv run python/);
    expect(fs.existsSync(path.join(dir, 'pyproject.toml'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'uv.lock'))).toBe(true); // committed, not gitignored
  });

  test('pyproject declares aws-cdk-lib + constructs and dev deps pytest/pip-audit/mypy', () => {
    const py = read(path.join(dir, 'pyproject.toml'));
    expect(py).toMatch(/aws-cdk-lib/);
    expect(py).toMatch(/constructs/);
    expect(py).toMatch(/pytest/);
    expect(py).toMatch(/pip-audit/);
    expect(py).toMatch(/mypy/);
  });

  test.skip('cdk synth produces a 6-resource template (manual: uv sync && npx aws-cdk synth)', () => {
    /* manual proof, see README */
  });
});
