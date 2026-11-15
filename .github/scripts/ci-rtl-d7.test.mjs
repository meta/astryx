// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract for the RTL audit's D7 regression step in ci.yml.
 *
 * The step runs `.github/scripts/rtl-audit-coarse-hit.browser.test.mjs` from
 * the pull request's head. A head cut before that test existed has no D7
 * native-size enforcement for it to check: the step logs that it skipped and
 * passes. A head that has the file always runs it, and its failure fails the
 * step. The path must name a real file, or a move would skip silently.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const ci = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
);
const D7_TEST = '.github/scripts/rtl-audit-coarse-hit.browser.test.mjs';

function d7Step() {
  for (const job of Object.values(ci.jobs)) {
    const step = (job.steps ?? []).find(
      candidate => candidate.name === 'Verify D7 native target regression',
    );
    if (step != null) {
      return step;
    }
  }
  throw new Error('no "Verify D7 native target regression" step in ci.yml');
}

/**
 * Runs the step's script as Actions does (bash -e) in a scratch checkout,
 * with a stub `pnpm` first on PATH that records its arguments and exits
 * `pnpmExit`.
 */
function run({hasTest, pnpmExit}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-rtl-d7-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const calls = path.join(dir, 'pnpm-calls.txt');
  fs.writeFileSync(
    path.join(bin, 'pnpm'),
    `#!/usr/bin/env bash\necho "$*" >> ${JSON.stringify(calls)}\nexit ${pnpmExit}\n`,
    {mode: 0o755},
  );
  if (hasTest) {
    fs.mkdirSync(path.join(dir, path.dirname(D7_TEST)), {recursive: true});
    fs.writeFileSync(path.join(dir, D7_TEST), '');
  }
  const result = spawnSync('bash', ['-e', '-c', d7Step().run], {
    cwd: dir,
    encoding: 'utf8',
    env: {...process.env, PATH: `${bin}:${process.env.PATH}`},
  });
  const pnpm = fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8') : '';
  fs.rmSync(dir, {recursive: true, force: true});
  return {status: result.status, stdout: result.stdout, pnpm};
}

describe('ci.yml RTL D7 regression step', () => {
  it('names a D7 test that exists, so moving it cannot skip the step silently', () => {
    expect(fs.existsSync(path.join(root, D7_TEST))).toBe(true);
    expect(d7Step().run).toContain(D7_TEST);
  });

  it('runs only for the first core RTL shard, in the browser mode', () => {
    const step = d7Step();
    expect(step.if).toBe(
      "(matrix.package == 'core' && matrix.part == 1) && (steps.scope.outputs.has_rtl_components == 'true' || steps.scope.outputs.has_rtl_harness == 'true' || steps.scope.outputs.force_full_component_audits == 'true')",
    );
    expect(step.env).toEqual({ASTRYX_RTL_BROWSER: '1'});
  });

  it('skips with a visible log when the head predates the D7 test', () => {
    const result = run({hasTest: false, pnpmExit: 1});
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'skipped: head predates D7 native-size enforcement',
    );
    expect(result.pnpm).toBe('');
  });

  it('runs the D7 test when the head has it, and passes when it passes', () => {
    const result = run({hasTest: true, pnpmExit: 0});
    expect(result.status).toBe(0);
    expect(result.pnpm).toContain(`vitest run --project node ${D7_TEST}`);
    expect(result.stdout).not.toContain('skipped');
  });

  it('fails closed when the head has the D7 test and it fails', () => {
    const result = run({hasTest: true, pnpmExit: 1});
    expect(result.status).not.toBe(0);
    expect(result.pnpm).toContain(D7_TEST);
  });
});
