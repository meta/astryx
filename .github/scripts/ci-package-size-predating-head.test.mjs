// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ci-package-size-predating-head.test.mjs
 * Contract: a pull request whose head predates the package-size check (the
 * workflow comes from the merge ref, the checkout from the head) skips the
 * check visibly instead of failing build-storybook, and the comparison steps
 * after it run only when the head was measured.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import yaml from 'yaml';

const ROOT = path.resolve(import.meta.dirname, '../..');
const ci = yaml.parse(
  fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8'),
);
const step = (job, name) =>
  ci.jobs[job].steps.find(entry => entry.name === name);
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, {recursive: true, force: true});
});

/** Runs a step's script in a fresh directory; returns its exit, stdout and outputs. */
function runStep(script, setup = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'predating-'));
  roots.push(root);
  setup(root);
  const output = path.join(root, 'github-output');
  fs.writeFileSync(output, '');
  const result = spawnSync('bash', ['-e', '-c', script], {
    cwd: root,
    encoding: 'utf8',
    env: {...process.env, GITHUB_OUTPUT: output, BASE_REF: 'main'},
  });
  return {...result, outputs: fs.readFileSync(output, 'utf8')};
}

describe('package size on a head that predates it', () => {
  const measure = step('build-storybook', 'Measure published package size');

  it('skips with a notice and no measurement when the head has no script', () => {
    const result = runStep(measure.run);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      '::notice title=Head predates the package-size check::',
    );
    expect(result.outputs).not.toContain('measured=true');
  });

  it('measures, and says so, when the head has the script', () => {
    const result = runStep(measure.run, root => {
      fs.mkdirSync(path.join(root, '.github/scripts'), {recursive: true});
      fs.writeFileSync(
        path.join(root, '.github/scripts/package-size.mjs'),
        "import fs from 'node:fs';\nfs.writeFileSync('package-size-head.json', '{}');\n",
      );
    });
    expect(result.status).toBe(0);
    expect(result.outputs).toContain('measured=true');
  });

  it('runs the comparison steps only after a measurement', () => {
    for (const name of [
      'Find the merge base for package size',
      'Compare published package size',
    ]) {
      expect(step('build-storybook', name).if).toContain(
        "steps.package-size.outputs.measured == 'true'",
      );
    }
  });
});
