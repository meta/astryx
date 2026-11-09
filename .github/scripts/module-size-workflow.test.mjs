// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contracts for the module size step in CI's build-storybook job.
 * @input `.github/workflows/ci.yml`
 * @output The step's place after the package-size measurement, its scope, and
 *   its exit behavior: warn and pass, fail on a script error, skip without it
 * @position Workflow regression tests for `.github/scripts/module-size.mjs`
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
const steps = ci.jobs['build-storybook'].steps;
const index = name => steps.findIndex(entry => entry.name === name);
const MODULE_STEP = 'Check module size budgets';
const moduleStep = steps[index(MODULE_STEP)];

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, {recursive: true, force: true});
});

/** Runs the step's script in a fresh directory with an optional stub script. */
function runStep(stub) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'module-size-step-'));
  roots.push(root);
  if (stub != null) {
    fs.mkdirSync(path.join(root, '.github/scripts'), {recursive: true});
    fs.writeFileSync(path.join(root, '.github/scripts/module-size.mjs'), stub);
  }
  const summary = path.join(root, 'summary');
  return spawnSync('bash', ['-e', '-c', moduleStep.run], {
    cwd: root,
    encoding: 'utf8',
    env: {...process.env, GITHUB_STEP_SUMMARY: summary},
  });
}

describe('module size step', () => {
  it('runs right after the package-size measurement', () => {
    expect(moduleStep).toBeDefined();
    expect(index(MODULE_STEP)).toBe(
      index('Measure published package size') + 1,
    );
    expect(moduleStep.if).toContain(
      "steps.package-size.outputs.measured == 'true'",
    );
    expect(moduleStep['continue-on-error']).toBeUndefined();
  });

  it('is in the package-size check scope', () => {
    const scope = steps.find(entry => entry.id === 'scope');
    const paths = new RegExp(scope.with.paths);
    expect(paths.test('.github/scripts/module-size.mjs')).toBe(true);
    expect(paths.test('.github/module-size-budgets.json')).toBe(true);
  });

  it('parses as bash', () => {
    const result = spawnSync('bash', ['-n', '-c', moduleStep.run], {
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
  });

  it('passes with the warning when a module is over an advisory budget', () => {
    const result = runStep(
      "console.log('::warning title=Module size over budget::x is 3 B min+gz; its budget is 2 B.');\n",
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('::warning title=Module size over budget');
  });

  it('fails when the script cannot measure a module', () => {
    const result = runStep('process.exit(2);\n');
    expect(result.status).toBe(2);
  });

  it('skips on a head that has no module size script', () => {
    const result = runStep(null);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('no module size check');
  });
});
