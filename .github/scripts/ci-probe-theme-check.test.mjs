// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: required lint checks that the probe theme is current.
 *
 * The visual gate's probe theme is generated from the component docs. A
 * theming target or state documented without regenerating it is one the gate
 * never probes, so lint runs the generator's own --check and names the fix.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterAll, describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const lint = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/lint.yml'), 'utf8'),
);
const steps = lint.jobs.lint.steps;
const check = steps.find(
  step => step.name === 'Check that the probe theme is current',
);
const scratch = [];
afterAll(() => {
  for (const dir of scratch) fs.rmSync(dir, {recursive: true, force: true});
});

// Runs the step's script with a stub `pnpm` that exits with `code`.
function runStep(code) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-check-'));
  scratch.push(dir);
  fs.writeFileSync(
    path.join(dir, 'pnpm'),
    `#!/usr/bin/env bash\necho "pnpm $*"\nexit ${code}\n`,
    {
      mode: 0o755,
    },
  );
  return spawnSync('bash', ['-e', '-c', check.run], {
    encoding: 'utf8',
    env: {...process.env, PATH: `${dir}:${process.env.PATH}`},
  });
}

describe('required lint checks the probe theme', () => {
  it('runs the generator check in full lint, after setup, in the same lanes as ESLint', () => {
    expect(check).toBeDefined();
    expect(check.run).toContain('pnpm -s visual:probe-theme:check');
    expect(check.if).toBe(steps.find(step => step.name === 'Run ESLint').if);
    expect(steps.indexOf(check)).toBeGreaterThan(
      steps.findIndex(step => step.uses === './.github/actions/setup'),
    );
    const scripts = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
    ).scripts;
    expect(scripts['visual:probe-theme:check']).toBe(
      'node .github/scripts/visual-gate/generate-probe-theme.mjs --check',
    );
  });

  it('fails with the command that regenerates the theme, and passes when it is current', () => {
    const stale = runStep(1);
    expect(stale.status).toBe(1);
    expect(stale.stdout).toContain('::error title=Probe theme out of date::');
    expect(stale.stdout).toContain(
      'Run pnpm visual:probe-theme and commit the files it changes in packages/themes/probe/src/.',
    );
    const current = runStep(0);
    expect(current.status).toBe(0);
    expect(current.stdout).not.toContain('::error');
  });

  it('passes on this tree: the committed probe theme matches the component docs', () => {
    const result = spawnSync(
      'node',
      ['.github/scripts/visual-gate/generate-probe-theme.mjs', '--check'],
      {cwd: root, encoding: 'utf8'},
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });
});
